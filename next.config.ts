import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "100.86.129.62"],
  async redirects() {
    return [
      {
        source: "/profile",
        destination: "/my-story",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
