-- Finalized quotes (immutable revisions), their PDFs in private storage, and
-- the send log with idempotency.
--
-- Same access model as the admin panel: admins read through RLS; every write
-- goes through SECURITY DEFINER functions that check private.is_admin() first;
-- anon and service_role get nothing. No existing request or draft is modified.
--
-- Errors: RC403 not an admin · RC404 not found · RC409 conflict · RC422 invalid

-- ---------------------------------------------------------------------------
-- Finalized quotes
-- ---------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests (id) on delete restrict,
  -- COT-XXXX-XXXX, derived from the request reference; one per request.
  quote_reference text not null,
  revision integer not null,
  -- The draft this revision was frozen from.
  draft_id uuid not null references public.quote_drafts (id) on delete restrict,
  draft_version integer not null,
  -- Snapshot of the client at finalization.
  business_name text not null,
  contact_name text not null,
  recipient_email text not null,
  -- Snapshot of the content.
  title text not null,
  summary text not null,
  deliverables text not null,
  exclusions text,
  estimated_time text,
  terms text,
  validity text,
  currency text not null default 'USD',
  total_cents bigint not null,
  issued_by uuid references auth.users (id) on delete set null,
  issued_by_email text not null,
  issued_at timestamptz not null default now(),
  -- The PDF generated from this revision (set once, never replaced).
  pdf_path text,
  pdf_sha256 text,
  pdf_size_bytes integer,
  pdf_generated_at timestamptz,
  constraint quotes_revision_unique unique (quote_request_id, revision),
  -- Finalizing the same draft version twice returns the same revision.
  constraint quotes_draft_version_unique unique (quote_request_id, draft_version),
  constraint quotes_revision_positive check (revision >= 1),
  constraint quotes_reference_format check (quote_reference ~ '^COT-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  constraint quotes_currency_check check (currency = 'USD'),
  constraint quotes_total_positive check (total_cents > 0),
  constraint quotes_pdf_all_or_nothing check (
    (pdf_path is null and pdf_sha256 is null and pdf_size_bytes is null and pdf_generated_at is null)
    or (pdf_path is not null and pdf_sha256 is not null and pdf_size_bytes is not null and pdf_generated_at is not null)
  ),
  constraint quotes_pdf_sha256_format check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  constraint quotes_pdf_size check (pdf_size_bytes is null or pdf_size_bytes between 1 and 5242880),
  constraint quotes_lengths_check check (
    char_length(title) between 1 and 200
    and char_length(summary) between 1 and 5000
    and char_length(deliverables) between 1 and 5000
    and char_length(coalesce(exclusions, '')) <= 5000
    and char_length(coalesce(estimated_time, '')) <= 200
    and char_length(coalesce(terms, '')) <= 5000
    and char_length(coalesce(validity, '')) <= 200
    and char_length(coalesce(pdf_path, '')) <= 300
  )
);

create index quotes_request_idx on public.quotes (quote_request_id, revision desc);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete restrict,
  position integer not null,
  description text not null,
  quantity numeric(10, 2) not null,
  unit_price_cents bigint not null,
  -- round(quantity × unit price), half-up to the cent (same rule as lib/admin/money.ts).
  line_total_cents bigint not null,
  constraint quote_items_position_unique unique (quote_id, position),
  constraint quote_items_values_check check (
    char_length(description) between 1 and 500
    and quantity > 0 and quantity <= 100000
    and unit_price_cents between 0 and 100000000
    and line_total_cents >= 0
  )
);

-- Immutability, enforced for every role (including the functions below).
create function private.quotes_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;
  -- Only the PDF columns may be filled in, once.
  if old.pdf_path is not null
    or (to_jsonb(new) - array['pdf_path', 'pdf_sha256', 'pdf_size_bytes', 'pdf_generated_at'])
       is distinct from (to_jsonb(old) - array['pdf_path', 'pdf_sha256', 'pdf_size_bytes', 'pdf_generated_at']) then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;
  return new;
end;
$$;

create function private.quote_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'quote items are immutable' using errcode = 'RC409';
end;
$$;

