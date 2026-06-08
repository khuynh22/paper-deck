import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained `.next/standalone` server (minimal node_modules + server.js)
  // so the production Docker image stays small. See Dockerfile.
  output: "standalone",
  // Don't bundle isomorphic-dompurify into the server build: it pulls in jsdom,
  // whose dynamic requires don't survive Next's bundling/tracing in a serverless
  // (Vercel) function — importing it then throws at runtime and 500s the reader
  // route on every request. Externalizing makes Vercel `require()` it from
  // node_modules instead. (jsdom itself is already auto-externalized by Next.)
  serverExternalPackages: ["isomorphic-dompurify"],
};

export default nextConfig;
