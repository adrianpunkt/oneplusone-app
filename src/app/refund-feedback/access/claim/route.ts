import { NextResponse, type NextRequest } from "next/server";

import {
  REFUND_FEEDBACK_COOKIE_NAME,
  REFUND_FEEDBACK_MAX_AGE_SECONDS,
  resolveRefundFeedbackAccess,
} from "@/lib/membership-refund-feedback";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const tokenValue = formData?.get("token");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  const stableUrl = new URL("/refund-feedback", requestOrigin(request));
  const access = await resolveRefundFeedbackAccess(token);

  if (access.status !== "valid") {
    stableUrl.searchParams.set("access", access.status);
    if (access.status === "expired") stableUrl.searchParams.set("locale", access.locale);
    return privateRedirect(stableUrl);
  }

  const expiresInSeconds = Math.max(
    1,
    Math.floor(
      (new Date(access.context.delivery.feedback_expires_at).getTime() - Date.now()) / 1000,
    ),
  );
  const response = privateRedirect(stableUrl);
  response.cookies.set(REFUND_FEEDBACK_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: Math.min(REFUND_FEEDBACK_MAX_AGE_SECONDS, expiresInSeconds),
    path: "/refund-feedback",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
