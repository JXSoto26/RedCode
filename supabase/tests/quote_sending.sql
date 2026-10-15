-- Real checks for finalized quotes, PDFs and the send log, against Supabase DEV:
--
--   npm run test:db
--
-- Runs inside one transaction that is rolled back: nothing persists and no
-- email is sent (Resend is never called from SQL). Any failed check aborts.

begin;

-- Fixtures ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-quotes-test@example.com', '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'user-quotes-test@example.com', '{}', '{}', now(), now());

insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-0000000000a2');

insert into public.quote_requests (
  id, reference, idempotency_key, payload_hash, contact_name, business_name, email, business_type,
  service, goal, logo_status, copy_status, photos_status, consent_accepted, consent_version, consented_at
) values (
  '00000000-0000-4000-8000-0000000000c2', 'RC-TEST-0002', '00000000-0000-4000-8000-0000000000d2', 'hash',
  'Prueba SQL', 'Negocio SQL Ñandú', 'sql@example.com', 'otro', 'landing_page', 'Objetivo', 'disponible',
  'disponible', 'disponible', true, 'test', now()
);

-- anon: nothing -------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['quotes', 'quote_items', 'quote_sends'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: anon can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', 1);
    raise exception 'FAIL: anon can finalize';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_begin_quote_send(gen_random_uuid(), gen_random_uuid(), 'envio', 's', 'b', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
    raise exception 'FAIL: anon can begin a send';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from storage.objects where bucket_id = 'quote-pdfs';
  if n <> 0 then raise exception 'FAIL: anon sees quote PDFs'; end if;
end $$;

reset role;

-- admin: finalize -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a2"}', true);

do $$
declare
  r record;
  r2 record;
  v integer;
  n bigint;
  s text;
  q1 uuid;
begin
  -- Incomplete draft: no item price, no deliverables.
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c2', null,
    '{"title":"Cotización de prueba","summary":"Alcance"}',
    '[{"description":"Diseño","quantity":"1"}]');
  begin
    perform public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', v);
    raise exception 'FAIL: incomplete draft finalized';
  exception when sqlstate 'RC422' then null;
  end;

  -- Complete it (deliverables + prices); 3 × 19.99 + 1.5 × 0.01 = 59.97 + 0.015 → 59.97 + 0.02 = 59.99
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c2', v,
    '{"title":"Cotización de prueba","summary":"Alcance","deliverables":"Página"}',
    '[{"description":"Diseño","quantity":"3","unitPriceCents":"1999"},{"description":"Ajuste","quantity":"1.5","unitPriceCents":"1"}]');

  -- Stale version.
  begin
    perform public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', v - 1);
    raise exception 'FAIL: stale draft version finalized';
  exception when sqlstate 'RC409' then null;
  end;

  select * into r from public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', v);
  if not r.created or r.revision <> 1 then raise exception 'FAIL: first finalize should create revision 1'; end if;
  q1 := r.quote_id;

  select total_cents, quote_reference, recipient_email, business_name, draft_version, issued_by_email
    into r2 from public.quotes where id = q1;
  if r2.total_cents <> 5999 then raise exception 'FAIL: total should be 5999 cents, got %', r2.total_cents; end if;
  if r2.quote_reference <> 'COT-TEST-0002' or r2.recipient_email <> 'sql@example.com'
     or r2.business_name <> 'Negocio SQL Ñandú' or r2.draft_version <> v
     or r2.issued_by_email <> 'admin-quotes-test@example.com' then
    raise exception 'FAIL: snapshot fields wrong';
  end if;
  select count(*) into n from public.quote_items where quote_id = q1 and line_total_cents in (5997, 2);
  if n <> 2 then raise exception 'FAIL: line totals wrong'; end if;

  -- Double click: same version returns the same revision.
  select * into r from public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', v);
  if r.created or r.quote_id <> q1 then raise exception 'FAIL: double finalize created another revision'; end if;

  -- Finalizing does not send or change the status.
  select status into s from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c2';
  if s <> 'nueva' then raise exception 'FAIL: finalize changed the status'; end if;
  select count(*) into n from public.quote_sends where quote_id = q1;
  if n <> 0 then raise exception 'FAIL: finalize created a send'; end if;

  -- Editing the draft afterwards never touches revision 1; a new revision keeps both.
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c2', v,
    '{"title":"Título cambiado","summary":"Alcance","deliverables":"Página"}',
    '[{"description":"Diseño","quantity":"1","unitPriceCents":"100000"}]');
  select title into s from public.quotes where id = q1;
  if s <> 'Cotización de prueba' then raise exception 'FAIL: draft edit changed a finalized quote'; end if;
  select * into r from public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', v);
  if r.revision <> 2 then raise exception 'FAIL: expected revision 2'; end if;
  select count(*) into n from public.quotes where quote_request_id = '00000000-0000-4000-8000-0000000000c2';
  if n <> 2 then raise exception 'FAIL: previous revision not kept'; end if;

  -- Direct writes are not granted, even to admins.
  begin
    update public.quotes set title = 'x' where id = q1;
    raise exception 'FAIL: admin can update quotes directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.quote_sends (quote_id, kind, request_key, recipient_email, subject, body, pdf_path, pdf_sha256, requested_by_email)
    values (q1, 'envio', gen_random_uuid(), 'x@example.com', 's', 'b', 'p', repeat('a', 64), 'x');
    raise exception 'FAIL: admin can insert sends directly';
  exception when insufficient_privilege then null;
  end;

  -- PDF attachment: validated, set once.
  begin
    perform public.admin_attach_quote_pdf(q1, '../escape.pdf', repeat('a', 64), 100);
    raise exception 'FAIL: bad PDF path accepted';
  exception when sqlstate 'RC422' then null;
  end;
  perform public.admin_attach_quote_pdf(q1, q1::text || '/cotizacion-rev-1.pdf', repeat('a', 64), 1000);
  perform public.admin_attach_quote_pdf(q1, q1::text || '/cotizacion-rev-1.pdf', repeat('a', 64), 1000);
  begin
    perform public.admin_attach_quote_pdf(q1, q1::text || '/otro.pdf', repeat('b', 64), 1000);
    raise exception 'FAIL: PDF replaced';
  exception when sqlstate 'RC409' then null;
  end;
