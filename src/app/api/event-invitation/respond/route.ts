import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { readEventInvitationSessionToken } from "@/lib/event-invitations";
import { deliverMemberEventEmailFromResult } from "@/lib/event-email-delivery";
import { pendingEventInvitationDeclineReasons } from "@/lib/event-invitation-decline-reasons";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  decision: z.literal("decline"),
  details: z.string().trim().max(500).optional(),
  reason: z.enum(pendingEventInvitationDeclineReasons),
});

export async function POST(request: NextRequest) {
  const sessionToken = readEventInvitationSessionToken(request.cookies, request.nextUrl);
  const payload = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!sessionToken || !payload.success) {
    return NextResponse.json({ ok: false, error: "Invalid invitation response." }, { status: 400 });
  }

  const { data, error } = await getSupabaseServiceClient().rpc(
    "decline_pending_event_invitation",
    {
      p_details: payload.data.details || null,
      p_reason: payload.data.reason,
      p_session_token: sessionToken,
    },
  );
  if (error) {
    console.error("[event-invitation/respond] decline failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ ok: false, error: "Could not save your response." }, { status: 409 });
  }
  await deliverMemberEventEmailFromResult(data);
  return NextResponse.json(data);
}
