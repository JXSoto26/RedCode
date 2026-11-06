import { site } from "@/lib/site";

/**
 * Shared HTML frame for every email the site sends (visitor confirmation,
 * internal notice and quote email).
 *
 * Template versions are stored with each request and each quote send. A retry
 * rebuilds the email from stored data with the same idempotency key, so it
 * must render the exact HTML of its first attempt: version 1 is the original
 * text-only design, kept byte for byte; version 2 adds the branded header.
 * Rows without a stored version (before the column existed) are version 1.
 */
export const EMAIL_TEMPLATES = [1, 2] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];
export const CURRENT_EMAIL_TEMPLATE: EmailTemplate = 2;

export const emailTemplateOf = (value: unknown): EmailTemplate => (value === 2 ? 2 : 1);

/**
 * Logo for emails: the horizontal red/dark variant on white, 440×70 PNG shown
 * at 220×35. Served from the site's own domain (public/email/), versioned in
 * its name so the URL never changes content.
 */
export const EMAIL_LOGO = {
  path: "/email/redcode-logo-v1.png",
  url: `${site.url ?? "https://redcodewebdesign.com"}/email/redcode-logo-v1.png`,
  width: 220,
  height: 35,
  alt: site.name,
} as const;

const FONT = "Arial,Helvetica,sans-serif";

/** Version 1: the original frame, unchanged (needed for exact retries). */
function legacyDocument(inner: string, bodyStyle: string) {
  return `<!doctype html><html lang="es"><body style="${bodyStyle}">
${inner}
</body></html>`;
}

/**
 * Version 2: white header with the logo, content card and a text footer.
 * Table-based with inline styles for mail clients. The header and the PNG are
 * opaque white, so the logo stays legible when a client darkens the email.
 * If images are blocked, the alt text and the footer still name the studio.
 */
function brandedDocument(inner: string, lineHeight: string, logoUrl: string) {
  const domain = site.url ? new URL(site.url).host : "redcodewebdesign.com";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${site.name}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:8px;border-collapse:separate">
<tr><td style="padding:20px 24px 16px;background-color:#ffffff;border-bottom:3px solid #d20e1c;border-radius:8px 8px 0 0">
<img src="${logoUrl}" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="${EMAIL_LOGO.alt}" style="display:block;width:${EMAIL_LOGO.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:18px;font-weight:bold;line-height:35px;color:#d20e1c">
</td></tr>
<tr><td style="padding:24px;font-family:${FONT};font-size:15px;color:#18181b;line-height:${lineHeight}">
${inner}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;font-family:${FONT};font-size:12px;line-height:1.5;color:#71717a">
${site.name} · ${site.location} · <a href="${site.url ?? "https://redcodewebdesign.com"}" style="color:#71717a;text-decoration:underline">${domain}</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Wraps escaped HTML content in the frame of the given template version.
 * `legacyBodyStyle` is the exact body style the version-1 email used.
 * `logoUrl` exists only so local previews can point at the local file.
 */
export function emailDocument(
  inner: string,
  template: EmailTemplate,
  opts: { legacyBodyStyle: string; lineHeight: string; logoUrl?: string }
) {
  return template === 1
    ? legacyDocument(inner, opts.legacyBodyStyle)
    : brandedDocument(inner, opts.lineHeight, opts.logoUrl ?? EMAIL_LOGO.url);
}
