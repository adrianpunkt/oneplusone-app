import { emailSchema } from "@/lib/validators/story";
import { safeInternalPath } from "@/lib/utils";

export const DEFAULT_LOGIN_NEXT_PATH = "/dashboard";
export const MEMBER_LOGIN_LINK_TTL_MINUTES = 60;

export type MemberLoginOtpType = "email" | "magiclink";

export function encodeEmailHint(email: string) {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeEmailHint(value: string | string[] | null | undefined) {
  const rawHint = firstValue(value)?.trim();
  if (!rawHint) return "";

  try {
    const normalized = rawHint
      .replace(/\s/g, "+")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
    );
    const parsed = emailSchema.safeParse(decoded);

    return parsed.success ? parsed.data.toLowerCase() : "";
  } catch {
    return "";
  }
}

export function normalizeMemberLoginNextPath(
  value: string | null | undefined,
  fallback = DEFAULT_LOGIN_NEXT_PATH,
) {
  const path = safeInternalPath(value, fallback);

  try {
    const url = new URL(path, "http://oneplusoneclub.local");
    if (url.pathname !== "/preferences" || url.searchParams.has("from")) {
      return `${url.pathname}${url.search}`;
    }

    url.searchParams.set("from", "login");
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function buildAuthConfirmUrl({
  email,
  next,
  origin,
  tokenHash,
  type = "magiclink",
}: {
  email: string;
  next: string;
  origin: string;
  tokenHash?: string;
  type?: MemberLoginOtpType;
}) {
  const url = new URL("/auth/confirm", origin);
  const nextPath = normalizeMemberLoginNextPath(next);
  if (tokenHash) {
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", type);
  }
  url.searchParams.set("next", nextPath);
  url.searchParams.set("email_hint", encodeEmailHint(email));
  return url;
}

export function normalizeOtpType(value: unknown): MemberLoginOtpType {
  return value === "magiclink" ? "magiclink" : "email";
}

function firstValue(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}
