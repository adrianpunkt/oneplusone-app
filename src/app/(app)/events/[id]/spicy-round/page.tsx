import { EventRoundQuestionPage } from "@/components/app/event-round-question-page";

export const dynamic = "force-dynamic";

export default async function SpicyRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <EventRoundQuestionPage
      eventId={id}
      roundType="spicy_time"
    />
  );
}
