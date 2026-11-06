import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import sitemap from "@/app/sitemap";
import { PROJECTS, projectBySlug } from "@/lib/projects";

describe("portfolio projects", () => {
  it("lists Tabernáculo de Poder as a real project with its live site", () => {
    const p = projectBySlug("tabernaculo-de-poder");
    expect(p).not.toBeNull();
    expect(p!.title).toBe("Tabernáculo de Poder");
    expect(p!.category).toBe("Sitio web para iglesia");
    expect(p!.href).toBe("https://tabernaculodepoder.com");
    expect(projectBySlug("no-existe")).toBeNull();
  });

  it.each(PROJECTS.map((p) => [p.slug, p] as const))("%s: screenshots exist with the declared size and descriptive alt text", async (_slug, p) => {
    expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const img of [p.images.desktop, p.images.mobile]) {
      const file = `public${img.src}`;
      expect(existsSync(file), file).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([img.width, img.height, "webp"]);
      expect(img.alt.length).toBeGreaterThan(40);
      expect(img.alt).toContain(p.title);
    }
    expect(p.images.desktop.width).toBeGreaterThan(p.images.desktop.height);
    expect(p.images.mobile.height).toBeGreaterThan(p.images.mobile.width);
  });

  it("makes no invented claims: no testimonials, ratings, metrics or results", () => {
    const text = JSON.stringify(PROJECTS).toLowerCase();
    expect(text).not.toMatch(/testimonio|reseña|calificaci|estrellas|★|\d+\s?%|aument|crecimiento|ventas|visitas mensuales|clientes satisfechos/);
  });

  it("adds every case study to the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    for (const p of PROJECTS) expect(urls).toContain(`https://redcodewebdesign.com/proyectos/${p.slug}`);
  });
});