create trigger quotes_immutable
  before update or delete on public.quotes
  for each row execute function private.quotes_guard_update();

create trigger quote_items_immutable
  before update or delete on public.quote_items
  for each row execute function private.quote_items_guard();

revoke all on function private.quotes_guard_update() from public, anon, authenticated, service_role;
revoke all on function private.quote_items_guard() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Send log
-- ---------------------------------------------------------------------------

create table public.quote_sends (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete restrict,
  -- 'envio' = first send; 'reenvio' = deliberate resend, its own record.
  kind text not null,
  -- Generated when the review page is rendered: a double click or a
  -- concurrent submit of the same page maps to this same row.
  request_key uuid not null,
  recipient_email text not null,
  subject text not null,
  body text not null,
  -- The exact file attached (copied from the quote).
  pdf_path text not null,
  pdf_sha256 text not null,
  -- pendiente: registered, never sent to Resend · en_proceso: call in flight ·
  -- aceptado: Resend accepted it (not "delivered") · fallido: Resend rejected
  -- it or it was confirmed not sent · incierto: unknown whether Resend accepted.
  status text not null default 'pendiente',
  attempts integer not null default 0,
  provider_id text,
  last_error text,
  -- What the acceptance did to the request status.
  status_effect text,
  resolved_manually boolean not null default false,
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_email text not null,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  finished_at timestamptz,
  constraint quote_sends_request_key_unique unique (request_key),
  constraint quote_sends_kind_check check (kind in ('envio', 'reenvio')),
  constraint quote_sends_status_check check (status in ('pendiente', 'en_proceso', 'aceptado', 'fallido', 'incierto')),
  constraint quote_sends_effect_check check (
    status_effect is null
    or status_effect in ('cambiado', 'sin_cambio_propuesta_enviada', 'sin_cambio_aceptada', 'sin_cambio_cerrada')
  ),
  constraint quote_sends_accepted_has_id check (status <> 'aceptado' or provider_id is not null),
  constraint quote_sends_lengths_check check (
    char_length(subject) between 1 and 200
    and char_length(body) between 1 and 5000
    and char_length(recipient_email) between 3 and 254
    and char_length(coalesce(provider_id, '')) <= 100
    and char_length(coalesce(last_error, '')) <= 100
    and pdf_sha256 ~ '^[0-9a-f]{64}$'
  )
);

-- At most one first send per quote that is in flight, uncertain or accepted.
create unique index quote_sends_one_first_send
  on public.quote_sends (quote_id)
  where kind = 'envio' and status in ('pendiente', 'en_proceso', 'aceptado', 'incierto');

-- At most one unfinished send per quote, of any kind.
create unique index quote_sends_one_open
  on public.quote_sends (quote_id)
  where status in ('pendiente', 'en_proceso', 'incierto');

