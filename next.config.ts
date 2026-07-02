import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next.js does not infer a parent
  // directory when multiple lockfiles exist on the machine.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
