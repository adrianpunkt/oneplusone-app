import { getRuntimeEnv } from "@/lib/env";

export function resolveAppOrigin(requestOrigin?: string | null) {
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);

  if (normalizedRequestOrigin && isLocalOrigin(normalizedRequestOrigin)) {
    return normalizedRequestOrigin;
  }

  return (
    normalizeOrigin(getRuntimeEnv("APP_URL")) ||
    normalizedRequestOrigin ||
    normalizeOrigin(getRuntimeEnv("NEXT_PUBLIC_APP_URL")) ||
    "http://localhost:3000"
  );
}

export function isLocalOrigin(origin: string) {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function normalizeOrigin(value?: string | null) {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
