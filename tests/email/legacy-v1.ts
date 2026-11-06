// Verbatim copies of the version-1 email HTML builders (before the branded
// header). Used only to prove that version 1 still renders byte for byte.
type Row = [label: string, value: string];

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function legacyRender(intro: string[], rows: Row[], outro: string[]) {
  const text = [
    ...intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...outro,
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.5;max-width:600px;margin:0 auto;padding:16px">
${intro.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
<table role="presentation" style="border-collapse:collapse;width:100%;margin:16px 0">
${rows
  .map(
    ([k, v]) =>
      `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;border-bottom:1px solid #e4e4e7;white-space:nowrap">${escapeHtml(k)}</th><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`
  )
  .join("\n")}
</table>
${outro.map((p) => `<p style="color:#52525b;font-size:14px">${escapeHtml(p)}</p>`).join("\n")}
</body></html>`;

  return { text, html };
}

export function legacyQuoteEmailHtml(body: string) {
  const paragraphs = body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p.trim()).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.55;max-width:600px;margin:0 auto;padding:16px">
${paragraphs}
</body></html>`;
}
