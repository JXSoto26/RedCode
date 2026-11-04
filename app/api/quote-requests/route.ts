import { getSubmitDeps } from "@/lib/quote/config";
import { submitQuoteRequest } from "@/lib/quote/service";

// Only POST is exported: there is deliberately no way to read a request back,
// not even by reference.

const MAX_BODY_BYTES = 32_000;

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

/** Rejects cross-site posts: the form only ever submits from this origin. */
function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json(403, { error: "forbidden" });

  const deps = getSubmitDeps();
  if (!deps) return json(503, { error: "not_configured" });

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json(400, { error: "bad_request" });
  }

  const result = await submitQuoteRequest(raw, { ip: clientIp(request), now: new Date() }, deps);

  switch (result.status) {
    case "created":
    case "replayed":
      return json(result.status === "created" ? 201 : 200, {
        reference: result.reference,
        createdAt: result.createdAt,
        visitorEmail: result.visitorEmail,
      });
    case "invalid":
      return json(422, { error: "invalid", fieldErrors: result.fieldErrors });
    case "rate_limited":
      return json(429, { error: "rate_limited" });
    case "conflict":
      return json(409, { error: "conflict" });
    case "persist_failed":
      return json(503, { error: "persist_failed" });
    case "challenge_failed":
      // Nothing was saved or sent; the form gets a fresh token and retries.
      return json(403, { error: "challenge_failed", reason: result.reason });
    case "spam":
    case "bad_request":
      return json(400, { error: "bad_request" });
  }
}
