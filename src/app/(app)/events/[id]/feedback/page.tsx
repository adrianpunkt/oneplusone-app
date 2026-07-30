import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { EventPageHeader } from "@/components/app/event-page-header";
import { EventFeedbackForm } from "@/components/forms/event-feedback-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getEventDetail } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  eventFeedbackPageCopy,
  getEventFeedbackFormCopy,
} from "@/lib/i18n/event-feedback";
import { localizeText } from "@/lib/i18n/dynamic";

export const dynamic = "force-dynamic";

async function getRequestTimestamp() {
  await connection();
  return Date.now();
}

export default async function EventFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    attended?: string | string[];
    overall_rating?: string | string[];
  }>;
}) {
  const [{ id }, prefill] = await Promise.all([params, searchParams]);
  const { locale, member } = await requireMemberContextForRender();
  const [eventDetail, now] = await Promise.all([
    getEventDetail(id, member.id),
    getRequestTimestamp(),
  ]);
  const { event, feedback, host, invitation, isHost } = eventDetail;

  if (!event) notFound();

  const eventPath = `/events/${encodeURIComponent(event.id)}`;
  const eventEnded =
    event.status === "completed" ||
    new Date(event.ends_at || event.starts_at).getTime() <= now;
  const hasConfirmedSeat =
    invitation?.seat_status === "confirmed" && !invitation.cancelled_at;

  if (!eventEnded || !hasConfirmedSeat) {
    redirect(eventPath);
  }
  if (feedback) {
    redirect(`${eventPath}/connect`);
  }

  const dictionary = getDictionary(locale);
  const copy = eventFeedbackPageCopy[locale];
  const title = localizeText(
    event.title,
    event.localized_content,
    locale,
    "title",
  );
  const initialAttendance = prefill.attended === "yes" || prefill.attended === "no"
    ? prefill.attended
    : null;
  const requestedOverallRating = typeof prefill.overall_rating === "string"
    ? Number(prefill.overall_rating)
    : Number.NaN;
  const initialOverallRating =
    initialAttendance === "yes"
    && Number.isInteger(requestedOverallRating)
    && requestedOverallRating >= 1
    && requestedOverallRating <= 5
      ? requestedOverallRating
      : null;

  return (
    <>
      <EventPageHeader
        backHref="/going-out"
        backLabel={copy.backToEvents}
        event={event}
        locale={locale}
        pendingTooltip={dictionary.events.venuePendingTooltip}
        title={title}
      />

      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <EventFeedbackForm
            copy={getEventFeedbackFormCopy(locale, dictionary)}
            eventId={event.id}
            hasHost={Boolean(host)}
            initialAttendance={initialAttendance}
            initialOverallRating={initialOverallRating}
            isHost={isHost}
          />
        </CardContent>
      </Card>
    </>
  );
}
