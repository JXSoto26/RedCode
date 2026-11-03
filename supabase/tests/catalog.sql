-- Real checks for the private price catalog, against Supabase DEV:
--
--   npm run test:db
--
-- One transaction, rolled back: nothing persists, no email is sent, and only
-- the fixtures below are touched. Any failed check aborts.

begin;

-- Fixtures ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-catalog-test@example.com', '{}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'user-catalog-test@example.com', '{}', '{}', now(), now());

insert into public.admin_users (user_id) values ('00000000-0000-4000-8000-0000000000a4');

insert into public.quote_requests (
  id, reference, idempotency_key, payload_hash, contact_name, business_name, email, business_type,
  service, goal, logo_status, copy_status, photos_status, consent_accepted, consent_version, consented_at
) values (
  '00000000-0000-4000-8000-0000000000c4', 'RC-CAT1-TEST', '00000000-0000-4000-8000-0000000000d4', 'hash',
  'Prueba catálogo', 'Negocio catálogo', 'catalogo@example.com', 'otro', 'landing_page', 'Objetivo', 'disponible',
  'disponible', 'disponible', true, 'test', now()
);

-- Seed ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.price_catalog_current) <> 19 then raise exception 'FAIL: seed size'; end if;
  if (select price_cents from public.price_catalog_entries where code = 'base_landing' and version = 1) <> 65000
     or (select price_cents from public.price_catalog_entries where code = 'base_informativa' and version = 1) <> 120000
     or (select price_cents from public.price_catalog_entries where code = 'formulario' and version = 1) <> 15000
     or (select price_cents from public.price_catalog_entries where code = 'base_orientacion' and version = 1) is not null
     or exists (select 1 from public.price_catalog_entries where kind = 'manual' and price_cents is not null) then
    raise exception 'FAIL: seed values';
  end if;
end $$;

-- anon and service_role: nothing -------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform count(*) from public.price_catalog_entries;
    raise exception 'FAIL: anon can read the catalog';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.price_catalog_current;
    raise exception 'FAIL: anon can read the current catalog';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_save_catalog_entry('base_landing', 1, '{"title":"x","unit":"x"}');
    raise exception 'FAIL: anon can edit the catalog';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
do $$
begin
  begin
    perform count(*) from public.price_catalog_entries;
    raise exception 'FAIL: service_role can read the catalog';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Signed-in user without admin rights: sees no rows, cannot edit -----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000b4"}', true);
do $$
begin
  if (select count(*) from public.price_catalog_entries) <> 0 or (select count(*) from public.price_catalog_current) <> 0 then
    raise exception 'FAIL: non-admin reads the catalog';
  end if;
  begin
    perform public.admin_save_catalog_entry('base_landing', 1, '{"title":"x","unit":"x"}');
    raise exception 'FAIL: non-admin can edit the catalog';
  exception when sqlstate 'RC403' then null;
  end;
end $$;
reset role;

-- Admin ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000a4"}', true);
do $$
declare
  v integer;
  q record;
  it record;
