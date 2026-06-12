import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host as a Node.js server with a persistent disk (architecture.md §10).
  // `standalone` emits `.next/standalone/server.js` with only the traced runtime
  // files, so the Docker image stays small and needs no `node_modules` install.
  output: "standalone",

  // better-sqlite3 is a native module: keep it out of the bundle so the
  // prebuilt binary is required at runtime and never shipped to the client.
  serverExternalPackages: ["better-sqlite3"],

  // When storage is backed by Vercel Blob, gallery images load directly from the
  // Blob CDN rather than the same-origin /api/images proxy. Allow that host.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
