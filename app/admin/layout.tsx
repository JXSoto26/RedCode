import type { Metadata } from "next";

// No auth here: layouts do not re-render on navigation. Each page checks the
// admin itself (lib/admin/auth.ts).
export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel RedCode" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
