-- Private catalog of suggested prices for quote drafts.
--
-- - Each catalog entry has a stable code and immutable versions: editing an
--   entry inserts a new version; old versions stay so drafts and finalized
--   quotes can always explain which values they used.
-- - Admins read it (RLS); writes only through admin_save_catalog_entry().
--   Nothing is granted to anon or service_role: the catalog is never public.
-- - Draft items and finalized quote items record the catalog code/version,
--   the reason of the suggestion and an optional manual-adjustment note.
--   Finalized items also copy the original catalog price.
-- - Amounts in integer USD cents. No taxes, recurring charges or discounts.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.price_catalog_entries (
  code text not null,
  version integer not null,
  -- base: main service; adicional: add-on; manual: evaluated by hand (no price).
  kind text not null,
  title text not null,
  unit text not null,
  -- NULL = no automatic price (manual evaluation).
  price_cents bigint,
  scope text not null default '',
  includes text not null default '',
  excludes text not null default '',
  requires_review boolean not null default false,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by_email text not null default '',
  primary key (code, version),
  constraint price_catalog_code_check check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  constraint price_catalog_version_check check (version >= 1),
  constraint price_catalog_kind_check check (kind in ('base', 'adicional', 'manual')),
  constraint price_catalog_manual_no_price check (kind <> 'manual' or price_cents is null),
  constraint price_catalog_price_check check (price_cents is null or price_cents between 0 and 100000000),
  constraint price_catalog_text_check check (
    char_length(title) between 1 and 120
    and char_length(unit) between 1 and 40
    and char_length(scope) <= 1000
    and char_length(includes) <= 1000
    and char_length(excludes) <= 1000
  )
);

alter table public.price_catalog_entries enable row level security;
revoke all on table public.price_catalog_entries from public, anon, authenticated, service_role;
grant select on table public.price_catalog_entries to authenticated;
create policy price_catalog_admin_select on public.price_catalog_entries
  for select to authenticated using ((select private.is_admin()));

-- Versions are immutable: a change is a new version.
create function private.price_catalog_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'catalog versions are immutable' using errcode = 'RC409';
end;
$$;

create trigger price_catalog_immutable
  before update or delete on public.price_catalog_entries
  for each row execute function private.price_catalog_immutable();

revoke all on function private.price_catalog_immutable() from public, anon, authenticated, service_role;

-- Latest version of each entry. security_invoker: the table's RLS applies.
create view public.price_catalog_current
with (security_invoker = true) as
  select distinct on (code) *
  from public.price_catalog_entries
  order by code, version desc;

revoke all on public.price_catalog_current from public, anon, authenticated, service_role;
grant select on public.price_catalog_current to authenticated;

-- Initial catalog (version 1).
insert into public.price_catalog_entries
  (code, kind, title, unit, price_cents, scope, includes, excludes, requires_review, position, version, created_by_email)
select v.code, v.kind, v.title, v.unit, v.price_cents, v.scope, v.includes, v.excludes, v.requires_review, v.position, 1,
       'catálogo inicial'
