import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module: keep it out of the bundle so the
  // prebuilt binary is required at runtime and never shipped to the client.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
