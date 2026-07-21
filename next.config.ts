import type { NextConfig } from "next";
import { getDeploymentId } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "100.86.129.62"],
  deploymentId: getDeploymentId(),
  experimental: {
    // Safari can repeatedly reload when a persisted Turbopack HMR chunk or its
    // source map no longer matches the current development module graph.
    turbopackFileSystemCacheForDev: false,
    turbopackSourceMaps: false,
  },
  async redirects() {
    return [
      {
        source: "/events/:id([^/.]+)",
        destination: "/going-out",
        permanent: false,
      },
      {
        source: "/profile",
        destination: "/my-story",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
