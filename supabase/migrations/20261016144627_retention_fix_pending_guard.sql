-- Fix for 20261016144100_retention.sql: block_if_deletion_pending() used a CASE
-- expression that referenced new.quote_id on every table, but only quote_sends
-- has that column, so inserts into history/notes/drafts/quotes failed.
-- IF branches are evaluated only for the table that fired the trigger.

create or replace function private.block_if_deletion_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request uuid;
begin
  if tg_table_name = 'quote_sends' then
    select quote_request_id into v_request from public.quotes where id = new.quote_id;
  else
    v_request := new.quote_request_id;
  end if;
  if exists (select 1 from public.quote_requests where id = v_request and deletion_pending_at is not null) then
    raise exception 'deletion_in_progress' using errcode = 'RC409';
  end if;
  return new;
end;
$$;

revoke all on function private.block_if_deletion_pending() from public, anon, authenticated, service_role;
