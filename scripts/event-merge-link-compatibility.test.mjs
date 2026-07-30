import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clickRoute = readFileSync(
  new URL("../src/app/email/click/route.ts", import.meta.url),
  "utf8",
);
const eventEmailDelivery = readFileSync(
  new URL("../src/lib/event-email-delivery.ts", import.meta.url),
  "utf8",
);
const authConfirmPage = readFileSync(
  new URL("../src/app/auth/confirm/page.tsx", import.meta.url),
  "utf8",
);
const invitationAccessPage = readFileSync(
  new URL("../src/app/event-invitation/access/page.tsx", import.meta.url),
  "utf8",
);
const refundFeedbackAccessPage = readFileSync(
  new URL("../src/app/refund-feedback/access/page.tsx", import.meta.url),
  "utf8",
);
const authLink = readFileSync(
  new URL("../src/lib/auth-link.ts", import.meta.url),
  "utf8",
);
const memberLoginEmail = readFileSync(
  new URL("../src/lib/member-login-email.ts", import.meta.url),
  "utf8",
);

test("tracked member invitation links survive an event merge", () => {
  assert.match(
    clickRoute,
    /destination\.pathname === "\/auth\/confirm"/,
  );
  assert.match(
    clickRoute,
    /resolveActiveMemberEventInvitationAccess\(token\)/,
  );
  assert.match(
    clickRoute,
    /\/event-invitation\/complete\?token=/,
  );
});

test("View your events emails receive fresh one-time Going Out links", () => {
  for (const emailType of [
    "seat_confirmed",
    "waitlist_balance",
    "waitlist_capacity",
  ]) {
    assert.match(eventEmailDelivery, new RegExp(`"${emailType}"`));
  }
  assert.match(eventEmailDelivery, /await createMemberGoingOutLink\(/);
  assert.match(eventEmailDelivery, /next: "\/going-out"/);
  assert.match(eventEmailDelivery, /oneTimeMemberEventEmailTypes\.has\(data\.email_type\)/);
  assert.match(authLink, /MEMBER_LOGIN_LINK_TTL_MINUTES = 24 \* 60/);
  assert.match(authConfirmPage, /supabase\.auth\.verifyOtp\(/);
  assert.match(
    authConfirmPage,
    /const preflightStatus = await preflightAuthLink\(tokenHash, type\);\s+if \(preflightStatus === "invalid"\) {\s+if \(context\) redirect\(next\)/,
  );
  assert.doesNotMatch(
    authConfirmPage,
    /const context = await getOptionalMemberContextForRender\(\);\s+if \(context\) redirect\(next\)/,
  );
  assert.match(memberLoginEmail, /type: "magiclink"/);
  assert.match(memberLoginEmail, /tokenHash: String\(tokenHash\)/);
});

test("View your events email templates follow the member's effective locale", () => {
  for (const [emailType, locale, transactionalId] of [
    ["seat_confirmed", "en", "cmrs2pkxk33nf0j123zfdk4rd"],
    ["seat_confirmed", "es", "cmrs2pl5r009p0jz2srdsx0fv"],
    ["waitlist_balance", "en", "cmrs2plen009l0j1fxd63afhx"],
    ["waitlist_balance", "es", "cmrs2plmf01w60j18dsqofpjn"],
    ["waitlist_capacity", "en", "cmrs2plv31dbp0j1j06lmxwke"],
    ["waitlist_capacity", "es", "cmrs2pm5h04zt0j194o7ufh27"],
  ]) {
    assert.match(
      eventEmailDelivery,
      new RegExp(`"${emailType}:${locale}": "${transactionalId}"`),
    );
  }
});

test("scanner-safe email handoff screens submit automatically after one second", () => {
  for (const page of [
    authConfirmPage,
    invitationAccessPage,
    refundFeedbackAccessPage,
  ]) {
    assert.match(page, /<AutoSubmitButton/);
    assert.match(page, /delayMs=\{1_000\}/);
  }
  assert.match(authConfirmPage, /preflightAuthLink\(tokenHash, type\)/);
  assert.match(invitationAccessPage, /preflightEventInvitationAccess\(token\)/);
  assert.match(invitationAccessPage, /method="post"/);
  assert.match(refundFeedbackAccessPage, /resolveRefundFeedbackAccess\(token\)/);
  assert.match(refundFeedbackAccessPage, /method="post"/);
});
