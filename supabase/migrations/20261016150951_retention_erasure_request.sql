-- Deletion of one whole file at the request of the person it belongs to
-- (a data-subject request handled by hand, see README "Solicitudes sobre
-- datos personales"). Same machinery as the monthly review, but the 12-month
-- rule does not apply. It still refuses files that must be kept or decided
-- first: active clients, documented holds, open/uncertain sends and
-- "aceptada" requests whose relationship was not reviewed. A closed
-- relationship is allowed: running this is the manual review.
--
-- Owner only (CLI). Nothing is granted to API roles. Adds no data deletion by
-- itself; it only adds a column and a function.

alter table private.retention_jobs
  add column reason text not null default 'retencion',
  add constraint retention_jobs_reason_check check (reason in ('retencion', 'solicitud_titular'));

create function private.erasure_begin(p_request_id uuid)
returns table (job_id uuid, pdf_paths text[], resumed boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_job private.retention_jobs;
  v_review record;
  v_blocking text[];
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
  select * into v_review from private.retention_review(now()) rv where rv.request_id = p_request_id;
  v_blocking := array(
    select x from unnest(v_review.reasons) x
    where x not like 'incluida:%'
      and x not in ('excluida:actividad_en_ultimos_12_meses', 'excluida:relacion_cerrada_revision_manual')
  );
  if cardinality(v_blocking) > 0 then
    raise exception 'not_eligible: %', array_to_string(v_blocking, ',') using errcode = 'RC409';
  end if;

  perform set_config('redcode.retention_request', p_request_id::text, true);
  update public.quote_requests set deletion_pending_at = now() where id = p_request_id;

  insert into private.retention_jobs (request_id, as_of, pdf_paths, reason)
  values (
    p_request_id, now(),
    coalesce((select array_agg(q.pdf_path order by q.revision) from public.quotes q
              where q.quote_request_id = p_request_id and q.pdf_path is not null), '{}'),
    'solicitud_titular'
  )
  returning * into v_job;

  return query select v_job.id, v_job.pdf_paths, false;
end;
$$;

revoke all on function private.erasure_begin(uuid) from public, anon, authenticated, service_role;
