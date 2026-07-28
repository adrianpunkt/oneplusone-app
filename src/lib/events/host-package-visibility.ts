type HostPackageMaterial = {
  kind: string;
  locale: string;
  question_set_revision: number | null;
  source_snapshot: {
    event: { languageCode: string };
    questionSetRevision: number;
  } | null;
  stale_at: string | null;
};

export function currentHostPackageMaterials<T extends HostPackageMaterial>({
  currentRevision,
  eventLanguage,
  isAssignedHost,
  materials,
}: {
  currentRevision: number | null;
  eventLanguage: "en" | "es";
  isAssignedHost: boolean;
  materials: T[];
}) {
  if (!isAssignedHost || !currentRevision) return [];
  return materials.filter((material) => (
    material.kind === "event_guide"
    && material.question_set_revision === currentRevision
    && material.locale === eventLanguage
    && material.source_snapshot?.questionSetRevision === currentRevision
    && material.source_snapshot.event.languageCode === eventLanguage
    && !material.stale_at
  ));
}
