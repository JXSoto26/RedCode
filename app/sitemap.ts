import type { MetadataRoute } from "next";
import { privacyPolicyFinal } from "@/lib/privacy";
import { PROJECTS } from "@/lib/projects";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Sitemap entries require absolute URLs; empty until the domain is set in lib/site.ts.
  if (!site.url) return [];

  // No lastmod: Google uses it only when it is accurate, and there is no
  // maintained per-page change date. Add it only with real dates.

  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/cotizar`, changeFrequency: "monthly", priority: 0.8 },
    ...PROJECTS.map((p) => ({
      url: `${site.url}/proyectos/${p.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    // Listed only once the policy is final (the draft is noindex).
    ...(privacyPolicyFinal()
      ? [{ url: `${site.url}/privacidad`, changeFrequency: "yearly" as const, priority: 0.3 }]
      : []),
  ];
}
