-- Private admin panel: admin authorization, internal notes, status history and
-- quote drafts.
--
-- Access model:
-- - anon: nothing (unchanged).
-- - authenticated: SELECT only, and RLS only lets through users listed in
--   admin_users. Being signed in is not enough.
-- - Every write goes through SECURITY DEFINER functions that check
--   private.is_admin() first, so related writes (status + history, draft +
--   items) happen in one transaction and history cannot be forged.
-- - service_role (the public form's server key) gets no access to the new
--   tables: notes and drafts are unreachable from the public flow.
-- - Nothing here deletes quote requests.

-- ---------------------------------------------------------------------------
-- Admin authorization
-- ---------------------------------------------------------------------------

-- Not exposed through the Data API (only "public" is).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Admins are granted manually with SQL from the dashboard or the CLI. No role
-- that the app or the API uses can insert here.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Usuarios autorizados para el panel /admin. Se añaden solo con SQL.';

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated, service_role;
grant select on table public.admin_users to authenticated;

-- A signed-in user can only see whether they themselves are an admin.
create policy admin_users_select_self on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()));

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

revoke all on function private.is_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Quote requests: admins can read (writes only through the functions below)
-- ---------------------------------------------------------------------------

grant select on table public.quote_requests to authenticated;

create policy quote_requests_admin_select on public.quote_requests
  for select to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Status history
-- ---------------------------------------------------------------------------

create table public.quote_status_history (
  id bigint generated always as identity primary key,
  quote_request_id uuid not null references public.quote_requests (id) on delete restrict,
  from_status text not null,
  to_status text not null,
  -- Snapshot of who did it, kept even if the user is later removed.
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_email text not null,
  changed_at timestamptz not null default now(),
  constraint quote_status_history_status_check check (
    from_status in ('nueva', 'por_aclarar', 'propuesta_enviada', 'aceptada', 'cerrada')
    and to_status in ('nueva', 'por_aclarar', 'propuesta_enviada', 'aceptada', 'cerrada')
    and from_status <> to_status
  ),
  constraint quote_status_history_email_length check (char_length(changed_by_email) <= 254)
);

create index quote_status_history_request_idx
  on public.quote_status_history (quote_request_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Internal notes (never part of public responses or visitor emails)
-- ---------------------------------------------------------------------------

create table public.quote_notes (
  id bigint generated always as identity primary key,
  quote_request_id uuid not null references public.quote_requests (id) on delete restrict,
  body text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  constraint quote_notes_body_length check (char_length(btrim(body)) between 1 and 5000),
  constraint quote_notes_email_length check (char_length(created_by_email) <= 254)
);

create index quote_notes_request_idx on public.quote_notes (quote_request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Quote drafts: one per request, every field optional so incomplete drafts
-- can be saved. Money is stored in integer cents.
-- ---------------------------------------------------------------------------

create table public.quote_drafts (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests (id) on delete restrict,
  title text,
  summary text,
  deliverables text,
  exclusions text,
  estimated_time text,
  terms text,
  validity text,
  -- Optimistic concurrency: every save must name the version it started from.
  version integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_drafts_request_unique unique (quote_request_id),
  constraint quote_drafts_version_positive check (version >= 1),
  constraint quote_drafts_lengths_check check (
    char_length(coalesce(title, '')) <= 200
    and char_length(coalesce(summary, '')) <= 5000
    and char_length(coalesce(deliverables, '')) <= 5000
    and char_length(coalesce(exclusions, '')) <= 5000
    and char_length(coalesce(estimated_time, '')) <= 200
    and char_length(coalesce(terms, '')) <= 5000
    and char_length(coalesce(validity, '')) <= 200
  )
);

create table public.quote_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.quote_drafts (id) on delete cascade,
  position integer not null,
  description text,
  -- Up to two decimals (e.g. 1.5 hours). NULL = pending.
  quantity numeric(10, 2),
  -- USD cents. NULL = pending.
  unit_price_cents bigint,
  constraint quote_draft_items_position_unique unique (draft_id, position),
  constraint quote_draft_items_position_check check (position between 0 and 49),
  constraint quote_draft_items_description_length check (char_length(coalesce(description, '')) <= 500),
  constraint quote_draft_items_quantity_check check (quantity is null or (quantity > 0 and quantity <= 100000)),
  constraint quote_draft_items_price_check check (
    unit_price_cents is null or unit_price_cents between 0 and 100000000
  )
);

-- ---------------------------------------------------------------------------
-- RLS and privileges for the new tables: admins can read, nobody writes
-- directly (not even service_role).
-- ---------------------------------------------------------------------------

alter table public.quote_status_history enable row level security;
alter table public.quote_notes enable row level security;
alter table public.quote_drafts enable row level security;
alter table public.quote_draft_items enable row level security;

revoke all on table public.quote_status_history from public, anon, authenticated, service_role;
revoke all on table public.quote_notes from public, anon, authenticated, service_role;
revoke all on table public.quote_drafts from public, anon, authenticated, service_role;
revoke all on table public.quote_draft_items from public, anon, authenticated, service_role;

grant select on table public.quote_status_history to authenticated;
grant select on table public.quote_notes to authenticated;
grant select on table public.quote_drafts to authenticated;
grant select on table public.quote_draft_items to authenticated;

create policy quote_status_history_admin_select on public.quote_status_history
  for select to authenticated using ((select private.is_admin()));
create policy quote_notes_admin_select on public.quote_notes
  for select to authenticated using ((select private.is_admin()));
create policy quote_drafts_admin_select on public.quote_drafts
  for select to authenticated using ((select private.is_admin()));
create policy quote_draft_items_admin_select on public.quote_draft_items
  for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Admin operations. Errors use custom SQLSTATEs the app maps to messages:
--   RC403 not an admin · RC404 not found · RC409 conflict · RC422 invalid
-- ---------------------------------------------------------------------------

create function private.admin_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select email from auth.users where id = (select auth.uid())), '');
$$;

