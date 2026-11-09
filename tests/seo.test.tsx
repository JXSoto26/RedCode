import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/sections/hero";
import sitemap from "@/app/sitemap";
import { BRAND_LOGO, brandJsonLd, jsonLdScript, pageMetadata, SHARE_IMAGE } from "@/lib/seo";
import { site } from "@/lib/site";

const PERSONAL = /jeremy|\bsoto\b|\bflores\b/i;

describe("hero", () => {
  const html = renderToStaticMarkup(<Hero quoteEnabled />);
  const h1 = /<h1[^>]*>/.exec(html)![0];
  const intro = /<p class="hero-rise[^>]*>/.exec(html)![0];

  it("renders the heading and intro visible in the server HTML (no opacity:0, no JavaScript needed)", () => {
    for (const tag of [h1, intro]) {
      expect(tag).toContain("hero-rise");
      expect(tag).not.toMatch(/opacity\s*:\s*0/);
      expect(tag).not.toContain("data-reveal");
    }
    expect(html).toContain("presentar tu negocio");
  });

  it("animates them with transform only, and not at all with reduced motion", () => {
    const css = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");
    const keyframes = /@keyframes hero-rise \{[^}]*\}[^}]*\}/.exec(css)![0];
    expect(keyframes).toContain("transform");
    expect(keyframes).not.toContain("opacity");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hero-rise \{\s*animation: none;/);
  });

  it("uses a per-weight Geist fallback (real Arial Bold for bold) so text does not re-wrap when the font loads", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/Geist\(\{[^}]*adjustFontFallback: false,[^}]*fallback: \["GeistMetricFallback"\]/);
    const css = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");
    const faces = [...css.matchAll(/@font-face \{[^}]*font-family: GeistMetricFallback;[^}]*\}/g)].map((m) => m[0]);
    expect(faces).toHaveLength(4);
    expect(faces.filter((f) => f.includes('local("Arial Bold")'))).toHaveLength(2);
    for (const f of faces) expect(f).toMatch(/size-adjust: \d+(\.\d+)?%/);
  });
});

describe("brand structured data", () => {
  const data = brandJsonLd()!;
  const [org, website] = data["@graph"];

  it("is an Organization + WebSite graph linked by stable @id values", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(org["@type"]).toBe("Organization");
    expect(org["@id"]).toBe("https://redcodewebdesign.com/#organization");
    expect(website["@type"]).toBe("WebSite");
    expect(website["@id"]).toBe("https://redcodewebdesign.com/#website");
    expect(website.publisher).toEqual({ "@id": org["@id"] });
    expect(org.url).toBe("https://redcodewebdesign.com/");
    expect(website.url).toBe(org.url);
  });

  it("uses only the real brand facts: name, URL, logo and email", () => {
    expect(org.name).toBe("RedCode Web Design Studio");
    expect(org.alternateName).toBe("RedCode");
    expect(org.email).toBe(site.contact.email);
    expect(org.logo.url).toBe("https://redcodewebdesign.com/brand/redcode-logo-512.png");
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/LocalBusiness|address|telephone|sameAs|review|rating|founder|legalName|priceRange|offers/i);
    expect(text).not.toMatch(PERSONAL);
  });

  it("serializes to valid JSON with no raw '<'", () => {
    const script = jsonLdScript({ ...data, test: "</script>" });
    expect(script).not.toContain("<");
    expect(JSON.parse(script).test).toBe("</script>");
  });

  it("points at a square logo of at least 112 px that exists", async () => {
    const meta = await sharp(`public${BRAND_LOGO.path}`).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([BRAND_LOGO.width, BRAND_LOGO.height, "png"]);
    expect(BRAND_LOGO.width).toBeGreaterThanOrEqual(112);
  });
});

describe("share metadata", () => {
  it("brand share image is a 1200x630 PNG", async () => {
    const meta = await sharp(`public${SHARE_IMAGE.url}`).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, "png"]);
  });

  it("gives each page its own title, URL and canonical, with a large card", () => {
    const m = pageMetadata({ title: "Solicitar cotización", description: "D", path: "/cotizar" });
    expect(m.title).toBe("Solicitar cotización");
    expect(m.alternates).toEqual({ canonical: "/cotizar" });
    expect(m.openGraph).toMatchObject({
      title: "Solicitar cotización · RedCode Web Design Studio",
      url: "/cotizar",
      siteName: site.name,
      locale: "es_PR",
      images: [SHARE_IMAGE],
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "Solicitar cotización · RedCode Web Design Studio" });

    const home = pageMetadata({ title: { absolute: "Inicio X" }, description: "D", path: "/" });
    expect(home.openGraph).toMatchObject({ title: "Inicio X", url: "/" });
  });

  it("keeps a page's own image (the case study screenshot) when given", () => {
    const image = { url: "/projects/x.webp", width: 1440, height: 900, alt: "Captura" };
    const m = pageMetadata({ title: "T", description: "D", path: "/proyectos/x", type: "article", image });
    expect(m.openGraph).toMatchObject({ type: "article", images: [image] });
    expect(m.twitter).toMatchObject({ images: [{ url: image.url, alt: image.alt }] });
  });

  it("the root layout no longer sends keywords, a home canonical for every page, or preloads Geist Mono", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/keywords/);
    expect(layout).not.toMatch(/alternates|canonical:/);
    expect(layout).toMatch(/Geist_Mono\(\{[^}]*preload: false/);
  });
});

describe("build", () => {
  it("does not reuse the Turbopack build cache (a cached build shipped an outdated globals.css)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toMatch(/experimental: \{\s*turbopackFileSystemCacheForBuild: false,/);
  });
});

describe("cleanup and sitemap", () => {
  it("removed the unused template assets", () => {
    for (const f of ["file", "globe", "next", "vercel", "window"]) expect(existsSync(`public/${f}.svg`)).toBe(false);
  });

  it("lists no invented lastmod dates", () => {
    for (const entry of sitemap()) expect(entry.lastModified).toBeUndefined();
  });

  it("has a Spanish 404 page with links home, to projects and to the quote", () => {
    const page = readFileSync("app/not-found.tsx", "utf8");
    expect(page).toContain("Página no encontrada");
    for (const href of ['href="/"', 'href="/#proyectos"', "href={ctaHref}"]) expect(page).toContain(href);
    // A streamed not-found answers 200: keep it free of Suspense and request data.
    expect(page).not.toMatch(/<Suspense|connection\(|cookies\(|headers\(/);
  });
});