end $$;

reset role;

-- Immutability holds for every role, including the database owner -------------
do $$
declare
  q1 uuid := (select id from public.quotes where quote_reference = 'COT-TEST-0002' and revision = 1);
begin
  begin
    update public.quotes set total_cents = 1 where id = q1;
    raise exception 'FAIL: owner changed a finalized total';
  exception when sqlstate 'RC409' then null;
  end;
  begin
    update public.quotes set pdf_sha256 = repeat('c', 64) where id = q1;
    raise exception 'FAIL: owner replaced a PDF hash';
  exception when sqlstate 'RC409' then null;
  end;
  begin
    delete from public.quotes where id = q1;
    raise exception 'FAIL: owner deleted a quote';
  exception when sqlstate 'RC409' then null;
  end;
  begin
    update public.quote_items set unit_price_cents = 1 where quote_id = q1;
    raise exception 'FAIL: owner changed a finalized item';
  exception when sqlstate 'RC409' then null;
  end;
end $$;

-- admin: sending -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a2"}', true);

do $$
declare
  q1 uuid := (select id from public.quotes where quote_reference = 'COT-TEST-0002' and revision = 1);
  q2 uuid := (select id from public.quotes where quote_reference = 'COT-TEST-0002' and revision = 2);
  r record;
  s1 uuid;
  s2 uuid;
  n bigint;
  st text;
  eff text;
