import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_DESCRIPTION, HOME_TITLE, SHARE_IMAGE } from "@/lib/seo";
import { site } from "@/lib/site";
import { Providers } from "@/components/providers";
import "./globals.css";

// The automatic fallback is one Arial face for every weight, so bold text
// (the hero heading) is drawn with faux-bold Arial, narrower than Geist Bold:
// lines re-wrap and the hero shifts when Geist arrives. globals.css defines a
// per-weight fallback (Arial / Arial Bold) sized to Geist's measured widths.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["GeistMetricFallback"],
});

// Monospace text appears only below the fold (project frames, quote
// reference), so it is not preloaded on every page.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/**
 * Defaults only. Each public page sets its own title, description, canonical
 * URL and share data with pageMetadata() (lib/seo.ts); the canonical is not set
 * here so pages without one (404, private panel) do not point at the home page.
 */
export const metadata: Metadata = {
  // Set once the public domain is confirmed in lib/site.ts.
  ...(site.url && { metadataBase: new URL(site.url) }),
  title: {
    default: HOME_TITLE,
    template: `%s · ${site.name}`,
  },
  description: DEFAULT_DESCRIPTION,
  authors: [{ name: site.name }],
  creator: site.name,
  openGraph: {
    type: "website",
    locale: "es_PR",
    siteName: site.name,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: SHARE_IMAGE.url, alt: SHARE_IMAGE.alt }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-PR"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        {/* Without JavaScript, entrance animations never run: show content as-is. */}
        <noscript>
          <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
        </noscript>
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
