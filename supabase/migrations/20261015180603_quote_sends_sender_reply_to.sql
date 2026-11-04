-- Store the sender and Reply-To of each quote send, so a retry with the same
-- idempotency key ("Repetir envío con la misma clave") rebuilds exactly the
-- original request even if the environment changed in between. Existing rows
-- keep NULL (sent before this was recorded). No data is modified.

alter table public.quote_sends
  add column sender text,
  add column reply_to text;

alter table public.quote_sends
  add constraint quote_sends_sender_reply_to_check check (
    char_length(coalesce(sender, '')) <= 320
    and (reply_to is null or char_length(reply_to) between 3 and 254)
  );

drop function public.admin_begin_quote_send(uuid, uuid, text, text, text);

-- Same rules as before; now also records the sender and Reply-To that will be
-- used for this send (and for any retry of it).
create function public.admin_begin_quote_send(
  p_quote_id uuid,
  p_request_key uuid,
  p_kind text,
  p_subject text,
  p_body text,
  p_sender text,
  p_reply_to text
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
    or p_body is null or char_length(btrim(p_body)) not between 1 and 5000
    or p_sender is null or char_length(btrim(p_sender)) not between 3 and 320
    or (p_reply_to is not null and char_length(btrim(p_reply_to)) not between 3 and 254) then
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
    sender, reply_to, requested_by, requested_by_email
  ) values (
    p_quote_id, p_kind, p_request_key, v_quote.recipient_email, btrim(p_subject), btrim(p_body),
    v_quote.pdf_path, v_quote.pdf_sha256, btrim(p_sender), nullif(btrim(p_reply_to), ''),
    (select auth.uid()), private.admin_email()
  )
  returning * into v_row;

  return query select v_row.id, v_row.status, false;
end;
$$;

revoke all on function public.admin_begin_quote_send(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_begin_quote_send(uuid, uuid, text, text, text, text, text) to authenticated;
