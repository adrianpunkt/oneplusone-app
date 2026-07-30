import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEventDate,
  formatEventDateTime,
} from "../src/lib/i18n/format.ts";

test("event times use the event location instead of the server timezone", () => {
  const originalTimeZone = process.env.TZ;

  try {
    for (const serverTimeZone of ["UTC", "Pacific/Honolulu", "Asia/Tokyo"]) {
      process.env.TZ = serverTimeZone;
      assert.equal(
        formatEventDateTime(
          "2026-08-01T18:00:00.000Z",
          "Europe/Madrid",
          "en",
        ),
        "Aug 1, 2026, 8:00 PM",
      );
    }
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("event times follow daylight-saving changes in the event location", () => {
  assert.equal(
    formatEventDateTime(
      "2026-08-01T18:00:00.000Z",
      "Europe/Madrid",
      "en",
    ),
    "Aug 1, 2026, 8:00 PM",
  );
  assert.equal(
    formatEventDateTime(
      "2026-12-05T19:00:00.000Z",
      "Europe/Madrid",
      "en",
    ),
    "Dec 5, 2026, 8:00 PM",
  );
});

test("event dates use the event location near midnight", () => {
  assert.equal(
    formatEventDate(
      "2026-08-01T22:30:00.000Z",
      "Europe/Madrid",
      "en",
    ),
    "Aug 2, 2026",
  );
});

test("event formatting never falls back to the server when timezone data is missing", () => {
  assert.equal(
    formatEventDateTime("2026-08-01T18:00:00.000Z", null, "en"),
    "TBC",
  );
  assert.equal(formatEventDateTime(null, "Europe/Madrid", "es"), "Por confirmar");
});
