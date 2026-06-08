import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained `.next/standalone` server (minimal node_modules + server.js)
  // so the production Docker image stays small. See Dockerfile.
  output: "standalone",
};

export default nextConfig;
