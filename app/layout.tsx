import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

const siteUrl = "https://redcode.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RedCode — Desarrollo web a medida para hacer crecer tu negocio",
    template: "%s · RedCode",
  },
  description:
    "En RedCode creamos páginas web modernas, rápidas y diseñadas para generar resultados. Desarrollo web, tiendas online, landing pages y soluciones digitales a medida.",
  keywords: [
    "desarrollo web",
    "diseño web",
    "páginas web",
    "tiendas online",
    "landing pages",
    "agencia digital",
    "Next.js",
    "RedCode",
  ],
  authors: [{ name: "RedCode" }],
  creator: "RedCode",
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: siteUrl,
    siteName: "RedCode",
    title:
      "RedCode — Transformamos ideas en experiencias web que generan resultados",
    description:
      "Creamos páginas web modernas, rápidas y diseñadas para hacer crecer tu negocio.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RedCode — Desarrollo web a medida",
    description:
      "Creamos páginas web modernas, rápidas y diseñadas para hacer crecer tu negocio.",
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
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