from (values
  ('base_landing', 'base', 'Landing page', 'proyecto', 65000::bigint,
   'Una página, hasta 6 secciones, un idioma.',
   'Diseño adaptado a celulares, enlaces de WhatsApp, mapa, carga del contenido entregado y dos rondas de ajustes dentro del alcance.',
   'Dominio, hosting, servicios de terceros, mantenimiento y funciones adicionales.', false, 10),
  ('base_informativa', 'base', 'Página informativa', 'proyecto', 120000,
   'Hasta 5 páginas, un idioma.',
   'Diseño adaptado a celulares, enlaces de WhatsApp, mapa, carga del contenido entregado y dos rondas de ajustes dentro del alcance.',
   'Dominio, hosting, servicios de terceros, mantenimiento y funciones adicionales.', false, 20),
  ('base_rediseno', 'base', 'Rediseño de página web', 'proyecto', 80000,
   'Referencia inicial: hasta 5 páginas sencillas. Requiere revisar la página actual antes de confirmar el precio.',
   'Diseño adaptado a celulares, enlaces de WhatsApp, mapa, carga del contenido entregado y dos rondas de ajustes dentro del alcance.',
   'Dominio, hosting, servicios de terceros, mantenimiento, migración de funciones complejas y funciones adicionales.', true, 30),
  ('base_orientacion', 'base', 'Orientación (servicio por definir)', 'proyecto', null,
   'Sin precio automático: se define el servicio después de conversar con el cliente.',
   '', '', true, 40),
  ('seccion_adicional', 'adicional', 'Sección estática adicional', 'sección', 7500,
   'Una sección más con contenido entregado.', '', '', false, 110),
  ('pagina_adicional', 'adicional', 'Página adicional estándar', 'página', 15000,
   'Una página más con contenido entregado.', '', '', false, 120),
  ('galeria', 'adicional', 'Galería estática', 'galería', 10000,
   'Hasta 20 imágenes entregadas.', '', 'Edición o retoque de fotos.', false, 130),
  ('catalogo_productos', 'adicional', 'Catálogo estático de productos', 'catálogo', 20000,
   'Hasta 10 productos.', '', 'Carrito de compras, pagos en línea y edición por el cliente.', false, 140),
  ('eventos', 'adicional', 'Eventos estáticos', 'bloque', 10000,
   'Hasta 5 eventos.', '', 'Administrador para que el cliente los edite.', false, 150),
  ('formulario', 'adicional', 'Formulario funcional', 'formulario', 15000,
   'Hasta 6 campos, con validación, protección antispam y envío por email.', '', 'Integraciones con otros sistemas.', false, 160),
  ('cms_basico', 'adicional', 'CMS básico', 'proyecto', 50000,
   'Una colección editable, acceso para el cliente y capacitación breve.', '', 'Colecciones adicionales.', false, 170),
  ('cms_coleccion', 'adicional', 'Colección adicional del CMS', 'colección', 20000,
   'Una colección editable más.', '', '', false, 180),
  ('edicion_textos', 'adicional', 'Edición de textos entregados', 'paquete', 10000,
   'Hasta 5 secciones.', '', 'Redacción desde cero.', false, 190),
  ('redaccion', 'adicional', 'Redacción desde brief', 'paquete', 25000,
   'Hasta 5 secciones y una revisión.', '', '', false, 200),
  ('optimizacion_fotos', 'adicional', 'Optimización de fotos entregadas', 'paquete', 7500,
   'Hasta 20 fotos.', '', 'Sesión de fotos o retoque avanzado.', false, 210),
  ('manual_logo', 'manual', 'Logo', 'evaluación', null,
   'Evaluación manual: sin precio precargado.', '', '', true, 310),
  ('manual_fotografia', 'manual', 'Fotografía', 'evaluación', null,
   'Evaluación manual: sin precio precargado.', '', '', true, 320),
  ('manual_integraciones', 'manual', 'Integraciones', 'evaluación', null,
   'Evaluación manual: sin precio precargado.', '', '', true, 330),
  ('manual_especial', 'manual', 'Funcionalidad especial', 'evaluación', null,
   'Evaluación manual: sin precio precargado.', '', '', true, 340)
) as v(code, kind, title, unit, price_cents, scope, includes, excludes, requires_review, position);

