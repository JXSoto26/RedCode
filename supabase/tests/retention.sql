-- Real checks for retention support, against Supabase DEV (npm run test:db).
-- One transaction, rolled back: no fixture persists, no email is sent, and
-- existing requests are never touched (every check filters by fixture id).

begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-retention-test@example.com', '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'user-retention-test@example.com', '{}', '{}', now(), now());
insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-0000000000a3');

-- r1: the file we exercise; r2..r7: one per exclusion; r8: eligible bystander.
insert into public.quote_requests (
  id, reference, idempotency_key, payload_hash, contact_name, business_name, email, business_type,
  service, goal, logo_status, copy_status, photos_status, consent_accepted, consent_version, consented_at
)
select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       'RC-RT0' || n || '-TEST', ('00000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, 'hash',
       'PRUEBA retención', 'PRUEBA retención ' || n, 'retencion' || n || '@example.com', 'otro',
       'landing_page', 'Objetivo', 'disponible', 'disponible', 'disponible', true, 'test', now()
from generate_series(1, 8) n;

do $$
begin
  if (select count(*) from public.quote_requests where reference like 'RC-RT0_-TEST'
      and relationship = 'prospecto' and not retention_hold and last_activity_kind = 'solicitud_recibida'
      and last_activity_at is not null) <> 8 then
    raise exception 'FAIL: new requests must start as prospecto with activity = created';
  end if;
end $$;

-- Activity: which admin actions move it -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a3"}', true);

do $$
declare
  r uuid := '00000000-0000-4000-8000-000000000301';
  v integer;
  q uuid;
  s uuid;
  k text;
begin
  -- Helper: move activity back so each step shows whether it advanced.
  -- (done as the owner below via reset role; here we only read)
  perform public.admin_set_quote_status(r, 'nueva', 'por_aclarar');
  select last_activity_kind into k from public.quote_requests where id = r;
  if k <> 'cambio_estado' then raise exception 'FAIL: status change is activity (%).', k; end if;
  -- Leave it in propuesta_enviada so accepting the send below does not also
  -- change the status: that isolates the send trigger.
  perform public.admin_set_quote_status(r, 'por_aclarar', 'propuesta_enviada');

  perform public.admin_add_quote_note(r, 'Llamada documentada');
  select last_activity_kind into k from public.quote_requests where id = r;
  if k <> 'nota' then raise exception 'FAIL: note is activity'; end if;

  v := public.admin_save_quote_draft(r, null, '{"title":"T","summary":"S","deliverables":"D"}',
       '[{"description":"Diseño","quantity":"1","unitPriceCents":"1000"}]');
  select last_activity_kind into k from public.quote_requests where id = r;
  if k <> 'borrador' then raise exception 'FAIL: draft save is activity'; end if;

  select quote_id into q from public.admin_finalize_quote(r, v);
  select last_activity_kind into k from public.quote_requests where id = r;
  if k <> 'cotizacion_finalizada' then raise exception 'FAIL: finalize is activity'; end if;

  perform public.admin_attach_quote_pdf(q, q::text || '/cotizacion-rev-1.pdf', repeat('a', 64), 100);
  select send_id into s from public.admin_begin_quote_send(q, gen_random_uuid(), 'envio', 'Asunto', 'Cuerpo', 'RedCode <x@example.com>', null);
  perform public.admin_claim_quote_send(s, 'nuevo');
  perform public.admin_finish_quote_send(s, 'aceptado', 'test-id-1', null);
  select last_activity_kind into k from public.quote_requests where id = r;
  if k <> 'envio_aceptado' then raise exception 'FAIL: accepted send is activity (%).', k; end if;

  perform public.admin_set_relationship(r, 'prospecto', 'cliente_activo');
  select last_activity_kind into k from public.quote_requests where id = r;
  if k <> 'cambio_relacion' then raise exception 'FAIL: relationship change is activity'; end if;
  perform public.admin_set_relationship(r, 'cliente_activo', 'prospecto');
end $$;

reset role;

-- Not activity: reads, PDF attach, failed/uncertain sends, holds, notifications.
do $$
declare
  r uuid := '00000000-0000-4000-8000-000000000301';
  q uuid := (select id from public.quotes where quote_request_id = '00000000-0000-4000-8000-000000000301');
  t0 timestamptz := now() - interval '2 years';
  t1 timestamptz;
begin
  update public.quote_requests set last_activity_at = t0, last_activity_kind = 'nota' where id = r;

  -- Public flow updating notification fields (service_role path).
  update public.quote_requests set visitor_email_attempts = visitor_email_attempts + 1 where id = r;
  -- A resend that fails / is uncertain is not activity.
  insert into public.quote_sends (quote_id, kind, request_key, recipient_email, subject, body, pdf_path, pdf_sha256,
                                  requested_by_email, status, sender)
  values (q, 'reenvio', gen_random_uuid(), 'x@example.com', 's', 'b', 'p', repeat('a', 64), 'x', 'en_proceso', 'x');
  update public.quote_sends set status = 'incierto' where quote_id = q and kind = 'reenvio';
  update public.quote_sends set status = 'fallido' where quote_id = q and kind = 'reenvio';
  perform * from public.quote_requests where id = r;

  select last_activity_at into t1 from public.quote_requests where id = r;
  if t1 <> t0 then raise exception 'FAIL: non-commercial events moved activity'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a3"}', true);
do $$
declare
  t0 timestamptz := (select last_activity_at from public.quote_requests where id = '00000000-0000-4000-8000-000000000301');
begin
  perform public.admin_set_retention_hold('00000000-0000-4000-8000-000000000301', true, 'Disputa documentada de prueba');
  perform public.admin_set_retention_hold('00000000-0000-4000-8000-000000000301', false, null);
  if (select last_activity_at from public.quote_requests where id = '00000000-0000-4000-8000-000000000301') <> t0 then
    raise exception 'FAIL: a retention hold is not commercial activity';
  end if;
  begin
    perform public.admin_set_retention_hold('00000000-0000-4000-8000-000000000302', true, ' ');
    raise exception 'FAIL: hold without reason accepted';
  exception when sqlstate 'RC422' then null;
  end;
end $$;
reset role;

-- 12-month rule and exclusions --------------------------------------------------
do $$
declare
  as_of timestamptz := now();
  rv record;
begin
  -- r1 (has drafts, quote, PDF, sends), r8 bystander: > 12 months.
  update public.quote_requests set last_activity_at = as_of - interval '12 months' - interval '1 day'
  where id in ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000308');
  -- r2: exactly 12 months → eligible (the review runs on/after the anniversary).
  update public.quote_requests set last_activity_at = as_of - interval '12 months' where id = '00000000-0000-4000-8000-000000000302';
  -- r3: 11 months → recent.
  update public.quote_requests set last_activity_at = as_of - interval '11 months' where id = '00000000-0000-4000-8000-000000000303';
  -- r4: active client; r5: closed; r6: hold; r7: accepted status; all old.
  update public.quote_requests set last_activity_at = as_of - interval '3 years'
  where id in ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000305',
               '00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000307');
  update public.quote_requests set relationship = 'cliente_activo' where id = '00000000-0000-4000-8000-000000000304';
  update public.quote_requests set relationship = 'cerrado' where id = '00000000-0000-4000-8000-000000000305';
  update public.quote_requests set retention_hold = true, retention_hold_reason = 'Obligación documentada' where id = '00000000-0000-4000-8000-000000000306';
  update public.quote_requests set status = 'aceptada' where id = '00000000-0000-4000-8000-000000000307';

  for rv in select * from private.retention_review(as_of) where reference like 'RC-RT0_-TEST' order by reference loop
    if rv.reference in ('RC-RT01-TEST', 'RC-RT02-TEST', 'RC-RT08-TEST') then
      if not rv.eligible or rv.reasons <> array['incluida:prospecto_sin_actividad_12_meses'] then
        raise exception 'FAIL: % should be eligible (%).', rv.reference, rv.reasons;
      end if;
    else
      if rv.eligible then raise exception 'FAIL: % should be excluded.', rv.reference; end if;
    end if;
  end loop;

  select * into rv from private.retention_review(as_of) where reference = 'RC-RT03-TEST';
  if not 'excluida:actividad_en_ultimos_12_meses' = any(rv.reasons) then raise exception 'FAIL: recent reason'; end if;
  select * into rv from private.retention_review(as_of) where reference = 'RC-RT04-TEST';
  if not 'excluida:cliente_activo' = any(rv.reasons) then raise exception 'FAIL: active client reason'; end if;
  select * into rv from private.retention_review(as_of) where reference = 'RC-RT05-TEST';
  if not 'excluida:relacion_cerrada_revision_manual' = any(rv.reasons) then raise exception 'FAIL: closed reason'; end if;
  select * into rv from private.retention_review(as_of) where reference = 'RC-RT06-TEST';
  if not 'excluida:conservacion_documentada' = any(rv.reasons) then raise exception 'FAIL: hold reason'; end if;
  select * into rv from private.retention_review(as_of) where reference = 'RC-RT07-TEST';
  if not 'excluida:estado_aceptada_revisar_relacion' = any(rv.reasons) then raise exception 'FAIL: accepted reason'; end if;
