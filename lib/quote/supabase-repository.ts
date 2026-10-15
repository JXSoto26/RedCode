import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NotificationStatus } from "./options";
import type { QuoteRequestData } from "./schema";
import type { InsertResult, NotificationKind, QuoteRepository, StoredQuote } from "./types";

const TABLE = "quote_requests";
const STORED_COLUMNS = "id, reference, created_at, payload_hash, visitor_email_status";

type StoredRow = {
  id: string;
  reference: string;
  created_at: string;
  payload_hash: string;
  visitor_email_status: NotificationStatus;
};

const toStored = (row: StoredRow): StoredQuote => ({
  id: row.id,
  reference: row.reference,
  createdAt: row.created_at,
  payloadHash: row.payload_hash,
  visitorEmailStatus: row.visitor_email_status,
});

/** Maps normalized form data to table columns. */
export function toRow(d: QuoteRequestData) {
  return {
    contact_name: d.contactName,
    business_name: d.businessName,
    email: d.email,
    whatsapp: d.whatsapp,
    business_type: d.businessType,
    business_type_other: d.businessTypeOther,
    service: d.service,
    goal: d.goal,
    current_url: d.currentUrl,
    redesign_improvements: d.redesignImprovements,
    sections: d.sections,
    sections_other: d.sectionsOther,
    features: d.features,
    features_other: d.featuresOther,
    logo_status: d.logoStatus,
    copy_status: d.copyStatus,
    photos_status: d.photosStatus,
    budget_usd: d.budgetUsd,
    budget_undefined: d.budgetUndefined,
    desired_date: d.desiredDate,
    date_undefined: d.dateUndefined,
    comments: d.comments,
    consent_accepted: true,
    consent_version: d.consentVersion,
  };
}

/** Inverse of toRow, used by the retry script. */
export function fromRow(r: Record<string, unknown>): QuoteRequestData {
  return {
    contactName: r.contact_name as string,
    businessName: r.business_name as string,
    email: r.email as string,
    whatsapp: (r.whatsapp as string | null) ?? null,
    businessType: r.business_type as QuoteRequestData["businessType"],
    businessTypeOther: (r.business_type_other as string | null) ?? null,
    service: r.service as QuoteRequestData["service"],
    goal: r.goal as string,
    currentUrl: (r.current_url as string | null) ?? null,
    redesignImprovements: (r.redesign_improvements as string | null) ?? null,
    sections: (r.sections as QuoteRequestData["sections"]) ?? [],
    sectionsOther: (r.sections_other as string | null) ?? null,
    features: (r.features as QuoteRequestData["features"]) ?? [],
    featuresOther: (r.features_other as string | null) ?? null,
    logoStatus: r.logo_status as QuoteRequestData["logoStatus"],
    copyStatus: r.copy_status as QuoteRequestData["copyStatus"],
    photosStatus: r.photos_status as QuoteRequestData["photosStatus"],
    budgetUsd: (r.budget_usd as number | null) ?? null,
    budgetUndefined: Boolean(r.budget_undefined),
    desiredDate: (r.desired_date as string | null) ?? null,
    dateUndefined: Boolean(r.date_undefined),
    comments: (r.comments as string | null) ?? null,
    consentVersion: r.consent_version as string,
  };
}

export function createSupabaseAdminClient(url: string, secretKey: string) {
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createSupabaseQuoteRepository(client: SupabaseClient): QuoteRepository {
  return {
    async findByIdempotencyKey(key) {
      const { data, error } = await client
        .from(TABLE)
        .select(STORED_COLUMNS)
        .eq("idempotency_key", key)
        .maybeSingle<StoredRow>();
      if (error) throw error;
      return data ? toStored(data) : null;
    },

    async insert(record): Promise<InsertResult> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          ...toRow(record.data),
          reference: record.reference,
          idempotency_key: record.idempotencyKey,
          payload_hash: record.payloadHash,
          consented_at: record.consentedAt,
        })
        .select(STORED_COLUMNS)
        .single<StoredRow>();

      if (error) {
        // 23505 = unique_violation; the constraint name tells us which one.
        const detail = `${error.message} ${error.details ?? ""}`;
        if (error.code === "23505" && detail.includes("quote_requests_idempotency_key_unique")) {
          return { ok: false, reason: "duplicate_idempotency" };
        }
        if (error.code === "23505" && detail.includes("quote_requests_reference_unique")) {
          return { ok: false, reason: "duplicate_reference" };
        }
        throw error;
      }
      return { ok: true, quote: toStored(data) };
    },

    async updateNotification(id, kind: NotificationKind, update) {
      const prefix = kind === "visitor" ? "visitor_email" : "owner_email";
      const { error } = await client
        .from(TABLE)
        .update({
          [`${prefix}_status`]: update.status,
          [`${prefix}_attempts`]: update.attempts,
          [`${prefix}_last_error`]: update.error,
          [`${prefix}_sent_at`]: update.sentAt,
        })
        .eq("id", id);
      if (error) throw error;
    },

    async hitRateLimit(bucket, windowSeconds, limit) {
      const { data, error } = await client.rpc("quote_rate_limit_hit", {
        p_bucket: bucket,
        p_window_seconds: windowSeconds,
        p_limit: limit,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
