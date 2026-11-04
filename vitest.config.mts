import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Local tests only: no network, no real Supabase or email.
// Real DEV checks live in tests/dev and run with `npm run test:dev`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "tests/dev/**"],
    // The form tests drive a full multi-step UI in jsdom; with every file
    // running in parallel on this machine they can exceed the 5 s default.
    testTimeout: 20_000,
  },
});
