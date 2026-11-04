-- Real access checks for the admin panel, run against Supabase DEV:
--
--   npm run test:db
--
-- Everything runs inside one transaction that is rolled back: the temporary
-- users, admin grant, request, notes and drafts never persist. Any failed
-- check raises an exception and aborts the run.
--
-- Roles are switched with SET LOCAL ROLE and JWT claims with set_config, which
-- is exactly how PostgREST runs API requests.

begin;

-- Fixtures (as the migration owner) -------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-test@example.com', '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'user-test@example.com', '{}', '{}', now(), now());

insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-0000000000a1');

insert into public.quote_requests (
  id, reference, idempotency_key, payload_hash, contact_name, business_name, email, business_type,
  service, goal, logo_status, copy_status, photos_status, consent_accepted, consent_version, consented_at
) values (
  '00000000-0000-4000-8000-0000000000c1', 'RC-TEST-0001', '00000000-0000-4000-8000-0000000000d1', 'hash',
  'Prueba SQL', 'Negocio SQL', 'sql@example.com', 'otro', 'landing_page', 'Objetivo', 'disponible',
  'disponible', 'disponible', true, 'test', now()
);

-- anon: no access at all --------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  t text;
begin
  foreach t in array array['quote_requests', 'quote_notes', 'quote_drafts', 'quote_draft_items',
                           'quote_status_history', 'admin_users', 'quote_rate_limits'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: anon can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    perform public.admin_set_quote_status('00000000-0000-4000-8000-0000000000c1', 'nueva', 'cerrada');
    raise exception 'FAIL: anon can call admin_set_quote_status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_add_quote_note('00000000-0000-4000-8000-0000000000c1', 'x');
    raise exception 'FAIL: anon can call admin_add_quote_note';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', null, '{}', '[]');
    raise exception 'FAIL: anon can call admin_save_quote_draft';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- authenticated but NOT an admin: sees nothing, can change nothing -------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000b1"}', true);

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['quote_requests', 'quote_notes', 'quote_drafts', 'quote_draft_items',
                           'quote_status_history', 'admin_users'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'FAIL: non-admin sees % rows in %', n, t; end if;
  end loop;

  begin
    perform 1 from public.quote_rate_limits;
    raise exception 'FAIL: non-admin can read quote_rate_limits';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_set_quote_status('00000000-0000-4000-8000-0000000000c1', 'nueva', 'cerrada');
    raise exception 'FAIL: non-admin changed a status';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_add_quote_note('00000000-0000-4000-8000-0000000000c1', 'x');
    raise exception 'FAIL: non-admin added a note';
  exception when sqlstate 'RC403' then null;
  end;
  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', null, '{}', '[]');
    raise exception 'FAIL: non-admin saved a draft';
  exception when sqlstate 'RC403' then null;
  end;

  -- Direct writes through the API are not granted.
  begin
    update public.quote_requests set status = 'cerrada' where id = '00000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL: non-admin can update quote_requests';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-0000000000b1');
    raise exception 'FAIL: a user can make themselves admin';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.quote_notes (quote_request_id, body, created_by_email)
    values ('00000000-0000-4000-8000-0000000000c1', 'x', 'x');
    raise exception 'FAIL: non-admin can insert notes';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- admin ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a1"}', true);

do $$
declare
  n bigint;
  v integer;
  s text;
begin
  select count(*) into n from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'FAIL: admin cannot read the request'; end if;
  select count(*) into n from public.admin_users;
  if n <> 1 then raise exception 'FAIL: admin should see exactly their own admin row, saw %', n; end if;

  -- Status change + history, atomically.
  s := public.admin_set_quote_status('00000000-0000-4000-8000-0000000000c1', 'nueva', 'por_aclarar');
  if s <> 'por_aclarar' then raise exception 'FAIL: status not changed'; end if;
  select count(*) into n from public.quote_status_history
  where quote_request_id = '00000000-0000-4000-8000-0000000000c1'
    and from_status = 'nueva' and to_status = 'por_aclarar'
    and changed_by = '00000000-0000-4000-8000-0000000000a1' and changed_by_email = 'admin-test@example.com';
  if n <> 1 then raise exception 'FAIL: history not recorded with the admin'; end if;

  -- Stale expected status: rejected, nothing written.
  begin
    perform public.admin_set_quote_status('00000000-0000-4000-8000-0000000000c1', 'nueva', 'aceptada');
    raise exception 'FAIL: stale status change accepted';
  exception when sqlstate 'RC409' then null;
  end;
  select status into s from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c1';
  select count(*) into n from public.quote_status_history where quote_request_id = '00000000-0000-4000-8000-0000000000c1';
  if s <> 'por_aclarar' or n <> 1 then raise exception 'FAIL: stale change left traces'; end if;

  begin
    perform public.admin_set_quote_status('00000000-0000-4000-8000-0000000000c1', 'por_aclarar', 'enviada');
    raise exception 'FAIL: invalid status accepted';
  exception when sqlstate 'RC422' then null;
  end;
  begin
    perform public.admin_set_quote_status('00000000-0000-4000-8000-00000000ffff', 'nueva', 'cerrada');
    raise exception 'FAIL: missing request accepted';
  exception when sqlstate 'RC404' then null;
  end;

  -- Notes.
  perform public.admin_add_quote_note('00000000-0000-4000-8000-0000000000c1', '  Llamar el lunes  ');
  select count(*) into n from public.quote_notes
  where quote_request_id = '00000000-0000-4000-8000-0000000000c1' and body = 'Llamar el lunes';
  if n <> 1 then raise exception 'FAIL: note not saved (trimmed)'; end if;
  begin
    perform public.admin_add_quote_note('00000000-0000-4000-8000-0000000000c1', '   ');
    raise exception 'FAIL: empty note accepted';
  exception when sqlstate 'RC422' then null;
  end;

  -- Drafts with optimistic concurrency.
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', null,
    '{"title":"Borrador"}',
    '[{"description":"Diseño","quantity":"1","unitPriceCents":"50000"},{"description":"Pendiente"}]');
  if v <> 1 then raise exception 'FAIL: new draft version should be 1, got %', v; end if;

  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', null, '{}', '[]');
    raise exception 'FAIL: second draft created';
  exception when sqlstate 'RC409' then null;
  end;

  -- Tab A saves on top of version 1 ...
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', 1,
    '{"title":"Pestaña A"}', '[{"description":"Solo A","quantity":"2.5","unitPriceCents":"1999"}]');
  if v <> 2 then raise exception 'FAIL: expected version 2, got %', v; end if;
  -- ... then tab B, still on version 1, is rejected instead of overwriting.
  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', 1,
      '{"title":"Pestaña B"}', '[]');
    raise exception 'FAIL: stale draft save overwrote tab A';
  exception when sqlstate 'RC409' then null;
  end;
  select d.title into s from public.quote_drafts d where d.quote_request_id = '00000000-0000-4000-8000-0000000000c1';
  select count(*) into n from public.quote_draft_items i
    join public.quote_drafts d on d.id = i.draft_id
    where d.quote_request_id = '00000000-0000-4000-8000-0000000000c1'
      and i.description = 'Solo A' and i.quantity = 2.5 and i.unit_price_cents = 1999;
  if s <> 'Pestaña A' or n <> 1 then raise exception 'FAIL: tab A content not intact'; end if;

  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c1', 2, '{}',
      '[{"quantity":"-1"}]');
    raise exception 'FAIL: negative quantity accepted';
  exception when check_violation then null;
  end;

  -- Saving a draft never changes the request status.
  select status into s from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c1';
  if s <> 'por_aclarar' then raise exception 'FAIL: draft save changed the status'; end if;

  -- Even an admin cannot write directly or delete requests.
  begin
    insert into public.quote_drafts (quote_request_id) values ('00000000-0000-4000-8000-0000000000c1');
    raise exception 'FAIL: admin can insert drafts directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.quote_requests where id = '00000000-0000-4000-8000-0000000000c1';
    raise exception 'FAIL: admin can delete requests';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.quote_status_history (quote_request_id, from_status, to_status, changed_by_email)
    values ('00000000-0000-4000-8000-0000000000c1', 'nueva', 'cerrada', 'x');
    raise exception 'FAIL: admin can forge history';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- service_role (the public form's key) cannot read notes or drafts ---------------
set local role service_role;

do $$
declare
  t text;
begin
  foreach t in array array['quote_notes', 'quote_drafts', 'quote_draft_items', 'quote_status_history', 'admin_users'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: service_role can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;

select 'admin access checks passed' as result;

rollback;
