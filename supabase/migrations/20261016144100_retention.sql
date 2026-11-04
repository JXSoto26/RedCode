-- Retention support (operational privacy decisions, not legal requirements):
-- unconverted requests are deleted after 12 months without documented
-- commercial activity, by an operator-run CLI (scripts/retention.ts).
--
-- Adds, without modifying existing data:
-- - relationship: prospecto | cliente_activo | cerrado (separate from the
--   commercial status; "aceptada" does not describe the whole project).
-- - last_activity_at: last significant, documented commercial action. Only
--   triggers on admin actions move it; reads, retries and automatic tasks don't.
-- - retention hold: documented obligation or dispute (reason required).
-- - an administrative deletion path for a whole file (expediente), usable only
--   by the database owner through private functions; normal use keeps quotes
--   immutable and nobody gets new grants.

-- ---------------------------------------------------------------------------
-- New columns on quote_requests (existing rows are backfilled, not changed)
-- ---------------------------------------------------------------------------

alter table public.quote_requests
  add column relationship text not null default 'prospecto',
  add column relationship_changed_at timestamptz,
  add column last_activity_at timestamptz,
  add column last_activity_kind text,
  add column retention_hold boolean not null default false,
  add column retention_hold_reason text,
  add column retention_hold_set_at timestamptz,
  add column deletion_pending_at timestamptz;

alter table public.quote_requests
  add constraint quote_requests_relationship_check check (relationship in ('prospecto', 'cliente_activo', 'cerrado')),
  add constraint quote_requests_activity_kind_check check (
    last_activity_kind is null or last_activity_kind in (
      'solicitud_recibida', 'cambio_estado', 'nota', 'borrador', 'cotizacion_finalizada', 'envio_aceptado', 'cambio_relacion'
    )
  ),
  add constraint quote_requests_hold_reason_check check (
    (retention_hold and char_length(btrim(coalesce(retention_hold_reason, ''))) between 3 and 300)
    or (not retention_hold)
  );

-- Last documented activity of existing requests, from their own records.
update public.quote_requests r set
  last_activity_at = greatest(
    r.created_at,
    (select max(changed_at) from public.quote_status_history h where h.quote_request_id = r.id),
    (select max(created_at) from public.quote_notes n where n.quote_request_id = r.id),
    (select max(updated_at) from public.quote_drafts d where d.quote_request_id = r.id),
    (select max(issued_at) from public.quotes q where q.quote_request_id = r.id),
    (select max(s.accepted_at) from public.quote_sends s join public.quotes q on q.id = s.quote_id
       where q.quote_request_id = r.id and s.status = 'aceptado')
  ),
  last_activity_kind = 'solicitud_recibida';

alter table public.quote_requests
  alter column last_activity_at set not null,
  alter column last_activity_at set default now(),
  alter column last_activity_kind set default 'solicitud_recibida';

create index quote_requests_retention_idx on public.quote_requests (relationship, last_activity_at)
  where not retention_hold;

-- ---------------------------------------------------------------------------
-- Activity: only significant, documented commercial actions move it
-- ---------------------------------------------------------------------------

