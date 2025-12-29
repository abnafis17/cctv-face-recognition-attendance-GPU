import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ hostnames/patterns only (no http://, no ports)
  allowedDevOrigins: ["localhost", "10.81.100.113"],

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/camera/recognition/stream/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/camera/recognition/stream/**",
      },
      {
        protocol: "http",
        hostname: "10.81.100.113",
        port: "8000",
        pathname: "/camera/recognition/stream/**",
      },
    ],
  },
};

export default nextConfig;