create index quote_sends_quote_idx on public.quote_sends (quote_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS and privileges: admins read; nobody writes directly.
-- ---------------------------------------------------------------------------

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_sends enable row level security;

revoke all on table public.quotes from public, anon, authenticated, service_role;
revoke all on table public.quote_items from public, anon, authenticated, service_role;
revoke all on table public.quote_sends from public, anon, authenticated, service_role;

grant select on table public.quotes to authenticated;
grant select on table public.quote_items to authenticated;
grant select on table public.quote_sends to authenticated;

create policy quotes_admin_select on public.quotes
  for select to authenticated using ((select private.is_admin()));
create policy quote_items_admin_select on public.quote_items
  for select to authenticated using ((select private.is_admin()));
create policy quote_sends_admin_select on public.quote_sends
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Private storage for quote PDFs: admins can upload and read; nobody can
-- overwrite or delete (no update/delete policies). Never public.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-pdfs', 'quote-pdfs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy quote_pdfs_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-pdfs' and (select private.is_admin()));

create policy quote_pdfs_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quote-pdfs' and (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Request status after an accepted send (explicit rule, shown in the UI):
--   nueva, por_aclarar      → propuesta_enviada (+ history)
--   propuesta_enviada       → unchanged
--   aceptada, cerrada       → unchanged (never overwritten by a send)
-- ---------------------------------------------------------------------------

create function private.apply_send_acceptance(p_send_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_status text;
  v_effect text;
begin
  select q.quote_request_id into v_request_id
  from public.quote_sends s join public.quotes q on q.id = s.quote_id
  where s.id = p_send_id;

  select status into v_status from public.quote_requests where id = v_request_id for update;

  if v_status in ('nueva', 'por_aclarar') then
    update public.quote_requests set status = 'propuesta_enviada' where id = v_request_id;
    insert into public.quote_status_history (quote_request_id, from_status, to_status, changed_by, changed_by_email)
    values (v_request_id, v_status, 'propuesta_enviada', (select auth.uid()), private.admin_email());
    v_effect := 'cambiado';
  else
    v_effect := 'sin_cambio_' || v_status;
  end if;

  update public.quote_sends set status_effect = v_effect where id = p_send_id;
  return v_effect;
end;
$$;

revoke all on function private.apply_send_acceptance(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin operations
-- ---------------------------------------------------------------------------

-- Freezes the current draft into a new immutable revision. Fails with RC409 if
-- the draft changed since the admin reviewed it, and RC422 if it is incomplete.
-- Finalizing the same draft version again returns the existing revision.
-- Sends nothing and does not change the request status.
create function public.admin_finalize_quote(p_request_id uuid, p_expected_version integer)
returns table (quote_id uuid, revision integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.quote_drafts;
  v_request public.quote_requests;
  v_existing public.quotes;
  v_items integer;
  v_total bigint;
  v_revision integer;
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;

  select * into v_request from public.quote_requests where id = p_request_id;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;

  -- Lock the draft: no save can slip in between validation and the snapshot.
  select * into v_draft from public.quote_drafts where quote_request_id = p_request_id for update;
  if not found then
    raise exception 'no_draft' using errcode = 'RC404';
  end if;
  if v_draft.version is distinct from p_expected_version then
    raise exception 'draft_changed' using errcode = 'RC409';
  end if;

  select * into v_existing from public.quotes
  where quote_request_id = p_request_id and draft_version = v_draft.version;
  if found then
    return query select v_existing.id, v_existing.revision, false;
    return;
  end if;

  if v_draft.title is null or v_draft.summary is null or v_draft.deliverables is null then
    raise exception 'incomplete_draft' using errcode = 'RC422';
  end if;

  select count(*), coalesce(sum(round(quantity * unit_price_cents)), 0)
  into v_items, v_total
  from public.quote_draft_items where draft_id = v_draft.id;

  if v_items = 0 or exists (
    select 1 from public.quote_draft_items
    where draft_id = v_draft.id
      and (description is null or quantity is null or quantity <= 0 or unit_price_cents is null or unit_price_cents < 0)
  ) then
    raise exception 'incomplete_items' using errcode = 'RC422';
  end if;
  if v_total <= 0 then
    raise exception 'zero_total' using errcode = 'RC422';
  end if;

  -- Serialize revisions per request.
  perform 1 from public.quote_requests where id = p_request_id for update;
  select coalesce(max(q.revision), 0) + 1 into v_revision from public.quotes q where q.quote_request_id = p_request_id;

  insert into public.quotes (
    quote_request_id, quote_reference, revision, draft_id, draft_version,
    business_name, contact_name, recipient_email,
    title, summary, deliverables, exclusions, estimated_time, terms, validity,
    total_cents, issued_by, issued_by_email
  ) values (
    p_request_id, 'COT-' || substr(v_request.reference, 4), v_revision, v_draft.id, v_draft.version,
    v_request.business_name, v_request.contact_name, v_request.email,
    v_draft.title, v_draft.summary, v_draft.deliverables, v_draft.exclusions, v_draft.estimated_time,
    v_draft.terms, v_draft.validity,
    v_total, (select auth.uid()), private.admin_email()
  )
  returning id into v_id;

  insert into public.quote_items (quote_id, position, description, quantity, unit_price_cents, line_total_cents)
  select v_id, row_number() over (order by i.position) - 1, i.description, i.quantity, i.unit_price_cents,
         round(i.quantity * i.unit_price_cents)
  from public.quote_draft_items i
  where i.draft_id = v_draft.id;

  return query select v_id, v_revision, true;
end;
$$;

-- Records the PDF generated for a revision. Set once; a different file for a
-- revision that already has one is rejected.
create function public.admin_attach_quote_pdf(p_quote_id uuid, p_path text, p_sha256 text, p_size integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_path is null or p_path !~ ('^' || p_quote_id::text || '/[a-z0-9-]+\.pdf$')
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_size is null or p_size not between 1 and 5242880 then
    raise exception 'invalid_pdf' using errcode = 'RC422';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if v_quote.pdf_path is not null then
    if v_quote.pdf_path = p_path and v_quote.pdf_sha256 = p_sha256 then
      return;
    end if;
    raise exception 'pdf_already_set' using errcode = 'RC409';
  end if;

  update public.quotes
  set pdf_path = p_path, pdf_sha256 = p_sha256, pdf_size_bytes = p_size, pdf_generated_at = now()
  where id = p_quote_id;
end;
$$;

-- Registers a send (status 'pendiente'). The same request key returns the
-- existing row, so a double click or concurrent submit never creates two.
-- The recipient always comes from the quote snapshot: it cannot be changed here.
create function public.admin_begin_quote_send(
  p_quote_id uuid,
  p_request_key uuid,
  p_kind text,
  p_subject text,
  p_body text
)
returns table (send_id uuid, status text, existing boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_row public.quote_sends;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_kind is null or p_kind not in ('envio', 'reenvio') or p_request_key is null
    or p_subject is null or char_length(btrim(p_subject)) not between 1 and 200
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then
    raise exception 'invalid_send' using errcode = 'RC422';
  end if;

  -- One send decision at a time per quote.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;

  select * into v_row from public.quote_sends where request_key = p_request_key;
  if found then
    if v_row.quote_id <> p_quote_id then
      raise exception 'request_key_reused' using errcode = 'RC409';
    end if;
    return query select v_row.id, v_row.status, true;
    return;
  end if;

  if v_quote.pdf_path is null then
    raise exception 'pdf_missing' using errcode = 'RC422';
  end if;
  if exists (select 1 from public.quote_sends s
             where s.quote_id = p_quote_id and s.status in ('pendiente', 'en_proceso', 'incierto')) then
    raise exception 'send_in_progress' using errcode = 'RC409';
  end if;
  if p_kind = 'envio' and exists (select 1 from public.quote_sends s
                                  where s.quote_id = p_quote_id and s.kind = 'envio' and s.status = 'aceptado') then
    raise exception 'already_sent' using errcode = 'RC409';
  end if;
  if p_kind = 'reenvio' and not exists (select 1 from public.quote_sends s
                                        where s.quote_id = p_quote_id and s.status = 'aceptado') then
    raise exception 'nothing_to_resend' using errcode = 'RC409';
  end if;

  insert into public.quote_sends (
    quote_id, kind, request_key, recipient_email, subject, body, pdf_path, pdf_sha256,
    requested_by, requested_by_email
  ) values (
    p_quote_id, p_kind, p_request_key, v_quote.recipient_email, btrim(p_subject), btrim(p_body),
    v_quote.pdf_path, v_quote.pdf_sha256, (select auth.uid()), private.admin_email()
  )
  returning * into v_row;

  return query select v_row.id, v_row.status, false;
end;
$$;

-- Takes the right to call Resend for a send. Only one caller wins.
--   'nuevo'       : from 'pendiente'.
--   'reconciliar' : from 'incierto' or a stale 'en_proceso' (> 2 min), only
--                   while Resend still honors the idempotency key (< 23 h), so
--                   repeating the call cannot send a second email.
create function public.admin_claim_quote_send(p_send_id uuid, p_mode text)
returns table (claimed boolean, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.quote_sends;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_mode is null or p_mode not in ('nuevo', 'reconciliar') then
    raise exception 'invalid_mode' using errcode = 'RC422';
  end if;

  select * into v_row from public.quote_sends where id = p_send_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;

  if p_mode = 'reconciliar' and v_row.created_at < now() - interval '23 hours'
     and (v_row.status = 'incierto' or v_row.status = 'en_proceso') then
    raise exception 'idempotency_window_expired' using errcode = 'RC409';
  end if;

  if (p_mode = 'nuevo' and v_row.status = 'pendiente')
     or (p_mode = 'reconciliar' and (v_row.status = 'incierto'
         or (v_row.status = 'en_proceso' and v_row.last_attempt_at < now() - interval '2 minutes'))) then
    update public.quote_sends
    set status = 'en_proceso', attempts = quote_sends.attempts + 1, last_attempt_at = now()
    where id = p_send_id
    returning * into v_row;
    return query select true, v_row.attempts;
    return;
  end if;

  return query select false, v_row.attempts;
end;
$$;

-- Records what Resend answered. On acceptance, applies the request status rule
-- and its history in the same transaction.
create function public.admin_finish_quote_send(
  p_send_id uuid,
  p_outcome text,
  p_provider_id text,
  p_error text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.quote_sends;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_outcome is null or p_outcome not in ('aceptado', 'fallido', 'incierto')
    or (p_outcome = 'aceptado' and (p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,100}$'))
    or char_length(coalesce(p_error, '')) > 100 then
    raise exception 'invalid_outcome' using errcode = 'RC422';
  end if;

  select * into v_row from public.quote_sends where id = p_send_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if v_row.status <> 'en_proceso' then
    raise exception 'not_in_progress' using errcode = 'RC409';
  end if;

  update public.quote_sends set
    status = p_outcome,
    provider_id = case when p_outcome = 'aceptado' then p_provider_id else provider_id end,
    last_error = case when p_outcome = 'aceptado' then null else p_error end,
    accepted_at = case when p_outcome = 'aceptado' then now() else accepted_at end,
    finished_at = case when p_outcome = 'incierto' then null else now() end
  where id = p_send_id;

  if p_outcome = 'aceptado' then
    return private.apply_send_acceptance(p_send_id);
  end if;
  return null;
end;
$$;

-- Manual reconciliation of an uncertain send, after checking the Resend
-- dashboard: 'aceptado' (with the email ID shown there) or 'no_enviado'.
-- Never calls Resend.
create function public.admin_resolve_quote_send(p_send_id uuid, p_resolution text, p_provider_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.quote_sends;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_resolution is null or p_resolution not in ('aceptado', 'no_enviado')
    or (p_resolution = 'aceptado' and (p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,100}$')) then
    raise exception 'invalid_resolution' using errcode = 'RC422';
  end if;

  select * into v_row from public.quote_sends where id = p_send_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if not (v_row.status = 'incierto'
          or (v_row.status = 'en_proceso' and v_row.last_attempt_at < now() - interval '2 minutes')) then
    raise exception 'not_uncertain' using errcode = 'RC409';
  end if;

  if p_resolution = 'aceptado' then
    update public.quote_sends set
      status = 'aceptado', provider_id = p_provider_id, last_error = null,
      accepted_at = now(), finished_at = now(), resolved_manually = true
    where id = p_send_id;
    return private.apply_send_acceptance(p_send_id);
  end if;

  update public.quote_sends set
    status = 'fallido', last_error = 'conciliado_no_enviado', finished_at = now(), resolved_manually = true
  where id = p_send_id;
  return null;
end;
$$;

revoke all on function public.admin_finalize_quote(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_attach_quote_pdf(uuid, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_begin_quote_send(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_claim_quote_send(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_finish_quote_send(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_resolve_quote_send(uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.admin_finalize_quote(uuid, integer) to authenticated;
grant execute on function public.admin_attach_quote_pdf(uuid, text, text, integer) to authenticated;
grant execute on function public.admin_begin_quote_send(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.admin_claim_quote_send(uuid, text) to authenticated;
grant execute on function public.admin_finish_quote_send(uuid, text, text, text) to authenticated;
grant execute on function public.admin_resolve_quote_send(uuid, text, text) to authenticated;
