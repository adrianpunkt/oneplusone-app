export function pastEventPrimaryHref({
  canOpenPostEventDetails,
  eventId,
  feedbackAttended,
  feedbackSubmitted,
  hasEvent,
}: {
  canOpenPostEventDetails: boolean;
  eventId: string;
  feedbackAttended: boolean;
  feedbackSubmitted: boolean;
  hasEvent: boolean;
}) {
  if (!hasEvent || !canOpenPostEventDetails) return null;

  const eventPath = `/events/${eventId}`;
  if (!feedbackSubmitted) return `${eventPath}/feedback`;
  if (!feedbackAttended) return null;
  return `${eventPath}/connect`;
}