-- Edits one entry by inserting its next version. p_expected_version is the
-- version the editor started from: a stale one is a conflict (RC409).
-- Code, kind and position never change.
create function public.admin_save_catalog_entry(p_code text, p_expected_version integer, p_entry jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.price_catalog_entries;
  v_price bigint;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'invalid_entry' using errcode = 'RC422';
  end if;

  -- Serialize edits of the same entry.
  perform pg_advisory_xact_lock(hashtext('price_catalog:' || coalesce(p_code, '')));
  select * into v_current from public.price_catalog_entries
  where code = p_code order by version desc limit 1;
  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if v_current.version is distinct from p_expected_version then
    raise exception 'catalog_conflict' using errcode = 'RC409';
  end if;

  v_price := nullif(p_entry ->> 'priceCents', '')::bigint;
  if v_current.kind = 'manual' and v_price is not null then
    raise exception 'manual_entries_have_no_price' using errcode = 'RC422';
  end if;

  insert into public.price_catalog_entries
    (code, version, kind, title, unit, price_cents, scope, includes, excludes, requires_review, active, position, created_by_email)
  values (
    v_current.code, v_current.version + 1, v_current.kind,
    btrim(p_entry ->> 'title'), btrim(p_entry ->> 'unit'), v_price,
    coalesce(btrim(p_entry ->> 'scope'), ''), coalesce(btrim(p_entry ->> 'includes'), ''),
    coalesce(btrim(p_entry ->> 'excludes'), ''),
    coalesce((p_entry ->> 'requiresReview')::boolean, false),
    coalesce((p_entry ->> 'active')::boolean, true),
    v_current.position, private.admin_email()
  );
  return v_current.version + 1;
exception
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'invalid_entry' using errcode = 'RC422';
end;
$$;

revoke all on function public.admin_save_catalog_entry(text, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_save_catalog_entry(text, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Traceability on draft items and finalized items
-- ---------------------------------------------------------------------------

alter table public.quote_draft_items
  add column catalog_code text,
  add column catalog_version integer,
  add column suggestion_reason text,
  add column adjustment_note text,
  add constraint quote_draft_items_catalog_fk foreign key (catalog_code, catalog_version)
    references public.price_catalog_entries (code, version),
  add constraint quote_draft_items_catalog_pair check ((catalog_code is null) = (catalog_version is null)),
  add constraint quote_draft_items_notes_length check (
    char_length(coalesce(suggestion_reason, '')) <= 500 and char_length(coalesce(adjustment_note, '')) <= 500
  );

alter table public.quote_items
  add column catalog_code text,
  add column catalog_version integer,
  add column catalog_price_cents bigint,
  add column suggestion_reason text,
  add column adjustment_note text,
  add constraint quote_items_catalog_fk foreign key (catalog_code, catalog_version)
    references public.price_catalog_entries (code, version);

-- Same as 20261015151853_admin_panel.sql, now also storing the catalog
-- reference, suggestion reason and adjustment note of each item. An unknown
-- catalog code/version is rejected (RC422).
create or replace function public.admin_save_quote_draft(
  p_request_id uuid,
  p_expected_version integer,
  p_draft jsonb,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_id uuid;
  v_version integer;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if jsonb_typeof(coalesce(p_draft, '{}'::jsonb)) <> 'object' or jsonb_typeof(v_items) <> 'array' then
    raise exception 'invalid_draft' using errcode = 'RC422';
  end if;
  if jsonb_array_length(v_items) > 50 then
    raise exception 'too_many_items' using errcode = 'RC422';
  end if;
  if not exists (select 1 from public.quote_requests where id = p_request_id) then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_items) as t(item)
    where nullif(t.item ->> 'catalogCode', '') is not null
      and not exists (
        select 1 from public.price_catalog_entries e
        where e.code = t.item ->> 'catalogCode' and e.version = (t.item ->> 'catalogVersion')::integer
      )
  ) then
    raise exception 'unknown_catalog_entry' using errcode = 'RC422';
  end if;

  if p_expected_version is null then
    insert into public.quote_drafts (
      quote_request_id, title, summary, deliverables, exclusions, estimated_time, terms, validity,
      created_by, updated_by
    )
    values (
      p_request_id,
      nullif(btrim(p_draft ->> 'title'), ''),
      nullif(btrim(p_draft ->> 'summary'), ''),
      nullif(btrim(p_draft ->> 'deliverables'), ''),
      nullif(btrim(p_draft ->> 'exclusions'), ''),
      nullif(btrim(p_draft ->> 'estimatedTime'), ''),
      nullif(btrim(p_draft ->> 'terms'), ''),
      nullif(btrim(p_draft ->> 'validity'), ''),
      (select auth.uid()),
      (select auth.uid())
    )
    on conflict (quote_request_id) do nothing
    returning id, version into v_draft_id, v_version;

    if v_draft_id is null then
      -- Another tab created the draft first.
      raise exception 'draft_conflict' using errcode = 'RC409';
    end if;
  else
    update public.quote_drafts set
      title = nullif(btrim(p_draft ->> 'title'), ''),
      summary = nullif(btrim(p_draft ->> 'summary'), ''),
      deliverables = nullif(btrim(p_draft ->> 'deliverables'), ''),
      exclusions = nullif(btrim(p_draft ->> 'exclusions'), ''),
      estimated_time = nullif(btrim(p_draft ->> 'estimatedTime'), ''),
      terms = nullif(btrim(p_draft ->> 'terms'), ''),
      validity = nullif(btrim(p_draft ->> 'validity'), ''),
      version = version + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
    where quote_request_id = p_request_id and version = p_expected_version
    returning id, version into v_draft_id, v_version;

    if v_draft_id is null then
      raise exception 'draft_conflict' using errcode = 'RC409';
    end if;

    delete from public.quote_draft_items where draft_id = v_draft_id;
  end if;

  insert into public.quote_draft_items (
    draft_id, position, description, quantity, unit_price_cents,
    catalog_code, catalog_version, suggestion_reason, adjustment_note
  )
  select
    v_draft_id,
    (t.ord - 1)::integer,
    nullif(btrim(t.item ->> 'description'), ''),
    (t.item ->> 'quantity')::numeric(10, 2),
    (t.item ->> 'unitPriceCents')::bigint,
    nullif(t.item ->> 'catalogCode', ''),
    case when nullif(t.item ->> 'catalogCode', '') is null then null else (t.item ->> 'catalogVersion')::integer end,
    nullif(btrim(t.item ->> 'suggestionReason'), ''),
    nullif(btrim(t.item ->> 'adjustmentNote'), '')
  from jsonb_array_elements(v_items) with ordinality as t(item, ord);

  return v_version;
end;
$$;

-- Same as 20261015165505_quote_sending.sql, now also copying the catalog
-- reference, original catalog price, suggestion reason and adjustment note
-- into the immutable quote items.
create or replace function public.admin_finalize_quote(p_request_id uuid, p_expected_version integer)
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

  insert into public.quote_items (
    quote_id, position, description, quantity, unit_price_cents, line_total_cents,
    catalog_code, catalog_version, catalog_price_cents, suggestion_reason, adjustment_note
  )
  select v_id, row_number() over (order by i.position) - 1, i.description, i.quantity, i.unit_price_cents,
         round(i.quantity * i.unit_price_cents),
         i.catalog_code, i.catalog_version, e.price_cents, i.suggestion_reason, i.adjustment_note
  from public.quote_draft_items i
  left join public.price_catalog_entries e on e.code = i.catalog_code and e.version = i.catalog_version
  where i.draft_id = v_draft.id;

  return query select v_id, v_revision, true;
end;
$$;
