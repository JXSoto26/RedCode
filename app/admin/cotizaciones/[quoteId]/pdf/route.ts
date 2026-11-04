import { getAdminSession } from "@/lib/admin/auth";
import { pdfFilename } from "@/lib/admin/quote-send";
import { getQuote, loadStoredPdf } from "@/lib/admin/quotes";

/**
 * Serves the exact stored PDF of a finalized revision (verified against its
 * recorded hash). Admins only; never cached; there is no public link.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  const session = await getAdminSession();
  if (session.status === "anonymous" || session.status === "unconfigured") return new Response(null, { status: 401 });
  if (session.status !== "admin") return new Response(null, { status: 403 });

  const { quoteId } = await ctx.params;
  const quote = await getQuote(quoteId);
  if (!quote || !quote.pdf) return new Response(null, { status: 404 });

  let bytes: Uint8Array;
  try {
    bytes = await loadStoredPdf(session.supabase, quote.pdf.path, quote.pdf.sha256);
  } catch (e) {
    console.error("[admin] pdf_download_failed", { quoteId, code: e instanceof Error ? e.message : "unknown" });
    return new Response(null, { status: 502 });
  }

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(quote.quoteReference, quote.revision)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
