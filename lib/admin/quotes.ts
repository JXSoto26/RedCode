import "server-only";
import { createHash } from "node:crypto";
import { requireAdmin } from "./auth";
import { isRequestStatus, type RequestStatus } from "./labels";
import { decimalToHundredths } from "./money";
import { renderQuotePdf, type QuoteForPdf } from "./quote-pdf";
import type { SendStatus } from "./quote-send";
import type { AdminSupabase } from "./supabase";

/**
 * Finalized quotes, their PDFs and send log. Reads run as the signed-in admin
 * (RLS); PDFs live in the private "quote-pdfs" bucket, which only admins can
 * read or upload to, and nobody can overwrite or delete.
 */

export const PDF_BUCKET = "quote-pdfs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export type QuoteSend = {
  id: string;
  kind: "envio" | "reenvio";
  recipientEmail: string;
  subject: string;
  body: string;
  pdfPath: string;
  pdfSha256: string;
  status: SendStatus;
  attempts: number;
  providerId: string | null;
  lastError: string | null;
  statusEffect: string | null;
  resolvedManually: boolean;
  requestedByEmail: string;
  createdAt: string;
  lastAttemptAt: string | null;
  acceptedAt: string | null;
};

export type Quote = QuoteForPdf & {
  id: string;
  requestId: string;
  requestReference: string;
  requestStatus: RequestStatus;
  recipientEmail: string;
  draftVersion: number;
  issuedByEmail: string;
  pdf: { path: string; sha256: string; sizeBytes: number; generatedAt: string } | null;
  sends: QuoteSend[];
  /** Server time when this was read (ms), to judge stale in-flight sends. */
  loadedAt: number;
};

const QUOTE_COLUMNS =
  "id, quote_request_id, quote_reference, revision, draft_version, business_name, contact_name, recipient_email, title, summary, deliverables, exclusions, estimated_time, terms, validity, currency, total_cents, issued_by_email, issued_at, pdf_path, pdf_sha256, pdf_size_bytes, pdf_generated_at, quote_items(position, description, quantity::text, unit_price_cents, line_total_cents), quote_requests(reference, status)";

const SEND_COLUMNS =
  "id, kind, recipient_email, subject, body, pdf_path, pdf_sha256, status, attempts, provider_id, last_error, status_effect, resolved_manually, requested_by_email, created_at, last_attempt_at, accepted_at";

/* eslint-disable @typescript-eslint/no-explicit-any -- rows from the untyped client */
function toSend(s: any): QuoteSend {
  return {
    id: s.id,
    kind: s.kind,
    recipientEmail: s.recipient_email,
    subject: s.subject,
    body: s.body,
    pdfPath: s.pdf_path,
    pdfSha256: s.pdf_sha256,
    status: s.status,
    attempts: s.attempts,
    providerId: s.provider_id,
    lastError: s.last_error,
    statusEffect: s.status_effect,
    resolvedManually: s.resolved_manually,
    requestedByEmail: s.requested_by_email,
    createdAt: s.created_at,
    lastAttemptAt: s.last_attempt_at,
    acceptedAt: s.accepted_at,
  };
}

