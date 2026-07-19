import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { eventInvitationSessionCookie } from "@/lib/event-invitations";
import { deliverMemberEventEmailFromResult } from "@/lib/event-email-delivery";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  decision: z.literal("decline"),
  details: z.string().trim().max(500).optional(),
  reason: z.enum([
    "weekend_unavailable",
    "prefers_sunday_brunch",
    "event_fit",
    "other_commitment",
    "prefer_not_to_say",
  ]),
});

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(eventInvitationSessionCookie)?.value || "";
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
    return NextResponse.json({ ok: false, error: "Could not save your response." }, { status: 409 });
  }
  await deliverMemberEventEmailFromResult(data);
  return NextResponse.json(data);
}
