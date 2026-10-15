import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Sitemap entries require absolute URLs; empty until the domain is set in lib/site.ts.
  if (!site.url) return [];

  return [
    {
      url: site.url,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
