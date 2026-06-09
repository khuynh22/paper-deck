import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained `.next/standalone` server (minimal node_modules + server.js)
  // so the production Docker image stays small. See Dockerfile.
  output: "standalone",
  // (The reader sanitizer is now the parser-based `sanitize-html` — pure JS, no
  // jsdom — so there's no native/ESM package to externalize from the bundle.)
};

export default nextConfig;