end $$;

-- r8 open send (built as the owner, with its own draft).
do $$
declare
  d uuid;
  q uuid;
begin
  insert into public.quote_drafts (quote_request_id, title) values ('00000000-0000-4000-8000-000000000308', 'x') returning id into d;
  insert into public.quotes (quote_request_id, quote_reference, revision, draft_id, draft_version, business_name, contact_name,
                             recipient_email, title, summary, deliverables, total_cents, issued_by_email)
  values ('00000000-0000-4000-8000-000000000308', 'COT-RT08-TEST', 1, d, 1, 'b', 'c', 'x@example.com', 't', 's', 'd', 100, 'x')
  returning id into q;
  insert into public.quote_sends (quote_id, kind, request_key, recipient_email, subject, body, pdf_path, pdf_sha256,
                                  requested_by_email, status, sender)
  values (q, 'envio', gen_random_uuid(), 'x@example.com', 's', 'b', 'p', repeat('a', 64), 'x', 'incierto', 'x');
  -- Creating a draft/quote is activity (triggers fired): age r8 again, then only the open send excludes it.
  update public.quote_requests set last_activity_at = now() - interval '13 months' where id = '00000000-0000-4000-8000-000000000308';
  if not 'excluida:envio_pendiente_o_incierto' = any(
       ((select reasons from private.retention_review(now()) where reference = 'RC-RT08-TEST'))::text[]) then
    raise exception 'FAIL: uncertain send must exclude';
  end if;
