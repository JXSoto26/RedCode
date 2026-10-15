import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    // The sitemap needs an absolute URL; it is listed once the domain is set in lib/site.ts.
    ...(site.url && { sitemap: `${site.url}/sitemap.xml` }),
  };
}
