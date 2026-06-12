import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
