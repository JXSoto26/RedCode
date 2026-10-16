import type { NextConfig } from "next";
import path from "node:path";
import { assertDeploymentConfig } from "./lib/deployment";

// Fails `next build` / `next start` (and Vercel builds) when the environment
// points at the wrong Supabase project, e.g. Production at DEV.
assertDeploymentConfig();

/** Canonical host; www redirects here. Keep in sync with site.url in lib/site.ts. */
const CANONICAL_HOST = "redcodewebdesign.com";

const PRIVATE = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next.js does not infer a parent
  // directory when multiple lockfiles exist on the machine.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Quote PDFs: load pdfmake (with pdfkit) and fontkit from node_modules at
  // runtime instead of bundling them.
  serverExternalPackages: ["pdfmake", "fontkit"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      // Private panel and API: never cached by shared caches, never indexed.
      { source: "/admin", headers: PRIVATE },
      { source: "/admin/:path*", headers: PRIVATE },
      { source: "/api/:path*", headers: PRIVATE },
    ];
  },

  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${CANONICAL_HOST}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
