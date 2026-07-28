import assert from "node:assert/strict";
import test from "node:test";

import { currentHostPackageMaterials } from "../src/lib/events/host-package-visibility.ts";

const current = {
  id: "current",
  kind: "event_guide",
  locale: "es",
  question_set_revision: 4,
  source_snapshot: {
    event: { languageCode: "es" },
    questionSetRevision: 4,
  },
  stale_at: null,
};

test("ordinary guests never receive host materials", () => {
  assert.deepEqual(currentHostPackageMaterials({
    currentRevision: 4,
    eventLanguage: "es",
    isAssignedHost: false,
    materials: [current],
  }), []);
});

test("the assigned host receives only the current event-language package", () => {
  const materials = [
    current,
    { ...current, id: "stale", stale_at: "2026-07-22T20:00:00Z" },
    { ...current, id: "old-revision", question_set_revision: 3 },
    { ...current, id: "wrong-language", locale: "en" },
    { ...current, id: "legacy-kind", kind: "host_guide" },
  ];
  assert.deepEqual(currentHostPackageMaterials({
    currentRevision: 4,
    eventLanguage: "es",
    isAssignedHost: true,
    materials,
  }).map((material) => material.id), ["current"]);
});