end $$;

-- Permissions --------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform private.retention_review(now());
    raise exception 'FAIL: anon can review';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a3"}', true);
do $$
begin
  -- Even an admin cannot reach the private retention functions or the job log.
  begin
    perform private.retention_begin('00000000-0000-4000-8000-000000000302', now());
    raise exception 'FAIL: admin can start a deletion';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.retention_jobs;
    raise exception 'FAIL: admin can read the job log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000b3"}', true);
do $$
begin
  begin
    perform public.admin_set_relationship('00000000-0000-4000-8000-000000000301', 'prospecto', 'cliente_activo');
    raise exception 'FAIL: non-admin set relationship';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_set_retention_hold('00000000-0000-4000-8000-000000000301', true, 'xxx');
    raise exception 'FAIL: non-admin set hold';
  exception when sqlstate 'RC403' then null;
  end;
end $$;
reset role;

set local role service_role;
do $$
begin
  begin
    perform private.retention_finish(gen_random_uuid());
    raise exception 'FAIL: service_role can finish deletions';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Deletion path ------------------------------------------------------------------
do $$
declare
  r1 uuid := '00000000-0000-4000-8000-000000000301';
  j record;
  j2 record;
  c jsonb;
  n bigint;
begin
  -- Immutability still holds without the retention context.
  begin
    delete from public.quotes where quote_request_id = r1;
    raise exception 'FAIL: quotes deletable in normal use';
  exception when sqlstate 'RC409' then null;
  end;

  -- Ineligible files are refused.
  begin
    perform private.retention_begin('00000000-0000-4000-8000-000000000304', now());
    raise exception 'FAIL: active client deletion started';
  exception when sqlstate 'RC409' then null;
  end;

  select * into j from private.retention_begin(r1, now());
  if j.resumed or cardinality(j.pdf_paths) <> 1 then raise exception 'FAIL: begin (%).', j; end if;

  -- Resume returns the same open job.
  select * into j2 from private.retention_begin(r1, now());
  if not j2.resumed or j2.job_id <> j.job_id then raise exception 'FAIL: resume'; end if;
end $$;

-- While pending, the admin cannot add data to the file (concurrency).
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a3"}', true);
do $$
begin
  begin
    perform public.admin_add_quote_note('00000000-0000-4000-8000-000000000301', 'nota durante el borrado');
    raise exception 'FAIL: note added during deletion';
  exception when sqlstate 'RC409' then null;
  end;
  begin
    perform public.admin_set_quote_status('00000000-0000-4000-8000-000000000301', 'propuesta_enviada', 'cerrada');
    raise exception 'FAIL: status changed during deletion';
  exception when sqlstate 'RC409' then null;
  end;
