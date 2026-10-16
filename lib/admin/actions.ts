"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { REQUEST_STATUSES } from "@/lib/quote/options";
import { RELATIONSHIPS } from "./labels";
import { requireAdmin } from "./auth";
import { parseDraftSave } from "./draft";
import { computeTotals, decimalToHundredths } from "./money";
import { createAdminSupabase } from "./supabase";

/**
 * Server Actions for /admin. They are public POST endpoints: each one checks
 * the admin and validates its input on its own, whatever the UI shows.
 */

export type ActionState = { ok: boolean; message: string | null };

type RpcError = { code?: string } | null;

/** Maps the SQLSTATEs raised by the admin_* functions to messages. */
function rpcMessage(error: RpcError, conflict: string) {
  switch (error?.code) {
    case "RC409":
      return conflict;
    case "RC404":
      return "La solicitud ya no existe.";
    case "RC403":
      return "Tu cuenta no tiene acceso al panel.";
    case "RC422":
    case "23514":
      return "Los datos no son válidos.";
    default:
      console.error("[admin] rpc_failed", { code: error?.code ?? "unknown" });
      return "No se pudo guardar. Inténtalo de nuevo.";
  }
}

const detailPath = (id: string) => `/admin/solicitudes/${id}`;

// --- Session -------------------------------------------------------------------

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, message: "Escribe tu email y tu contraseña." };

  const supabase = await createAdminSupabase();
  if (!supabase) return { ok: false, message: "El acceso al panel no está configurado." };

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.status === 429) return { ok: false, message: "Demasiados intentos. Espera unos minutos." };
    return { ok: false, message: "Email o contraseña incorrectos." };
  }

  const { data: row, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminError || !row) {
    // Valid account without admin rights: do not keep the session around.
    await supabase.auth.signOut();
    return { ok: false, message: "Esta cuenta no tiene acceso al panel." };
  }

  redirect("/admin/solicitudes");
}

export async function logout() {
  const supabase = await createAdminSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/admin/login");
}

// --- Status -----------------------------------------------------------------------

const statusSchema = z.object({
  requestId: z.uuid(),
  expectedStatus: z.enum(REQUEST_STATUSES),
  newStatus: z.enum(REQUEST_STATUSES),
});

/** Changes the status and records the history in one transaction. Sends no email. */
export async function changeStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Elige un estado válido." };
  const { requestId, expectedStatus, newStatus } = parsed.data;
  if (expectedStatus === newStatus) return { ok: true, message: "El estado no cambió." };

  const { error } = await supabase.rpc("admin_set_quote_status", {
    p_request_id: requestId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
  });
  if (error) {
    return {
      ok: false,
      message: rpcMessage(error, "El estado cambió en otra pestaña. Recarga la página para ver el estado actual."),
    };
  }

  revalidatePath(detailPath(requestId));
  revalidatePath("/admin/solicitudes");
  return { ok: true, message: "Estado actualizado." };
}

// --- Notes ------------------------------------------------------------------------

const noteSchema = z.object({
  requestId: z.uuid(),
  body: z.string().trim().min(1, "Escribe la nota.").max(5000, "Máximo 5000 caracteres."),
});

export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nota no válida." };

  const { error } = await supabase.rpc("admin_add_quote_note", {
    p_request_id: parsed.data.requestId,
    p_body: parsed.data.body,
  });
  if (error) return { ok: false, message: rpcMessage(error, "No se pudo guardar la nota.") };

  revalidatePath(detailPath(parsed.data.requestId));
  return { ok: true, message: "Nota guardada." };
}

// --- Draft ------------------------------------------------------------------------

export type DraftState = {
  ok: boolean;
  errors: string[];
  conflict: boolean;
  version: number | null;
  savedAt: string | null;
  totalCents: number | null;
  incomplete: boolean;
};

/**
 * Saves the draft (fields + items) atomically with optimistic concurrency.
 * Expects a "payload" JSON field built by the editor. Never changes the
 * request status.
 */
export async function saveDraft(prev: DraftState, formData: FormData): Promise<DraftState> {
  const { supabase } = await requireAdmin();
  const fail = (errors: string[], conflict = false): DraftState => ({ ...prev, ok: false, errors, conflict });

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return fail(["No se pudo leer el borrador."]);
  }
  const parsed = parseDraftSave(raw);
  if (!parsed.ok) return fail(parsed.errors);

  const { data: version, error } = await supabase.rpc("admin_save_quote_draft", parsed.payload);
  if (error) {
    const conflict = error.code === "RC409";
    return fail(
      [
        rpcMessage(
          error,
          "Otra pestaña guardó este borrador antes. Copia tus cambios si los necesitas y recarga la página."
        ),
      ],
      conflict
    );
  }

  // Totals are always computed on the server, from what was saved.
  const totals = computeTotals(
    parsed.payload.p_items.map((i) => ({
      description: i.description,
      quantityHundredths: i.quantity === null ? null : decimalToHundredths(i.quantity),
      unitPriceCents: i.unitPriceCents,
    }))
  );

  revalidatePath(detailPath(parsed.payload.p_request_id));
  revalidatePath(`${detailPath(parsed.payload.p_request_id)}/cotizacion`);
  return {
    ok: true,
    errors: [],
    conflict: false,
    version: Number(version),
    savedAt: new Date().toISOString(),
    totalCents: totals.totalCents,
    incomplete: totals.incomplete,
  };
}

// --- Relationship and retention ----------------------------------------------------

const relationshipSchema = z.object({
  requestId: z.uuid(),
  expected: z.enum(RELATIONSHIPS),
  relationship: z.enum(RELATIONSHIPS),
});

/**
 * Records whether the request became a client or the relationship ended.
 * Counts as documented commercial activity. Deletes nothing.
 */
export async function changeRelationship(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = relationshipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Elige una relación válida." };
  const { requestId, expected, relationship } = parsed.data;
  if (expected === relationship) return { ok: true, message: "La relación no cambió." };

  const { error } = await supabase.rpc("admin_set_relationship", {
    p_request_id: requestId,
    p_expected: expected,
    p_new: relationship,
  });
  if (error) {
    return { ok: false, message: rpcMessage(error, "La relación cambió en otra pestaña o el expediente se está eliminando. Recarga la página.") };
  }

  revalidatePath(detailPath(requestId));
  return { ok: true, message: "Relación actualizada." };
}

const holdSchema = z.discriminatedUnion("hold", [
  z.object({
    requestId: z.uuid(),
    hold: z.literal("on"),
    reason: z.string().trim().min(3, "Describe el motivo (mínimo 3 caracteres).").max(300, "Máximo 300 caracteres."),
  }),
  z.object({ requestId: z.uuid(), hold: z.literal("off") }),
]);

/**
 * Marks (or clears) a documented reason to keep the file, such as a dispute or
 * a legal obligation. It is not commercial activity: the 12 months still count.
 */
export async function setRetentionHold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const parsed = holdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const on = parsed.data.hold === "on";

  const { error } = await supabase.rpc("admin_set_retention_hold", {
    p_request_id: parsed.data.requestId,
    p_hold: on,
    p_reason: parsed.data.hold === "on" ? parsed.data.reason : null,
  });
  if (error) return { ok: false, message: rpcMessage(error, "El expediente se está eliminando. Recarga la página.") };

  revalidatePath(detailPath(parsed.data.requestId));
  return { ok: true, message: on ? "Conservación documentada guardada." : "Conservación retirada." };
}
