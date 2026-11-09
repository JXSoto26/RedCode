import type { Metadata } from "next";
import { site } from "@/lib/site";

/**
 * Search and social metadata for the public pages, and the brand's structured
 * data. Only real, public brand facts: name, URL, logo and email. No personal
 * name, address, phone, reviews or social profiles.
 */

export const DEFAULT_DESCRIPTION =
  "Diseño y desarrollo de páginas web informativas, landing pages y rediseños para pequeños negocios, profesionales independientes e iglesias en Puerto Rico.";

export const HOME_TITLE = `${site.name} | Páginas web en Puerto Rico`;

/** Brand share image (approved horizontal logo on white, not stretched). */
export const SHARE_IMAGE = {
  url: "/brand/redcode-share-1200x630.png",
  width: 1200,
  height: 630,
  alt: `Logo de ${site.name}`,
} as const;

/** Square brand logo for structured data (same monogram as the favicon). */
export const BRAND_LOGO = { path: "/brand/redcode-logo-512.png", width: 512, height: 512 } as const;

type ShareImage = { url: string; width: number; height: number; alt: string };

/**
 * Title, description, canonical URL, Open Graph and X card for one page.
 * Next.js merges metadata shallowly, so each page sends the full openGraph
 * and twitter objects (they replace the root layout's, they do not add to it).
 */
export function pageMetadata({
  title,
  description,
  path,
  image = SHARE_IMAGE,
  type = "website",
}: {
  /** Page title; the layout template adds " · RedCode Web Design Studio" unless absolute. */
  title: string | { absolute: string };
  description: string;
  /** Path from the site root, e.g. "/cotizar". */
  path: string;
  image?: ShareImage;
  type?: "website" | "article";
}): Metadata {
  const shareTitle = typeof title === "string" ? `${title} · ${site.name}` : title.absolute;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: "es_PR",
      siteName: site.name,
      title: shareTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}

/**
 * Organization + WebSite graph for the home page, linked by @id. Returns null
 * until the public domain is set in lib/site.ts.
 */
export function brandJsonLd() {
  if (!site.url) return null;
  const home = `${site.url}/`;
  const orgId = `${home}#organization`;
  const logoUrl = `${site.url}${BRAND_LOGO.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: site.name,
        alternateName: site.shortName,
        url: home,
        logo: {
          "@type": "ImageObject",
          "@id": `${home}#logo`,
          url: logoUrl,
          contentUrl: logoUrl,
          width: BRAND_LOGO.width,
          height: BRAND_LOGO.height,
          caption: site.name,
        },
        ...(site.contact.email && { email: site.contact.email }),
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: site.name,
        alternateName: site.shortName,
        inLanguage: "es-PR",
        publisher: { "@id": orgId },
      },
    ] as const,
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped (Next.js JSON-LD guide). */
export const jsonLdScript = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");
