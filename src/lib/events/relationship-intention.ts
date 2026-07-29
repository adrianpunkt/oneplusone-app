type LocalizedContent = Record<string, unknown> | null | undefined;

export function eventRelationshipIntention(
  localizedContent: LocalizedContent,
  fallback: string | null | undefined,
) {
  const english = localizedContent?.en;
  if (english && typeof english === "object" && !Array.isArray(english)) {
    const override = (english as Record<string, unknown>).majority_intention_override;
    if (typeof override === "string" && override.trim()) return override.trim();
  }

  return fallback?.trim() || null;
}
