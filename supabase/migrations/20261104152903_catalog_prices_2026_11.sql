-- Approved base prices (internal suggestions, USD) as new catalog versions.
--
-- - Never rewrites a version: each change inserts the next version, copying
--   every other field (title, unit, scope, inclusions, exclusions, review
--   flag, active state) from the current one.
-- - Only entries still at the previous base price change. An entry whose
--   current price differs from that base was customized by an admin: it is
--   kept as is and reported ("personalizado_conservado").
-- - Idempotent: an entry already at the new price is left alone, so running
--   it again creates no versions.
-- - Drafts and finalized quotes keep the catalog version they used.
-- - Manual evaluations (orientation, logo, photography, integrations,
--   special features) keep no automatic price.
--
-- A fresh install runs the initial catalog (20261103154556) and then this
-- migration, so it starts with these prices.

create function private.catalog_reprice(p_changes jsonb, p_label text)
returns table (r_code text, r_action text, r_current_cents bigint, r_new_cents bigint, r_version integer)
language plpgsql
set search_path = ''
as $$
declare
  c record;
  v_cur public.price_catalog_entries;
begin
  for c in
    select x ->> 'code' as code, (x ->> 'from')::bigint as from_cents, (x ->> 'to')::bigint as to_cents
    from jsonb_array_elements(p_changes) as x
  loop
    -- Same lock as admin_save_catalog_entry: no concurrent edit of this entry.
    perform pg_advisory_xact_lock(hashtext('price_catalog:' || c.code));
    select * into v_cur from public.price_catalog_entries e where e.code = c.code order by e.version desc limit 1;

    r_code := c.code;
    r_new_cents := c.to_cents;
    if not found then
      r_action := 'no_existe'; r_current_cents := null; r_version := null;
    elsif v_cur.kind = 'manual' then
      r_action := 'manual_sin_precio'; r_current_cents := null; r_version := v_cur.version;
    elsif v_cur.price_cents is not distinct from c.to_cents then
      r_action := 'sin_cambios'; r_current_cents := v_cur.price_cents; r_version := v_cur.version;
    elsif v_cur.price_cents is distinct from c.from_cents then
      r_action := 'personalizado_conservado'; r_current_cents := v_cur.price_cents; r_version := v_cur.version;
    else
      insert into public.price_catalog_entries
        (code, version, kind, title, unit, price_cents, scope, includes, excludes, requires_review, active, position, created_by_email)
      values
        (v_cur.code, v_cur.version + 1, v_cur.kind, v_cur.title, v_cur.unit, c.to_cents, v_cur.scope, v_cur.includes,
         v_cur.excludes, v_cur.requires_review, v_cur.active, v_cur.position, p_label);
      r_action := 'actualizado'; r_current_cents := v_cur.price_cents; r_version := v_cur.version + 1;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function private.catalog_reprice(jsonb, text) from public, anon, authenticated, service_role;

select * from private.catalog_reprice(
  '[
    {"code": "base_landing",       "from": 65000,  "to": 120000},
    {"code": "base_informativa",   "from": 120000, "to": 220000},
    {"code": "base_rediseno",      "from": 80000,  "to": 150000},
    {"code": "seccion_adicional",  "from": 7500,   "to": 12500},
    {"code": "pagina_adicional",   "from": 15000,  "to": 25000},
    {"code": "galeria",            "from": 10000,  "to": 17500},
    {"code": "catalogo_productos", "from": 20000,  "to": 35000},
    {"code": "eventos",            "from": 10000,  "to": 17500},
    {"code": "formulario",         "from": 15000,  "to": 30000},
    {"code": "cms_basico",         "from": 50000,  "to": 90000},
    {"code": "cms_coleccion",      "from": 20000,  "to": 35000},
    {"code": "edicion_textos",     "from": 10000,  "to": 17500},
    {"code": "redaccion",          "from": 25000,  "to": 40000},
    {"code": "optimizacion_fotos", "from": 7500,   "to": 12500}
  ]'::jsonb,
  'precios aprobados 2026-11-04'
);