begin
  -- No PDF yet on revision 2.
  begin
    perform public.admin_begin_quote_send(q2, gen_random_uuid(), 'envio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
    raise exception 'FAIL: send without PDF registered';
  exception when sqlstate 'RC422' then null;
  end;

  -- Same request key (double click / concurrent submit) → one row.
  select * into r from public.admin_begin_quote_send(q1, '00000000-0000-4000-8000-00000000e001', 'envio', ' Asunto ', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
  if r.existing or r.status <> 'pendiente' then raise exception 'FAIL: first begin'; end if;
  s1 := r.send_id;
  select * into r from public.admin_begin_quote_send(q1, '00000000-0000-4000-8000-00000000e001', 'envio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
  if not r.existing or r.send_id <> s1 then raise exception 'FAIL: same key created another send'; end if;

  -- The recipient and PDF come from the quote, never from the caller.
  select count(*) into n from public.quote_sends
  where id = s1 and recipient_email = 'sql@example.com' and subject = 'Asunto'
    and sender = 'RedCode <onboarding@resend.dev>' and reply_to = 'redcodepr@gmail.com'
    and pdf_sha256 = repeat('a', 64) and requested_by_email = 'admin-quotes-test@example.com';
  if n <> 1 then raise exception 'FAIL: send snapshot wrong'; end if;

  -- Another key while one is open → refused.
  begin
    perform public.admin_begin_quote_send(q1, gen_random_uuid(), 'envio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
    raise exception 'FAIL: second send while one is open';
  exception when sqlstate 'RC409' then null;
  end;

  -- Only one caller can claim it.
  select * into r from public.admin_claim_quote_send(s1, 'nuevo');
  if not r.claimed or r.attempts <> 1 then raise exception 'FAIL: first claim'; end if;
  select * into r from public.admin_claim_quote_send(s1, 'nuevo');
  if r.claimed then raise exception 'FAIL: double claim'; end if;
  -- A fresh in-flight send cannot be reconciled yet.
  select * into r from public.admin_claim_quote_send(s1, 'reconciliar');
  if r.claimed then raise exception 'FAIL: reconciled a fresh in-flight send'; end if;

  begin
    perform public.admin_finish_quote_send(s1, 'aceptado', null, null);
    raise exception 'FAIL: acceptance without provider id';
  exception when sqlstate 'RC422' then null;
  end;

  -- Accepted: request nueva → propuesta_enviada, with history, atomically.
  eff := public.admin_finish_quote_send(s1, 'aceptado', 'test-provider-id-1', null);
  if eff <> 'cambiado' then raise exception 'FAIL: effect %', eff; end if;
  select status into st from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c2';
  if st <> 'propuesta_enviada' then raise exception 'FAIL: status not changed'; end if;
  select count(*) into n from public.quote_status_history
  where quote_request_id = '00000000-0000-4000-8000-0000000000c2' and from_status = 'nueva'
    and to_status = 'propuesta_enviada' and changed_by_email = 'admin-quotes-test@example.com';
  if n <> 1 then raise exception 'FAIL: history not recorded'; end if;

  begin
    perform public.admin_finish_quote_send(s1, 'aceptado', 'other', null);
    raise exception 'FAIL: finished twice';
  exception when sqlstate 'RC409' then null;
  end;

  -- A reload of the review page (new key) cannot send the first email again.
  begin
    perform public.admin_begin_quote_send(q1, gen_random_uuid(), 'envio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
    raise exception 'FAIL: first send repeated';
  exception when sqlstate 'RC409' then null;
  end;

  -- Deliberate resend: separate record. Uncertain → retry with the same row.
  select send_id into s2 from public.admin_begin_quote_send(q1, gen_random_uuid(), 'reenvio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
  perform public.admin_claim_quote_send(s2, 'nuevo');
  perform public.admin_finish_quote_send(s2, 'incierto', null, 'timeout');
  begin
    perform public.admin_begin_quote_send(q1, gen_random_uuid(), 'reenvio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
    raise exception 'FAIL: new resend while one is uncertain';
  exception when sqlstate 'RC409' then null;
  end;
  select * into r from public.admin_claim_quote_send(s2, 'reconciliar');
  if not r.claimed or r.attempts <> 2 then raise exception 'FAIL: reconcile claim'; end if;
  eff := public.admin_finish_quote_send(s2, 'aceptado', 'test-provider-id-1', null);
  if eff <> 'sin_cambio_propuesta_enviada' then raise exception 'FAIL: effect %', eff; end if;
  select count(*) into n from public.quote_sends where quote_id = q1;
  if n <> 2 then raise exception 'FAIL: expected 2 send records, got %', n; end if;

  -- Rule: a send never overwrites aceptada or cerrada.
  perform public.admin_set_quote_status('00000000-0000-4000-8000-0000000000c2', 'propuesta_enviada', 'aceptada');
  select send_id into s2 from public.admin_begin_quote_send(q1, gen_random_uuid(), 'reenvio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
  perform public.admin_claim_quote_send(s2, 'nuevo');
  eff := public.admin_finish_quote_send(s2, 'aceptado', 'test-provider-id-2', null);
  select status into st from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c2';
  if eff <> 'sin_cambio_aceptada' or st <> 'aceptada' then raise exception 'FAIL: aceptada overwritten'; end if;

  -- Manual reconciliation: "not sent" → fallido; cannot resolve twice.
  select send_id into s2 from public.admin_begin_quote_send(q1, gen_random_uuid(), 'reenvio', 'Asunto', 'Cuerpo', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
  perform public.admin_claim_quote_send(s2, 'nuevo');
  perform public.admin_finish_quote_send(s2, 'incierto', null, 'network_error');
  perform public.admin_resolve_quote_send(s2, 'no_enviado', null);
  select status into st from public.quote_sends where id = s2;
  if st <> 'fallido' then raise exception 'FAIL: resolve no_enviado'; end if;
  begin
    perform public.admin_resolve_quote_send(s2, 'aceptado', 'x');
    raise exception 'FAIL: resolved twice';
  exception when sqlstate 'RC409' then null;
  end;

  -- Storage: admins may upload to the private bucket, never overwrite or delete.
  insert into storage.objects (bucket_id, name) values ('quote-pdfs', 'test-only/sql-check.pdf');
  update storage.objects set name = 'test-only/renamed.pdf' where bucket_id = 'quote-pdfs' and name = 'test-only/sql-check.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: admin can overwrite stored PDFs'; end if;
  -- Blocked twice: no delete policy, and Supabase's own guard on storage tables.
  begin
    delete from storage.objects where bucket_id = 'quote-pdfs' and name = 'test-only/sql-check.pdf';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: admin can delete stored PDFs'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Time-based rules (simulated as the owner) -------------------------------------
do $$
declare
  q1 uuid := (select id from public.quotes where quote_reference = 'COT-TEST-0002' and revision = 1);
  s uuid;
begin
  insert into public.quote_sends (quote_id, kind, request_key, recipient_email, subject, body, pdf_path, pdf_sha256,
                                  requested_by_email, status, attempts, created_at, last_attempt_at)
  values (q1, 'reenvio', gen_random_uuid(), 'sql@example.com', 'Asunto', 'Cuerpo', 'p', repeat('a', 64), 'x',
          'incierto', 1, now() - interval '24 hours', now() - interval '24 hours')
  returning id into s;
  perform set_config('test.expired_send', s::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a2"}', true);

do $$
begin
  -- After Resend's idempotency window, an automatic retry could duplicate the email.
  begin
    perform public.admin_claim_quote_send(current_setting('test.expired_send')::uuid, 'reconciliar');
    raise exception 'FAIL: reconciled after the idempotency window';
  exception when sqlstate 'RC409' then null;
  end;
  -- Manual resolution is still possible.
  perform public.admin_resolve_quote_send(current_setting('test.expired_send')::uuid, 'aceptado', 'from-dashboard-1');
end $$;

reset role;

-- signed-in but not an admin -------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000b2"}', true);

do $$
declare
  t text;
  n bigint;
  q1 uuid := gen_random_uuid();
begin
  foreach t in array array['quotes', 'quote_items', 'quote_sends'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'FAIL: non-admin sees % rows in %', n, t; end if;
  end loop;
  select count(*) into n from storage.objects where bucket_id = 'quote-pdfs';
  if n <> 0 then raise exception 'FAIL: non-admin sees quote PDFs'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('quote-pdfs', 'x/intruder.pdf');
    raise exception 'FAIL: non-admin can upload PDFs';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c2', 1);
    raise exception 'FAIL: non-admin finalized';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_begin_quote_send(q1, gen_random_uuid(), 'envio', 's', 'b', 'RedCode <onboarding@resend.dev>', 'redcodepr@gmail.com');
    raise exception 'FAIL: non-admin began a send';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_claim_quote_send(q1, 'nuevo');
    raise exception 'FAIL: non-admin claimed';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_finish_quote_send(q1, 'aceptado', 'x', null);
    raise exception 'FAIL: non-admin finished';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_resolve_quote_send(q1, 'no_enviado', null);
    raise exception 'FAIL: non-admin resolved';
  exception when sqlstate 'RC403' then null;
  end;
end $$;

reset role;

-- service_role: no access to quotes or the send log ---------------------------------
set local role service_role;

do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'quote_items', 'quote_sends'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: service_role can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;

do $$
declare
  n bigint;
  q1 uuid := (select id from public.quotes where quote_reference = 'COT-TEST-0002' and revision = 1);
begin
  if (select public from storage.buckets where id = 'quote-pdfs') is distinct from false then
    raise exception 'FAIL: quote-pdfs bucket must exist and be private';
  end if;

  -- issued_by can be cleared, never reassigned.
  begin
    update public.quotes set issued_by = '00000000-0000-4000-8000-0000000000b2' where id = q1;
    raise exception 'FAIL: issued_by reassigned';
  exception when sqlstate 'RC409' then null;
  end;

  -- Removing an admin who finalized and sent quotes works; the snapshots remain.
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000a2';
  select count(*) into n from public.quotes
  where quote_reference = 'COT-TEST-0002' and issued_by is null and issued_by_email = 'admin-quotes-test@example.com';
  if n <> 2 then raise exception 'FAIL: quotes after removing their admin'; end if;
end $$;

select 'quote sending checks passed' as result;

rollback;
