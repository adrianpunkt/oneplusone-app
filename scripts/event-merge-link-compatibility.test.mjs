import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clickRoute = readFileSync(
  new URL("../src/app/email/click/route.ts", import.meta.url),
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