end $$;
reset role;

do $$
declare
  r1 uuid := '00000000-0000-4000-8000-000000000301';
  jid uuid := (select id from private.retention_jobs where request_id = '00000000-0000-4000-8000-000000000301' and status = 'en_curso');
  c jsonb;
  n bigint;
  q1 uuid := (select id from public.quotes where quote_request_id = '00000000-0000-4000-8000-000000000301');
begin
  c := private.retention_finish(jid);
  if (c->>'solicitudes')::int <> 1 or (c->>'notas')::int <> 1 or (c->>'historial')::int <> 2 or (c->>'borradores')::int <> 1
     or (c->>'revisiones')::int <> 1 or (c->>'envios')::int <> 2 or (c->>'pdfs')::int <> 1 then
    raise exception 'FAIL: counts %', c;
  end if;

  select count(*) into n from public.quote_requests where id = r1;
  if n <> 0 then raise exception 'FAIL: request not deleted'; end if;
  select (select count(*) from public.quote_notes where quote_request_id = r1)
       + (select count(*) from public.quote_status_history where quote_request_id = r1)
       + (select count(*) from public.quote_drafts where quote_request_id = r1)
       + (select count(*) from public.quotes where quote_request_id = r1)
       + (select count(*) from public.quote_items where quote_id = q1)
       + (select count(*) from public.quote_sends where quote_id = q1) into n;
  if n <> 0 then raise exception 'FAIL: % rows left', n; end if;

  -- The log keeps counts and the request id only, no content or personal data.
  if exists (select 1 from private.retention_jobs where id = jid and (status <> 'completado' or pdf_paths <> '{}')) then
    raise exception 'FAIL: job log';
  end if;
  begin
    perform private.retention_finish(jid);
    raise exception 'FAIL: finished twice';
  exception when sqlstate 'RC409' then null;
  end;

  -- Excluded files are intact.
  select count(*) into n from public.quote_requests
  where reference in ('RC-RT03-TEST', 'RC-RT04-TEST', 'RC-RT05-TEST', 'RC-RT06-TEST', 'RC-RT07-TEST', 'RC-RT08-TEST');
  if n <> 6 then raise exception 'FAIL: excluded files touched'; end if;
end $$;

-- Deletion requested by the person (erasure_begin) -------------------------------
set local role service_role;
do $$
begin
  begin
    perform private.erasure_begin('00000000-0000-4000-8000-000000000303');
    raise exception 'FAIL: service_role can start an erasure';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a3"}', true);
do $$
begin
  begin
    perform private.erasure_begin('00000000-0000-4000-8000-000000000303');
    raise exception 'FAIL: an admin can start an erasure through the API';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare
  j record;
  n integer;
  r uuid;
begin
  -- Still refused: active client (r4), documented hold (r6), unreviewed "aceptada" (r7), uncertain send (r8).
  foreach r in array array['00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000306',
                           '00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000308']::uuid[] loop
    begin
      perform private.erasure_begin(r);
      raise exception 'FAIL: erasure allowed for %', r;
    exception when sqlstate 'RC409' then null;
    end;
  end loop;

  -- Allowed despite recent activity (r3) and a closed relationship (r5).
  foreach r in array array['00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000305']::uuid[] loop
    select * into j from private.erasure_begin(r);
    if j.resumed then raise exception 'FAIL: new erasure reported as resumed'; end if;
    if (select reason from private.retention_jobs where id = j.job_id) <> 'solicitud_titular' then
      raise exception 'FAIL: erasure job reason';
    end if;
    -- Interrupted and retried: resumes the same job.
    if (select job_id from private.erasure_begin(r)) <> j.job_id then raise exception 'FAIL: erasure resume'; end if;
    perform private.retention_finish(j.job_id);
    if exists (select 1 from public.quote_requests where id = r) then raise exception 'FAIL: erased file still there'; end if;
  end loop;

  select count(*) into n from public.quote_requests
  where reference in ('RC-RT04-TEST', 'RC-RT06-TEST', 'RC-RT07-TEST', 'RC-RT08-TEST');
  if n <> 4 then raise exception 'FAIL: refused erasures touched data'; end if;
end $$;

select 'retention checks passed' as result;

rollback;
