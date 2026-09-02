import type { NextConfig } from "next";

function parseUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function uniqueObjects<T extends object>(items: T[]) {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = JSON.stringify(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

const aiUrl = parseUrl(process.env.NEXT_PUBLIC_AI_URL);
const backendUrl = parseUrl(process.env.NEXT_PUBLIC_BACKEND_URL);

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // hostnames only (no http://, no ports)
  // Needed when you open the dev UI from another device (LAN).
  allowedDevOrigins: uniqueStrings([
    "localhost",
    "127.0.0.1",
    // keep the previously allowed hosts
    "10.81.100.113",
    "172.20.60.101",
    // and auto-allow whatever your .env points to
    aiUrl?.hostname,
    backendUrl?.hostname,
  ]),

  images: {
    // NOTE: The UI uses MJPEG endpoints under /camera/* (streams are not "images").
    // We keep this open enough so Next/Image doesn't crash in dev/prod builds.
    remotePatterns: uniqueObjects([
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/camera/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/presence/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/camera/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/presence/**",
      },
      {
        protocol: "http",
        hostname: "10.81.100.113",
        port: "8000",
        pathname: "/camera/**",
      },
      {
        protocol: "http",
        hostname: "10.81.100.113",
        port: "8000",
        pathname: "/presence/**",
      },
      ...(aiUrl
        ? [
            {
              protocol: (aiUrl.protocol.replace(":", "") ||
                "http") as "http" | "https",
              hostname: aiUrl.hostname,
              ...(aiUrl.port ? { port: aiUrl.port } : {}),
              pathname: "/camera/**",
            },
            {
              protocol: (aiUrl.protocol.replace(":", "") ||
                "http") as "http" | "https",
              hostname: aiUrl.hostname,
              ...(aiUrl.port ? { port: aiUrl.port } : {}),
              pathname: "/presence/**",
            },
          ]
        : []),
    ]),
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "@vladmandic/face-api"];
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      encoding: false,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
