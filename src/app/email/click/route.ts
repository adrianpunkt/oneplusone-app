import { NextResponse, type NextRequest } from "next/server";

import { eventEmailClickDestination } from "@/lib/event-email-click";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const destination = eventEmailClickDestination(
    request.nextUrl.searchParams.get("to") || "",
    request.nextUrl.origin,
  );

  if (token) {
    const { error } = await getSupabaseServiceClient().rpc(
      "record_event_email_click",
      { p_token: token },
    );
    if (error) {
      console.error("[event-email-click] could not record click", {
        code: error.code,
        message: error.message,
      });
    }
  }

  const response = NextResponse.redirect(destination, { status: 307 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
