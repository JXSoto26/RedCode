import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PRIVACY_POLICY, privacyPolicyFinal } from "@/lib/privacy";
import { site } from "@/lib/site";
import nextConfig from "../next.config";

describe("launch readiness", () => {
  it("uses the apex domain as canonical origin", () => {
    expect(site.url).toBe("https://redcodewebdesign.com");
  });

  it("sitemap lists public pages; the privacy draft only once final", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://redcodewebdesign.com");
    expect(urls).toContain("https://redcodewebdesign.com/cotizar");
    expect(urls.some((u) => u.includes("/admin"))).toBe(false);
    expect(urls.includes("https://redcodewebdesign.com/privacidad")).toBe(privacyPolicyFinal());
  });

  it("robots keeps crawlers out of the panel and the API", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(["/admin", "/api/"]));
    expect(r.sitemap).toBe("https://redcodewebdesign.com/sitemap.xml");
  });

  it("the privacy policy is still a draft (launch pending) and is not indexed", async () => {
    expect(PRIVACY_POLICY.status).toBe("borrador");
    const page = await import("@/app/privacidad/page");
    expect(page.metadata.robots).toEqual({ index: false, follow: true });
    expect(page.metadata.alternates).toEqual({ canonical: "/privacidad" });
  }, 60_000); // importing the page loads the whole component tree

  it("private routes are never cached publicly nor indexed", async () => {
    const headers = await nextConfig.headers!();
    for (const source of ["/admin", "/admin/:path*", "/api/:path*"]) {
      const rule = headers.find((h) => h.source === source);
      expect(rule?.headers).toEqual(
        expect.arrayContaining([
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ])
      );
    }
  });

  it("www redirects permanently to the apex", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({
      source: "/:path*",
      has: [{ type: "host", value: "www.redcodewebdesign.com" }],
      destination: "https://redcodewebdesign.com/:path*",
      permanent: true,
    });
  });

  it("the deployment guard runs at build/start and on every server instance", () => {
    expect(readFileSync("next.config.ts", "utf8")).toMatch(/^assertDeploymentConfig\(\);$/m);
    expect(readFileSync("instrumentation.ts", "utf8")).toContain("assertDeploymentConfig()");
  });
});
