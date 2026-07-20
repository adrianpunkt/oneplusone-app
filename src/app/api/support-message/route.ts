import { getRuntimeEnv } from "@/lib/env";

type SupportPayload = {
  email: string;
  locale: "en" | "es";
  message: string;
  pageUrl: string;
  referrer: string;
  subject: string;
  website: string;
};

export async function POST(request: Request) {
  let rawPayload: Record<string, unknown>;

  try {
    rawPayload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Could not read the support message.", ok: false }, { status: 400 });
  }

  const payload: SupportPayload = {
    email: cleanValue(rawPayload.email, 320).toLowerCase(),
    locale: rawPayload.locale === "es" ? "es" : "en",
    message: cleanValue(rawPayload.message, 5000),
    pageUrl: cleanValue(rawPayload.pageUrl, 1200),
    referrer: cleanValue(rawPayload.referrer, 1200),
    subject: cleanValue(rawPayload.subject, 240) || "Question about one plus one club",
    website: cleanValue(rawPayload.website, 240),
  };

  if (!payload.website) {
    if (!payload.message) {
      return Response.json({ error: "Please enter your question.", ok: false }, { status: 400 });
    }
    if (!payload.email || !isValidEmail(payload.email)) {
      return Response.json({ error: "Please enter a valid email address.", ok: false }, { status: 400 });
    }
  }

  try {
    const response = await fetch(supportMessageEndpoint(), {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;

    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error("Could not forward support message", error);
    return Response.json({ error: "Could not send the support message.", ok: false }, { status: 502 });
  }
}

function supportMessageEndpoint() {
  const configured = getRuntimeEnv("SUPPORT_MESSAGE_ENDPOINT");
  if (configured) return configured;
  return "https://oneplusoneclub.com/api/support-message";
}

function cleanValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
