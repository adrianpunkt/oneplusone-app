import { getRuntimeEnv } from "@/lib/env";
import type { Locale } from "@/lib/i18n/locales";

const LOOPS_TRANSACTIONAL_URL = "https://app.loops.so/api/v1/transactional";
const DEFAULT_LOGIN_TRANSACTIONAL_ID_EN = "cmqcfkdqi1er60jygou29o4sw";
const DEFAULT_LOGIN_TRANSACTIONAL_ID_ES = "cmqihzpab01ql0jznkf1zjzrg";

type LoopsTransactionalEmail = {
  addToAudience?: boolean;
  dataVariables?: Record<string, unknown>;
  email: string;
  idempotencyKey?: string;
  transactionalId: string;
};

type LoopsResponse = {
  success?: boolean;
  id?: string;
  message?: string;
};

export function getLoopsTransactionalId(locale: Locale) {
  if (locale === "es") {
    return (
      getRuntimeEnv("LOOPS_LOGIN_TRANSACTIONAL_ID_ES") ||
      getRuntimeEnv("LOOPS_MEMBER_LOGIN_TRANSACTIONAL_ID_ES") ||
      getRuntimeEnv("LOOPS_MEMBER_APP_LOGIN_TRANSACTIONAL_ID_ES") ||
      DEFAULT_LOGIN_TRANSACTIONAL_ID_ES
    );
  }

  return (
    getRuntimeEnv("LOOPS_LOGIN_TRANSACTIONAL_ID_EN") ||
    getRuntimeEnv("LOOPS_LOGIN_TRANSACTIONAL_ID") ||
    getRuntimeEnv("LOOPS_MEMBER_LOGIN_TRANSACTIONAL_ID") ||
    getRuntimeEnv("LOOPS_MEMBER_APP_LOGIN_TRANSACTIONAL_ID") ||
    DEFAULT_LOGIN_TRANSACTIONAL_ID_EN
  );
}

export function isLoopsLoginEmailConfigured(locale: Locale) {
  return Boolean(getRuntimeEnv("LOOPS_API_KEY") && getLoopsTransactionalId(locale));
}

export async function sendLoopsTransactionalEmail(input: LoopsTransactionalEmail) {
  const apiKey = getRuntimeEnv("LOOPS_API_KEY");

  if (!apiKey) {
    throw new Error("Loops is not configured: missing LOOPS_API_KEY.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 100);
  }

  const response = await fetch(LOOPS_TRANSACTIONAL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: input.email,
      transactionalId: input.transactionalId,
      addToAudience: input.addToAudience ?? false,
      dataVariables: withLoopsEnvironment(input.dataVariables),
    }),
  });

  const result = await readLoopsResponse(response);

  if (!response.ok || result.success !== true) {
    throw new Error(result.message || `Loops transactional email failed with ${response.status}.`);
  }

  return result;
}

function withLoopsEnvironment(properties: Record<string, unknown> | undefined) {
  const next = { ...(properties || {}) };
  if (!next.environment) {
    next.environment = getLoopsEnvironment();
  }
  return next;
}

function getLoopsEnvironment() {
  const explicitEnvironment = normalizeLoopsEnvironment(
    getRuntimeEnv("LOOPS_ENVIRONMENT") || getRuntimeEnv("LOOPS_ENV"),
  );
  if (explicitEnvironment) return explicitEnvironment;

  const appUrl = getRuntimeEnv("APP_URL") || getRuntimeEnv("NEXT_PUBLIC_APP_URL");
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    return hostname === "app.oneplusoneclub.com" ? "production" : "development";
  } catch {
    return process.env.NODE_ENV === "production" ? "production" : "development";
  }
}

function normalizeLoopsEnvironment(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (["prod", "production"].includes(normalized)) return "production";
  if (["dev", "development", "local", "localhost"].includes(normalized)) return "development";
  return normalized.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

async function readLoopsResponse(response: Response): Promise<LoopsResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as LoopsResponse;
  } catch {
    return { message: text.slice(0, 240) };
  }
}
