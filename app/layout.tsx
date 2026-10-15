import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { site } from "@/lib/site";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const description =
  "Diseño y desarrollo de páginas web informativas, landing pages y rediseños para pequeños negocios, profesionales independientes e iglesias en Puerto Rico.";

export const metadata: Metadata = {
  // Set once the public domain is confirmed in lib/site.ts.
  ...(site.url && {
    metadataBase: new URL(site.url),
    alternates: { canonical: "/" },
  }),
  title: {
    default: `${site.name} | Páginas web en Puerto Rico`,
    template: `%s · ${site.name}`,
  },
  description,
  keywords: [
    "diseño web",
    "páginas web",
    "landing pages",
    "rediseño web",
    "Puerto Rico",
    "pequeños negocios",
    "iglesias",
    site.name,
  ],
  authors: [{ name: site.owner }],
  creator: site.owner,
  openGraph: {
    type: "website",
    locale: "es_PR",
    siteName: site.name,
    title: `${site.name} | Páginas web en Puerto Rico`,
    description,
    ...(site.url && { url: site.url }),
  },
  twitter: {
    card: "summary",
    title: `${site.name} | Páginas web en Puerto Rico`,
    description,
  },
  robots: {
    index: true,
    follow: true,
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
