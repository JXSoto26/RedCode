import "server-only";
import { REQUEST_STATUSES, type NotificationStatus } from "@/lib/quote/options";
import { fromRow } from "@/lib/quote/supabase-repository";
import type { QuoteRequestData } from "@/lib/quote/schema";
import { requireAdmin } from "./auth";
import type { StoredDraft } from "./draft";
import { isRequestStatus, type RequestStatus } from "./labels";
import { decimalToHundredths } from "./money";

/**
 * Reads for /admin. Each function checks the admin itself and queries as the
 * signed-in user, so RLS applies even if a caller forgets a check.
 */

export const PAGE_SIZE = 20;

export type RequestListItem = {
  id: string;
  reference: string;
  businessName: string;
  contactName: string;
  service: QuoteRequestData["service"];
  createdAt: string;
  status: RequestStatus;
};

export type ListParams = { q: string; status: RequestStatus | null; page: number };

/** Parses ?q=&estado=&pagina= from the URL; anything unexpected is ignored. */
export function parseListParams(raw: Record<string, string | string[] | undefined>): ListParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const page = Number.parseInt(first(raw.pagina), 10);
  const status = first(raw.estado);
  return {
    q: sanitizeSearch(first(raw.q)),
    status: isRequestStatus(status) ? status : null,
    page: Number.isFinite(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/**
 * Keeps letters, digits, spaces and . @ - so the term cannot alter the
 * PostgREST filter syntax (commas, parentheses, quotes) or add wildcards.
 */
export function sanitizeSearch(input: string) {
  return input
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s.@-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export type ListResult =
  | { ok: true; items: RequestListItem[]; total: number; page: number; pageCount: number }
  | { ok: false; error: "out_of_range" | "unavailable" };

export async function listRequests({ q, status, page }: ListParams): Promise<ListResult> {
  const { supabase } = await requireAdmin();
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("quote_requests")
    .select("id, reference, business_name, contact_name, service, created_at, status", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (status) query = query.eq("status", status);
  if (q) {
    const term = `"*${q}*"`;
    query = query.or(`reference.ilike.${term},business_name.ilike.${term},contact_name.ilike.${term}`);
  }

  const { data, count, error } = await query;
  if (error) {
    // PGRST103: the requested page is past the last one.
    if (error.code === "PGRST103") return { ok: false, error: "out_of_range" };
    console.error("[admin] list_failed", { code: error.code });
    return { ok: false, error: "unavailable" };
  }

  const total = count ?? 0;
  return {
    ok: true,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    items: (data ?? []).map((r) => ({
      id: r.id,
      reference: r.reference,
      businessName: r.business_name,
      contactName: r.contact_name,
      service: r.service,
      createdAt: r.created_at,
      status: r.status,
    })),
  };
}

type Notification = {
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
};

export type RequestDetail = {
  id: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
  status: RequestStatus;
  consentedAt: string;
  data: QuoteRequestData;
  /** Legacy column, edited only from the Supabase Table Editor before this panel existed. */
  legacyNotes: string | null;
  visitorEmail: Notification;
  ownerEmail: Notification;
  history: { id: number; from: RequestStatus; to: RequestStatus; by: string; at: string }[];
  notes: { id: number; body: string; by: string; at: string }[];
  draft: StoredDraft | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when the id is malformed or the request does not exist. */
export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  if (!UUID.test(id)) return null;
  const { supabase } = await requireAdmin();

  const [request, history, notes, draft] = await Promise.all([
    supabase.from("quote_requests").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("quote_status_history")
      .select("id, from_status, to_status, changed_by_email, changed_at")
      .eq("quote_request_id", id)
      .order("changed_at", { ascending: false }),
    supabase
      .from("quote_notes")
      .select("id, body, created_by_email, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quote_drafts")
      .select(
        "id, version, title, summary, deliverables, exclusions, estimated_time, terms, validity, updated_at, quote_draft_items(id, position, description, quantity::text, unit_price_cents)"
      )
      .eq("quote_request_id", id)
      .maybeSingle(),
  ]);

  for (const result of [request, history, notes, draft]) {
    if (result.error) throw new Error(`detail_failed:${result.error.code}`);
  }
  const r = request.data;
  if (!r) return null;

  return {
    id: r.id,
    reference: r.reference,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    status: isRequestStatus(r.status) ? r.status : REQUEST_STATUSES[0],
    consentedAt: r.consented_at,
    data: fromRow(r),
    legacyNotes: r.internal_notes ?? null,
    visitorEmail: {
      status: r.visitor_email_status,
      attempts: r.visitor_email_attempts,
      lastError: r.visitor_email_last_error,
      sentAt: r.visitor_email_sent_at,
    },
    ownerEmail: {
      status: r.owner_email_status,
      attempts: r.owner_email_attempts,
      lastError: r.owner_email_last_error,
      sentAt: r.owner_email_sent_at,
    },
    history: (history.data ?? []).map((h) => ({
      id: h.id,
      from: h.from_status,
      to: h.to_status,
      by: h.changed_by_email,
      at: h.changed_at,
    })),
    notes: (notes.data ?? []).map((n) => ({ id: n.id, body: n.body, by: n.created_by_email, at: n.created_at })),
    draft: draft.data ? toStoredDraft(draft.data) : null,
  };
}

type DraftRow = {
  id: string;
  version: number;
  title: string | null;
  summary: string | null;
  deliverables: string | null;
  exclusions: string | null;
  estimated_time: string | null;
  terms: string | null;
  validity: string | null;
  updated_at: string;
  quote_draft_items: {
    id: string;
    position: number;
    description: string | null;
    quantity: string | null;
    unit_price_cents: number | null;
  }[];
};

export function toStoredDraft(d: DraftRow): StoredDraft {
  return {
    id: d.id,
    version: d.version,
    title: d.title,
    summary: d.summary,
    deliverables: d.deliverables,
    exclusions: d.exclusions,
    estimatedTime: d.estimated_time,
    terms: d.terms,
    validity: d.validity,
    updatedAt: d.updated_at,
    items: [...(d.quote_draft_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        description: i.description,
        quantityHundredths: i.quantity === null ? null : decimalToHundredths(i.quantity),
        unitPriceCents: i.unit_price_cents === null ? null : Number(i.unit_price_cents),
      })),
  };
}
