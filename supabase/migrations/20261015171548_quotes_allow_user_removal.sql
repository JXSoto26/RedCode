-- quotes.issued_by references auth.users with ON DELETE SET NULL, but the
-- immutability guard rejected that change, so deleting a user who had
-- finalized quotes failed. Allow exactly that: issued_by may become NULL.
-- The issued_by_email snapshot and every other column stay immutable.

create or replace function private.quotes_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable constant text[] := array['pdf_path', 'pdf_sha256', 'pdf_size_bytes', 'pdf_generated_at', 'issued_by'];
begin
  if tg_op = 'DELETE' then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;

  -- issued_by may only be cleared (user removed), never reassigned.
  if new.issued_by is distinct from old.issued_by and new.issued_by is not null then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;

  -- The PDF columns may be filled in once; nothing else may change.
  if (old.pdf_path is not null
      and (new.pdf_path, new.pdf_sha256, new.pdf_size_bytes, new.pdf_generated_at)
          is distinct from (old.pdf_path, old.pdf_sha256, old.pdf_size_bytes, old.pdf_generated_at))
    or (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'quotes are immutable' using errcode = 'RC409';
  end if;
  return new;
end;
$$;

revoke all on function private.quotes_guard_update() from public, anon, authenticated, service_role;
