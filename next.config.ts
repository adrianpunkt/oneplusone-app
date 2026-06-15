import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.86.129.62"],
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
