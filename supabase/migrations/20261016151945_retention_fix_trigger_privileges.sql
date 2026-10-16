-- Fix for 20261016144100_retention.sql: these trigger functions call
-- private.retention_context(), which no API role may execute. They ran with
-- the privileges of whoever fired the trigger, so an UPDATE on quote_requests
-- by the server (service_role, e.g. recording that a notification email was
-- sent or skipped) failed with "permission denied" and the email status stayed
-- "pendiente". Running them as the owner fixes it; they only read the row and
-- a transaction setting, and grant nothing new.

alter function private.block_request_update_if_pending() security definer;
alter function private.quotes_guard_update() security definer;
alter function private.quote_items_guard() security definer;
