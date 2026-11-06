-- Email template version per request and per quote send.
--
-- Retries rebuild the email from stored data and reuse the same idempotency
-- key, so they must render exactly the HTML of the first attempt. Rows that
-- exist now keep version 1 (the original, text-only design); rows created
-- from now on get version 2 (branded header with the logo).
--
-- Adds columns only: no function, grant, policy or existing value changes.
-- The two-step default backfills old rows with 1 without rewriting them by
-- hand, then makes 2 the default for new inserts.

alter table public.quote_requests
  add column email_template smallint not null default 1,
  add constraint quote_requests_email_template_check check (email_template in (1, 2));
alter table public.quote_requests alter column email_template set default 2;

alter table public.quote_sends
  add column email_template smallint not null default 1,
  add constraint quote_sends_email_template_check check (email_template in (1, 2));
alter table public.quote_sends alter column email_template set default 2;
