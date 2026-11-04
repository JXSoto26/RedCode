import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

// Runs tests/dev against the Supabase DEV project configured in .env.local.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/dev/**/*.test.ts"],
    env: loadEnv("development", process.cwd(), ""),
    testTimeout: 20_000,
  },
});
