import type { MetadataRoute } from "next";
import { privacyPolicyFinal } from "@/lib/privacy";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Sitemap entries require absolute URLs; empty until the domain is set in lib/site.ts.
  if (!site.url) return [];

  return [
    { url: site.url, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/cotizar`, changeFrequency: "monthly", priority: 0.8 },
    // Listed only once the policy is final (the draft is noindex).
    ...(privacyPolicyFinal()
      ? [{ url: `${site.url}/privacidad`, changeFrequency: "yearly" as const, priority: 0.3 }]
      : []),
  ];
}