revoke all on function private.admin_email() from public, anon, authenticated, service_role;

-- Changes the status and records it in the history, atomically. Fails if the
-- status changed since the admin loaded the page. Never sends email.
create function public.admin_set_quote_status(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text
)
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
  if p_new_status is null
    or p_new_status not in ('nueva', 'por_aclarar', 'propuesta_enviada', 'aceptada', 'cerrada') then
    raise exception 'invalid_status' using errcode = 'RC422';
  end if;

  select status into v_current
  from public.quote_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'RC404';
  end if;
  if v_current is distinct from p_expected_status then
    raise exception 'status_conflict' using errcode = 'RC409';
  end if;
  if v_current = p_new_status then
    return v_current;
  end if;

  update public.quote_requests set status = p_new_status where id = p_request_id;

  insert into public.quote_status_history (quote_request_id, from_status, to_status, changed_by, changed_by_email)
  values (p_request_id, v_current, p_new_status, (select auth.uid()), private.admin_email());

  return p_new_status;
end;
$$;

create function public.admin_add_quote_note(p_request_id uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'RC403';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then
    raise exception 'invalid_note' using errcode = 'RC422';
  end if;
  if not exists (select 1 from public.quote_requests where id = p_request_id) then
    raise exception 'not_found' using errcode = 'RC404';
  end if;

  insert into public.quote_notes (quote_request_id, body, created_by, created_by_email)
  values (p_request_id, btrim(p_body), (select auth.uid()), private.admin_email())
  returning id into v_id;

  return v_id;
end;
$$;

-- Creates (p_expected_version null) or updates the draft and replaces its
-- items, atomically. Returns the new version. A stale p_expected_version
-- (another tab saved first) fails with RC409 instead of overwriting.
-- Saving a draft never changes the request status.
create function public.admin_save_quote_draft(
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

  insert into public.quote_draft_items (draft_id, position, description, quantity, unit_price_cents)
  select
    v_draft_id,
    (t.ord - 1)::integer,
    nullif(btrim(t.item ->> 'description'), ''),
    (t.item ->> 'quantity')::numeric(10, 2),
    (t.item ->> 'unitPriceCents')::bigint
  from jsonb_array_elements(v_items) with ordinality as t(item, ord);

  return v_version;
end;
$$;

revoke all on function public.admin_set_quote_status(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_add_quote_note(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_save_quote_draft(uuid, integer, jsonb, jsonb) from public, anon, authenticated, service_role;

grant execute on function public.admin_set_quote_status(uuid, text, text) to authenticated;
grant execute on function public.admin_add_quote_note(uuid, text) to authenticated;
grant execute on function public.admin_save_quote_draft(uuid, integer, jsonb, jsonb) to authenticated;