create function private.touch_request_activity(p_request_id uuid, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quote_requests
  set last_activity_at = now(), last_activity_kind = p_kind
  where id = p_request_id;
$$;

create function private.activity_from_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'quote_status_history' then
    perform private.touch_request_activity(new.quote_request_id, 'cambio_estado');
  elsif tg_table_name = 'quote_notes' then
    perform private.touch_request_activity(new.quote_request_id, 'nota');
  elsif tg_table_name = 'quote_drafts' then
    -- Only an actual save (new row or new version), not other updates.
    if tg_op = 'INSERT' or new.version is distinct from old.version then
      perform private.touch_request_activity(new.quote_request_id, 'borrador');
    end if;
  elsif tg_table_name = 'quotes' then
    perform private.touch_request_activity(new.quote_request_id, 'cotizacion_finalizada');
  elsif tg_table_name = 'quote_sends' then
    -- Only when Resend accepted it; attempts, failures and uncertain results don't count.
    if new.status = 'aceptado' and old.status is distinct from 'aceptado' then
      perform private.touch_request_activity((select quote_request_id from public.quotes where id = new.quote_id), 'envio_aceptado');
    end if;
  end if;
  return null;
end;
$$;

create trigger activity_status_history after insert on public.quote_status_history
  for each row execute function private.activity_from_child();
create trigger activity_notes after insert on public.quote_notes
  for each row execute function private.activity_from_child();
create trigger activity_drafts after insert or update on public.quote_drafts
  for each row execute function private.activity_from_child();
create trigger activity_quotes after insert on public.quotes
  for each row execute function private.activity_from_child();
create trigger activity_sends after update of status on public.quote_sends
  for each row execute function private.activity_from_child();

-- ---------------------------------------------------------------------------
-- A file being deleted cannot receive new data (concurrency guard)
-- ---------------------------------------------------------------------------

create function private.retention_context(p_request_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('redcode.retention_request', true), '') = p_request_id::text;
$$;

create function private.block_if_deletion_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request uuid;
begin
  v_request := case tg_table_name
    when 'quote_sends' then (select quote_request_id from public.quotes where id = new.quote_id)
    else new.quote_request_id
  end;
  if exists (select 1 from public.quote_requests where id = v_request and deletion_pending_at is not null) then
    raise exception 'deletion_in_progress' using errcode = 'RC409';
  end if;
  return new;
end;
$$;

create trigger pending_status_history before insert on public.quote_status_history
  for each row execute function private.block_if_deletion_pending();
create trigger pending_notes before insert on public.quote_notes
  for each row execute function private.block_if_deletion_pending();
create trigger pending_drafts before insert or update on public.quote_drafts
  for each row execute function private.block_if_deletion_pending();
create trigger pending_quotes before insert on public.quotes
  for each row execute function private.block_if_deletion_pending();
create trigger pending_sends before insert or update on public.quote_sends
  for each row execute function private.block_if_deletion_pending();

create function private.block_request_update_if_pending()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deletion_pending_at is not null and not private.retention_context(old.id) then
    raise exception 'deletion_in_progress' using errcode = 'RC409';
  end if;
  return new;
end;
$$;

create trigger quote_requests_pending_guard before update on public.quote_requests
  for each row execute function private.block_request_update_if_pending();

-- ---------------------------------------------------------------------------
-- Immutability: unchanged in normal use; the retention path may delete a
-- whole file (only the database owner can reach it: nobody has DELETE grants).
-- ---------------------------------------------------------------------------

create or replace function private.quotes_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable constant text[] := array['pdf_path', 'pdf_sha256', 'pdf_size_bytes', 'pdf_generated_at', 'issued_by'];
begin
  if tg_op = 'DELETE' then
    if private.retention_context(old.quote_request_id) then
      return old;
    end if;
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;

  -- issued_by may only be cleared (user removed), never reassigned.
  if new.issued_by is distinct from old.issued_by and new.issued_by is not null then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;

  -- The PDF columns may be filled in once; nothing else may change.
  if (old.pdf_path is not null
      and (new.pdf_path, new.pdf_sha256, new.pdf_size_bytes, new.pdf_generated_at)
          is distinct from (old.pdf_path, old.pdf_sha256, old.pdf_size_bytes, old.pdf_generated_at))
    or (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;
  return new;
end;
$$;

create or replace function private.quote_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and private.retention_context((select quote_request_id from public.quotes where id = old.quote_id)) then
    return old;
  end if;
  raise exception 'quote items are immutable' using errcode = 'RC409';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: relationship and documented retention hold
-- ---------------------------------------------------------------------------

create function public.admin_set_relationship(p_request_id uuid, p_expected text, p_new text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_new is null or p_new not in ('prospecto', 'cliente_activo', 'cerrado') then
    raise exception 'invalid_relationship' using errcode = 'RC422';
  end if;
  select relationship into v_current from public.quote_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if v_current is distinct from p_expected then
    raise exception 'relationship_conflict' using errcode = 'RC409';
  end if;
  if v_current = p_new then
    return v_current;
  end if;
  update public.quote_requests
  set relationship = p_new, relationship_changed_at = now(),
      last_activity_at = now(), last_activity_kind = 'cambio_relacion'
  where id = p_request_id;
  return p_new;
end;
$$;

-- A documented legal obligation or dispute. Not commercial activity.
create function public.admin_set_retention_hold(p_request_id uuid, p_hold boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_hold is null or (p_hold and (p_reason is null or char_length(btrim(p_reason)) not between 3 and 300)) then
    raise exception 'invalid_hold' using errcode = 'RC422';
  end if;
  update public.quote_requests
  set retention_hold = p_hold,
      retention_hold_reason = case when p_hold then btrim(p_reason) else null end,
      retention_hold_set_at = now()
  where id = p_request_id;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
end;
$$;

revoke all on function public.admin_set_relationship(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_retention_hold(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_relationship(uuid, text, text) to authenticated;
grant execute on function public.admin_set_retention_hold(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Retention review and deletion (owner only, via the CLI)
-- ---------------------------------------------------------------------------

-- Minimal execution log: no deleted content, no personal identifiers. The
-- request id is kept so files can be deleted again after a backup restore.
create table private.retention_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  as_of timestamptz not null,
  status text not null default 'en_curso',
  -- Storage paths of the PDFs to remove ("<quote uuid>/cotizacion-rev-N.pdf");
  -- cleared once the file is deleted.
  pdf_paths text[] not null default '{}',
  counts jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint retention_jobs_status_check check (status in ('en_curso', 'completado'))
);

create unique index retention_jobs_one_open on private.retention_jobs (request_id) where status = 'en_curso';

revoke all on table private.retention_jobs from public, anon, authenticated, service_role;

-- Every request with the decision and its reasons, as of a given moment.
create function private.retention_review(p_as_of timestamptz default now())
returns table (
  request_id uuid,
  reference text,
  created_at timestamptz,
  last_activity_at timestamptz,
  last_activity_kind text,
  relationship text,
  status text,
  eligible boolean,
  reasons text[],
  notes integer,
  history integer,
  drafts integer,
  quotes integer,
  pdfs integer,
  sends integer
)
language sql
stable
set search_path = ''
as $$
  with base as (
    select r.*,
      (select count(*) from public.quote_notes n where n.quote_request_id = r.id)::int as n_notes,
      (select count(*) from public.quote_status_history h where h.quote_request_id = r.id)::int as n_history,
      (select count(*) from public.quote_drafts d where d.quote_request_id = r.id)::int as n_drafts,
      (select count(*) from public.quotes q where q.quote_request_id = r.id)::int as n_quotes,
      (select count(*) from public.quotes q where q.quote_request_id = r.id and q.pdf_path is not null)::int as n_pdfs,
      (select count(*) from public.quote_sends s join public.quotes q on q.id = s.quote_id where q.quote_request_id = r.id)::int as n_sends,
      exists (select 1 from public.quote_sends s join public.quotes q on q.id = s.quote_id
              where q.quote_request_id = r.id and s.status in ('pendiente', 'en_proceso', 'incierto')) as open_send
    from public.quote_requests r
  ),
  decided as (
    select b.*, array_remove(array[
      case when b.relationship = 'cliente_activo' then 'excluida:cliente_activo' end,
      case when b.relationship = 'cerrado' then 'excluida:relacion_cerrada_revision_manual' end,
      case when b.retention_hold then 'excluida:conservacion_documentada' end,
      case when b.open_send then 'excluida:envio_pendiente_o_incierto' end,
      case when b.status = 'aceptada' and b.relationship = 'prospecto' then 'excluida:estado_aceptada_revisar_relacion' end,
      case when b.deletion_pending_at is not null then 'eliminacion_en_curso' end,
      case when b.last_activity_at > p_as_of - interval '12 months' then 'excluida:actividad_en_ultimos_12_meses' end
    ], null) as excl
    from base b
  )
  select d.id, d.reference, d.created_at, d.last_activity_at, d.last_activity_kind, d.relationship, d.status,
    cardinality(d.excl) = 0,
    case when cardinality(d.excl) = 0 then array['incluida:prospecto_sin_actividad_12_meses'] else d.excl end,
    d.n_notes, d.n_history, d.n_drafts, d.n_quotes, d.n_pdfs, d.n_sends
  from decided d
  order by d.last_activity_at;
$$;

-- Starts deleting one file: re-checks eligibility under a row lock, blocks
-- new data, and records the PDFs to remove. Resumes an open job if any.
create function private.retention_begin(p_request_id uuid, p_as_of timestamptz)
returns table (job_id uuid, pdf_paths text[], resumed boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_job private.retention_jobs;
  v_review record;
begin
  select * into v_job from private.retention_jobs j where j.request_id = p_request_id and j.status = 'en_curso';
  if found then
    return query select v_job.id, v_job.pdf_paths, true;
    return;
  end if;

  perform 1 from public.quote_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  select * into v_review from private.retention_review(p_as_of) rv where rv.request_id = p_request_id;
  if not v_review.eligible then
    raise exception 'not_eligible: %', array_to_string(v_review.reasons, ',') using errcode = 'RC409';
  end if;

  perform set_config('redcode.retention_request', p_request_id::text, true);
  update public.quote_requests set deletion_pending_at = now() where id = p_request_id;

  insert into private.retention_jobs (request_id, as_of, pdf_paths)
  values (
    p_request_id, p_as_of,
    coalesce((select array_agg(q.pdf_path order by q.revision) from public.quotes q
              where q.quote_request_id = p_request_id and q.pdf_path is not null), '{}')
  )
  returning * into v_job;

  return query select v_job.id, v_job.pdf_paths, false;
end;
$$;

-- Finishes a job after its PDFs were removed from Storage: deletes every row
-- of the file and keeps only counts in the job log.
create function private.retention_finish(p_job_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_job private.retention_jobs;
  v_quotes uuid[];
  v_drafts uuid[];
  n_sends integer;
  n_items integer;
  n_quotes integer;
  n_draft_items integer;
  n_drafts integer;
  n_notes integer;
  n_history integer;
  v_counts jsonb;
begin
  select * into v_job from private.retention_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'en_curso' then
    raise exception 'job_not_open' using errcode = 'RC409';
  end if;

  -- Lets the immutability guards accept deletes for this file only.
  perform set_config('redcode.retention_request', v_job.request_id::text, true);

  select coalesce(array_agg(id), '{}') into v_quotes from public.quotes where quote_request_id = v_job.request_id;
  select coalesce(array_agg(id), '{}') into v_drafts from public.quote_drafts where quote_request_id = v_job.request_id;

  -- One statement per table, children first (FKs are ON DELETE RESTRICT).
  delete from public.quote_sends where quote_id = any(v_quotes);
  get diagnostics n_sends = row_count;
  delete from public.quote_items where quote_id = any(v_quotes);
  get diagnostics n_items = row_count;
  delete from public.quotes where id = any(v_quotes);
  get diagnostics n_quotes = row_count;
  delete from public.quote_draft_items where draft_id = any(v_drafts);
  get diagnostics n_draft_items = row_count;
  delete from public.quote_drafts where id = any(v_drafts);
  get diagnostics n_drafts = row_count;
  delete from public.quote_notes where quote_request_id = v_job.request_id;
  get diagnostics n_notes = row_count;
  delete from public.quote_status_history where quote_request_id = v_job.request_id;
  get diagnostics n_history = row_count;
  delete from public.quote_requests where id = v_job.request_id;

  update private.retention_jobs
  set status = 'completado',
      finished_at = now(),
      pdf_paths = '{}',
      counts = jsonb_build_object(
        'solicitudes', 1, 'notas', n_notes, 'historial', n_history, 'borradores', n_drafts,
        'partidas_borrador', n_draft_items, 'revisiones', n_quotes, 'partidas_finalizadas', n_items,
        'envios', n_sends, 'pdfs', cardinality(v_job.pdf_paths)
      )
  where id = p_job_id
  returning counts into v_counts;
  return v_counts;
end;
$$;

revoke all on function private.retention_review(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.retention_begin(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.retention_finish(uuid) from public, anon, authenticated, service_role;
revoke all on function private.touch_request_activity(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.activity_from_child() from public, anon, authenticated, service_role;
revoke all on function private.block_if_deletion_pending() from public, anon, authenticated, service_role;
revoke all on function private.block_request_update_if_pending() from public, anon, authenticated, service_role;
revoke all on function private.retention_context(uuid) from public, anon, authenticated, service_role;
