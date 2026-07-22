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
  async headers() {
    return [
      {
        source: "/event-invitation/decline/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
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
