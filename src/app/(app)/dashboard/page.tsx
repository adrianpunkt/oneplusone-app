import {
  DashboardChecklist,
  type DashboardChecklistStep,
} from "@/components/app/dashboard-checklist";
import { RouteToast } from "@/components/app/route-toast";
import { requireMemberContext } from "@/lib/data/member";
import {
  getPreferences,
  hasAttendedSecondEvent,
  hasConfirmedEventInvitation,
  hasReceivedEventInvitation,
  hasReferralCodeSignup,
  hasSentMessage,
} from "@/lib/data/portal";
import { profileImageUrl } from "@/lib/profile-image";
import { storyValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    preferences?: string | string[];
  }>;
};

function searchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function onboardingSteps({
  hasConfirmedSeat,
  hasEarnedCredits,
  hasFirstInvitation,
  hasPhoto,
  hasPreferences,
  hasReachedOut,
  hasRepeated,
}: {
  hasConfirmedSeat: boolean;
  hasEarnedCredits: boolean;
  hasFirstInvitation: boolean;
  hasPhoto: boolean;
  hasPreferences: boolean;
  hasReachedOut: boolean;
  hasRepeated: boolean;
}): DashboardChecklistStep[] {
  return [
    {
      title: "Join the club",
      description: "You already completed the most important step.",
      href: "/my-story",
      checked: true,
    },
    {
      title: "Update your going-out preferences",
      description: "Tell us what would make a great night out for you.",
      href: "/preferences?from=dashboard",
      checked: hasPreferences,
    },
    {
      action: "profileImage",
      title: "Upload a photo",
      description: "Add a profile photo so others can recognize you.",
      href: "/my-story",
      checked: hasPhoto,
    },
    {
      title: "Earn more credits",
      description:
        "Learn how you can get credits and attend events for free.",
      href: "/credits",
      checked: hasEarnedCredits,
    },
    {
      title: "Get invited to the first event",
      description:
        "Watch out for your first invitation. First come, first served, otherwise you can join the waitlist.",
      href: "/going-out",
      checked: hasFirstInvitation,
    },
    {
      title: "Confirm your seat",
      description: "Make sure you confirm to secure a seat.",
      href: "/going-out",
      checked: hasConfirmedSeat,
    },
    {
      title: "Reach out to the others",
      description: "Met someone you clicked with? Send them a message.",
      href: "/messages",
      checked: hasReachedOut,
    },
    {
      title: "Repeat",
      description: "Had a great time? Come again!",
      href: "/going-out",
      checked: hasRepeated,
    },
  ];
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { member, profile } = await requireMemberContext();
  const { preferences: preferencesParam } = await searchParams;
  const preferencesSaved = searchParamValue(preferencesParam) === "saved";
  const [
    preferences,
    hasEarnedCredits,
    hasFirstInvitation,
    hasConfirmedSeat,
    hasReachedOut,
    hasRepeated,
  ] = await Promise.all([
    getPreferences(member.id),
    hasReferralCodeSignup(member.id),
    hasReceivedEventInvitation(member.id),
    hasConfirmedEventInvitation(member.id),
    hasSentMessage(member.id),
    hasAttendedSecondEvent(member.id),
  ]);
  const currentImageUrl = profileImageUrl(profile?.profile_json);
  const displayName =
    storyValue(profile?.profile_json, "profile.first_name") ||
    member.email ||
    "Me";

  return (
    <>
      <RouteToast
        clearSearchParams={["preferences"]}
        title="Preferences saved."
        toastKey={preferencesSaved ? "dashboard-preferences-saved" : null}
      />

      <section className="grid min-h-[calc(100dvh-7.5rem)] content-center gap-5 md:min-h-[calc(100dvh-3rem)]">
        <h1 className="font-display text-3xl font-black text-wine sm:text-4xl">
          Welcome to the club
        </h1>

        <DashboardChecklist
          profileImage={{
            currentImageUrl,
            displayName,
            hasProfile: Boolean(profile),
          }}
          steps={onboardingSteps({
            hasConfirmedSeat,
            hasEarnedCredits,
            hasFirstInvitation,
            hasPhoto: Boolean(currentImageUrl),
            hasPreferences: Boolean(preferences),
            hasReachedOut,
            hasRepeated,
          })}
        />
      </section>
    </>
  );
}