begin
  if (select count(*) from public.price_catalog_current) <> 19 then raise exception 'FAIL: admin reads the catalog'; end if;

  -- Draft with a catalog line (price adjusted by hand, with a note) and a free line.
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c4', null, '{"title":"PRUEBA"}', jsonb_build_array(
    jsonb_build_object('description', 'Landing page', 'quantity', '1', 'unitPriceCents', 70000,
      'catalogCode', 'base_landing', 'catalogVersion', 1, 'suggestionReason', 'Servicio solicitado', 'adjustmentNote', 'Ajuste de prueba'),
    jsonb_build_object('description', 'Partida libre', 'quantity', '2', 'unitPriceCents', 2500)
  ));
  if v <> 1 then raise exception 'FAIL: first draft version'; end if;

  -- Unknown catalog references are rejected; the draft keeps version 1.
  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c4', 1, '{}', '[{"description":"x","catalogCode":"no_existe","catalogVersion":1}]');
    raise exception 'FAIL: unknown catalog code accepted';
  exception when sqlstate 'RC422' then null;
  end;
  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c4', 1, '{}', '[{"description":"x","catalogCode":"base_landing","catalogVersion":99}]');
    raise exception 'FAIL: unknown catalog version accepted';
  exception when sqlstate 'RC422' then null;
  end;

  -- Editing the catalog creates version 2; a stale tab gets a conflict.
  if public.admin_save_catalog_entry('base_landing', 1, '{"title":"Landing page","unit":"proyecto","priceCents":"72000","active":true}') <> 2 then
    raise exception 'FAIL: catalog version 2';
  end if;
  begin
    perform public.admin_save_catalog_entry('base_landing', 1, '{"title":"Otra pestaña","unit":"proyecto","priceCents":"1"}');
    raise exception 'FAIL: stale catalog edit accepted';
  exception when sqlstate 'RC409' then null;
  end;
  if (select price_cents from public.price_catalog_current where code = 'base_landing') <> 72000
     or (select price_cents from public.price_catalog_entries where code = 'base_landing' and version = 1) <> 65000 then
    raise exception 'FAIL: catalog versions';
  end if;
  begin
    perform public.admin_save_catalog_entry('manual_logo', 1, '{"title":"Logo","unit":"evaluación","priceCents":"5000"}');
    raise exception 'FAIL: manual entry with price accepted';
  exception when sqlstate 'RC422' then null;
  end;

  -- The draft is unchanged by the catalog edit: same version, price and reference.
  select i.* into it from public.quote_draft_items i join public.quote_drafts d on d.id = i.draft_id
  where d.quote_request_id = '00000000-0000-4000-8000-0000000000c4' and i.position = 0;
  if it.catalog_version <> 1 or it.unit_price_cents <> 70000 or it.adjustment_note <> 'Ajuste de prueba'
     or it.suggestion_reason <> 'Servicio solicitado' then
    raise exception 'FAIL: draft item changed after a catalog edit';
  end if;
  if (select version from public.quote_drafts where quote_request_id = '00000000-0000-4000-8000-0000000000c4') <> 1 then
    raise exception 'FAIL: draft version changed by a catalog edit';
  end if;

  -- Two tabs: a save from a stale draft version is still a conflict.
  v := public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c4', 1,
    '{"title":"PRUEBA","summary":"Resumen","deliverables":"Página"}', jsonb_build_array(
    jsonb_build_object('description', 'Landing page', 'quantity', '1', 'unitPriceCents', 70000,
      'catalogCode', 'base_landing', 'catalogVersion', 1, 'suggestionReason', 'Servicio solicitado', 'adjustmentNote', 'Ajuste de prueba'),
    jsonb_build_object('description', 'Partida libre', 'quantity', '2', 'unitPriceCents', 2500)
  ));
  begin
    perform public.admin_save_quote_draft('00000000-0000-4000-8000-0000000000c4', 1, '{}', '[]');
    raise exception 'FAIL: stale draft save accepted';
  exception when sqlstate 'RC409' then null;
  end;

  -- Finalizing copies the catalog reference and the original price into the immutable items.
  select * into q from public.admin_finalize_quote('00000000-0000-4000-8000-0000000000c4', v);
  if not q.created then raise exception 'FAIL: finalize'; end if;
  select * into it from public.quote_items where quote_id = q.quote_id and position = 0;
  if it.catalog_code <> 'base_landing' or it.catalog_version <> 1 or it.catalog_price_cents <> 65000
     or it.unit_price_cents <> 70000 or it.line_total_cents <> 70000 or it.adjustment_note <> 'Ajuste de prueba' then
    raise exception 'FAIL: finalized catalog values';
  end if;
  if (select total_cents from public.quotes where id = q.quote_id) <> 75000 then raise exception 'FAIL: total'; end if;
  if (select catalog_code from public.quote_items where quote_id = q.quote_id and position = 1) is not null then
    raise exception 'FAIL: free line got a catalog code';
  end if;

  -- A later catalog edit does not touch the finalized revision.
  perform public.admin_save_catalog_entry('base_landing', 2, '{"title":"Landing page","unit":"proyecto","priceCents":"99900"}');
  if (select catalog_price_cents from public.quote_items where quote_id = q.quote_id and position = 0) <> 65000 then
    raise exception 'FAIL: finalized item changed by a catalog edit';
  end if;
end $$;
reset role;

-- Owner: catalog versions and finalized items stay immutable ----------------------
do $$
begin
  begin
    update public.price_catalog_entries set price_cents = 1 where code = 'base_landing' and version = 1;
    raise exception 'FAIL: catalog version updated';
  exception when sqlstate 'RC409' then null;
  end;
  begin
    delete from public.price_catalog_entries where code = 'galeria';
    raise exception 'FAIL: catalog version deleted';
  exception when sqlstate 'RC409' then null;
  end;
  begin
    update public.quote_items set catalog_price_cents = 1
    where quote_id in (select id from public.quotes where quote_request_id = '00000000-0000-4000-8000-0000000000c4');
    raise exception 'FAIL: finalized item updated';
  exception when sqlstate 'RC409' then null;
  end;
end $$;

select 'catalog checks passed' as result;

rollback;
