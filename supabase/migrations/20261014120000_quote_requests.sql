-- Quote requests submitted from /cotizar.
--
-- Access model: only the server (service_role / secret key) can touch these
-- tables. RLS is enabled with NO policies and all privileges are revoked from
-- anon/authenticated, so the public API key can neither read nor write.
-- Allowed values mirror lib/quote/options.ts (a test keeps them in sync).

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  idempotency_key uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Follow-up, updated manually from the Supabase dashboard.
  status text not null default 'nueva',
  internal_notes text,

  -- Step 1: business
  contact_name text not null,
  business_name text not null,
  email text not null,
  whatsapp text,
  business_type text not null,
  business_type_other text,

  -- Step 2: project
  service text not null,
  goal text not null,
  current_url text,
  redesign_improvements text,

  -- Step 3: needs (features are needs to evaluate, not agreed inclusions)
  sections text[] not null default '{}',
  sections_other text,
  features text[] not null default '{}',
  features_other text,
  logo_status text not null,
  copy_status text not null,
  photos_status text not null,
  budget_usd integer,
  budget_undefined boolean not null default false,
  desired_date date,
  date_undefined boolean not null default false,
  comments text,

  -- Consent
  consent_accepted boolean not null,
  consent_version text not null,
  consented_at timestamptz not null,

  -- Notification delivery (no secrets, no provider messages)
  visitor_email_status text not null default 'pendiente',
  visitor_email_attempts integer not null default 0,
  visitor_email_last_error text,
  visitor_email_sent_at timestamptz,
  owner_email_status text not null default 'pendiente',
  owner_email_attempts integer not null default 0,
  owner_email_last_error text,
  owner_email_sent_at timestamptz,

  constraint quote_requests_reference_unique unique (reference),
  constraint quote_requests_idempotency_key_unique unique (idempotency_key),
  constraint quote_requests_reference_format check (reference ~ '^RC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  constraint quote_requests_status_check check (
    status in ('nueva', 'por_aclarar', 'propuesta_enviada', 'aceptada', 'cerrada')
  ),
  constraint quote_requests_business_type_check check (
    business_type in ('pequeno_negocio', 'profesional_independiente', 'iglesia', 'otro')
  ),
  constraint quote_requests_service_check check (
    service in ('pagina_informativa', 'landing_page', 'rediseno', 'orientacion')
  ),
  constraint quote_requests_sections_check check (
    sections <@ array['inicio', 'sobre_nosotros', 'servicios', 'productos', 'galeria', 'horarios', 'eventos', 'preguntas_frecuentes', 'contacto', 'otra']::text[]
  ),
  constraint quote_requests_features_check check (
    features <@ array['formulario_contacto', 'enlace_whatsapp', 'mapa', 'contenido_editable', 'otra']::text[]
  ),
  constraint quote_requests_assets_check check (
    logo_status in ('disponible', 'parcial', 'necesito_ayuda')
    and copy_status in ('disponible', 'parcial', 'necesito_ayuda')
    and photos_status in ('disponible', 'parcial', 'necesito_ayuda')
  ),
  constraint quote_requests_notification_status_check check (
    visitor_email_status in ('pendiente', 'enviado', 'fallido', 'omitido')
    and owner_email_status in ('pendiente', 'enviado', 'fallido', 'omitido')
  ),
  constraint quote_requests_consent_check check (consent_accepted),
  constraint quote_requests_budget_check check (budget_usd is null or budget_usd between 1 and 1000000),
  constraint quote_requests_lengths_check check (
    char_length(contact_name) between 1 and 100
    and char_length(business_name) between 1 and 150
    and char_length(email) between 3 and 254
    and char_length(coalesce(whatsapp, '')) <= 25
    and char_length(coalesce(business_type_other, '')) <= 100
    and char_length(goal) between 1 and 1500
    and char_length(coalesce(current_url, '')) <= 400
    and char_length(coalesce(redesign_improvements, '')) <= 1500
    and char_length(coalesce(sections_other, '')) <= 200
    and char_length(coalesce(features_other, '')) <= 200
    and char_length(coalesce(comments, '')) <= 2000
    and char_length(coalesce(visitor_email_last_error, '')) <= 100
    and char_length(coalesce(owner_email_last_error, '')) <= 100
  )
);

comment on table public.quote_requests is
  'Solicitudes de cotización del sitio. Solo accesible desde el servidor (service_role).';
comment on column public.quote_requests.status is
  'nueva | por_aclarar | propuesta_enviada | aceptada | cerrada';

create index quote_requests_status_created_idx on public.quote_requests (status, created_at desc);
create index quote_requests_pending_email_idx on public.quote_requests (created_at)
  where visitor_email_status in ('pendiente', 'fallido') or owner_email_status in ('pendiente', 'fallido');

create function public.quote_requests_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger quote_requests_set_updated_at
  before update on public.quote_requests
  for each row execute function public.quote_requests_set_updated_at();

alter table public.quote_requests enable row level security;
revoke all on table public.quote_requests from public, anon, authenticated;
revoke all on table public.quote_requests from service_role;
grant select, insert, update on table public.quote_requests to service_role;

revoke all on function public.quote_requests_set_updated_at() from public, anon, authenticated;
grant execute on function public.quote_requests_set_updated_at() to service_role;

-- ---------------------------------------------------------------------------
-- Rate limiting shared by all serverless instances.
-- Buckets are HMAC hashes (never raw IPs or emails).
-- ---------------------------------------------------------------------------

create table public.quote_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start),
  constraint quote_rate_limits_bucket_length check (char_length(bucket) <= 64)
);

alter table public.quote_rate_limits enable row level security;
revoke all on table public.quote_rate_limits from public, anon, authenticated;
revoke all on table public.quote_rate_limits from service_role;
grant select, insert, update, delete on table public.quote_rate_limits to service_role;

-- Atomically counts one hit for the bucket in the current fixed window and
-- returns true while the count is within the limit.
create function public.quote_rate_limit_hit(p_bucket text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds < 1 or p_window_seconds > 604800 or p_limit < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.quote_rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Occasional cleanup of expired windows.
  if random() < 0.02 then
    delete from public.quote_rate_limits where window_start < now() - interval '8 days';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.quote_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.quote_rate_limit_hit(text, integer, integer) to service_role;