function toQuote(q: any, sends: any[]): Quote {
  return {
    id: q.id,
    requestId: q.quote_request_id,
    requestReference: q.quote_requests?.reference ?? "",
    requestStatus: isRequestStatus(q.quote_requests?.status) ? q.quote_requests.status : "nueva",
    quoteReference: q.quote_reference,
    revision: q.revision,
    draftVersion: q.draft_version,
    issuedAt: q.issued_at,
    issuedByEmail: q.issued_by_email,
    businessName: q.business_name,
    contactName: q.contact_name,
    recipientEmail: q.recipient_email,
    title: q.title,
    summary: q.summary,
    deliverables: q.deliverables,
    exclusions: q.exclusions,
    estimatedTime: q.estimated_time,
    terms: q.terms,
    validity: q.validity,
    currency: "USD",
    totalCents: Number(q.total_cents),
    items: [...(q.quote_items ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((i: any) => ({
        description: i.description,
        quantityHundredths: decimalToHundredths(i.quantity),
        unitPriceCents: Number(i.unit_price_cents),
        lineTotalCents: Number(i.line_total_cents),
      })),
    pdf: q.pdf_path
      ? { path: q.pdf_path, sha256: q.pdf_sha256, sizeBytes: q.pdf_size_bytes, generatedAt: q.pdf_generated_at }
      : null,
    sends: sends.map(toSend),
    loadedAt: Date.now(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Null when the id is malformed or the quote does not exist. */
export async function getQuote(quoteId: string): Promise<Quote | null> {
  if (!isUuid(quoteId)) return null;
  const { supabase } = await requireAdmin();
  const [quote, sends] = await Promise.all([
    supabase.from("quotes").select(QUOTE_COLUMNS).eq("id", quoteId).maybeSingle(),
    supabase.from("quote_sends").select(SEND_COLUMNS).eq("quote_id", quoteId).order("created_at", { ascending: false }),
  ]);
  if (quote.error) throw new Error(`quote_failed:${quote.error.code}`);
  if (sends.error) throw new Error(`sends_failed:${sends.error.code}`);
  return quote.data ? toQuote(quote.data, sends.data ?? []) : null;
}

export type QuoteSummary = {
  id: string;
  quoteReference: string;
  revision: number;
  draftVersion: number;
  issuedAt: string;
  totalCents: number;
  hasPdf: boolean;
  lastSend: { status: SendStatus; kind: string; at: string } | null;
};

export async function listQuotesForRequest(requestId: string): Promise<QuoteSummary[]> {
  if (!isUuid(requestId)) return [];
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_reference, revision, draft_version, issued_at, total_cents, pdf_path, quote_sends(status, kind, created_at)")
    .eq("quote_request_id", requestId)
    .order("revision", { ascending: false });
  if (error) throw new Error(`quotes_failed:${error.code}`);
  return (data ?? []).map((q) => {
    const sends = [...(q.quote_sends ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      id: q.id,
      quoteReference: q.quote_reference,
      revision: q.revision,
      draftVersion: q.draft_version,
      issuedAt: q.issued_at,
      totalCents: Number(q.total_cents),
      hasPdf: Boolean(q.pdf_path),
      lastSend: sends[0] ? { status: sends[0].status, kind: sends[0].kind, at: sends[0].created_at } : null,
    };
  });
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const pdfPathFor = (quote: Pick<Quote, "id" | "revision">) => `${quote.id}/cotizacion-rev-${quote.revision}.pdf`;

/**
 * Generates the revision's PDF once, stores it in private storage and records
 * its hash. Safe to repeat: an existing stored file is reused, never replaced.
 */
export async function ensureQuotePdf(supabase: AdminSupabase, quote: Quote) {
  if (quote.pdf) return quote.pdf;
  const path = pdfPathFor(quote);
  const storage = supabase.storage.from(PDF_BUCKET);

  let bytes: Uint8Array = await renderQuotePdf(quote);
  const upload = await storage.upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) {
    // A previous attempt stored the file but did not record it: reuse that file.
    const existing = await storage.download(path);
    if (existing.error || !existing.data) throw new Error("pdf_upload_failed");
    bytes = new Uint8Array(await existing.data.arrayBuffer());
  }

  const hash = sha256(bytes);
  const { error } = await supabase.rpc("admin_attach_quote_pdf", {
    p_quote_id: quote.id,
    p_path: path,
    p_sha256: hash,
    p_size: bytes.byteLength,
  });
  if (error) throw new Error(`pdf_attach_failed:${error.code}`);
  return { path, sha256: hash, sizeBytes: bytes.byteLength, generatedAt: new Date().toISOString() };
}

/** The exact stored PDF, verified against the recorded hash. */
export async function loadStoredPdf(supabase: AdminSupabase, path: string, expectedSha256: string) {
  const { data, error } = await supabase.storage.from(PDF_BUCKET).download(path);
  if (error || !data) throw new Error("pdf_unavailable");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (sha256(bytes) !== expectedSha256) throw new Error("pdf_hash_mismatch");
  return bytes;
}
