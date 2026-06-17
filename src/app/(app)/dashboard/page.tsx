import {
  DashboardChecklist,
  type DashboardChecklistStep,
} from "@/components/app/dashboard-checklist";
import { RouteToast } from "@/components/app/route-toast";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/dictionaries";
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
  dictionary,
  hasConfirmedSeat,
  hasEarnedCredits,
  hasFirstInvitation,
  hasPhoto,
  hasPreferences,
  hasReachedOut,
  hasRepeated,
}: {
  dictionary: Dictionary;
  hasConfirmedSeat: boolean;
  hasEarnedCredits: boolean;
  hasFirstInvitation: boolean;
  hasPhoto: boolean;
  hasPreferences: boolean;
  hasReachedOut: boolean;
  hasRepeated: boolean;
}): DashboardChecklistStep[] {
  const copy = dictionary.dashboard.steps;

  return [
    {
      title: copy.join.title,
      description: copy.join.description,
      href: "/my-story",
      checked: true,
    },
    {
      title: copy.preferences.title,
      description: copy.preferences.description,
      href: "/preferences?from=dashboard",
      checked: hasPreferences,
    },
    {
      action: "profileImage",
      title: copy.photo.title,
      description: copy.photo.description,
      href: "/my-story",
      checked: hasPhoto,
    },
    {
      title: copy.credits.title,
      description: copy.credits.description,
      href: "/credits",
      checked: hasEarnedCredits,
    },
    {
      title: copy.invitation.title,
      description: copy.invitation.description,
      href: "/going-out",
      checked: hasFirstInvitation,
    },
    {
      title: copy.confirm.title,
      description: copy.confirm.description,
      href: "/going-out",
      checked: hasConfirmedSeat,
    },
    {
      title: copy.reachOut.title,
      description: copy.reachOut.description,
      href: "/messages",
      checked: hasReachedOut,
    },
    {
      title: copy.repeat.title,
      description: copy.repeat.description,
      href: "/going-out",
      checked: hasRepeated,
    },
  ];
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { locale, member, profile } = await requireMemberContext();
  const dictionary = getDictionary(locale);
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
        title={dictionary.dashboard.preferencesSaved}
        toastKey={preferencesSaved ? "dashboard-preferences-saved" : null}
      />

      <section className="grid min-h-[calc(100dvh-7.5rem)] content-center gap-5 md:min-h-[calc(100dvh-3rem)]">
        <h1 className="font-display text-3xl font-black text-wine sm:text-4xl">
          {dictionary.dashboard.title}
        </h1>

        <DashboardChecklist
          copy={{
            closePhotoUploader: dictionary.dashboard.closePhotoUploader,
            complete: dictionary.dashboard.complete,
            incomplete: dictionary.dashboard.incomplete,
            photoSaved: dictionary.dashboard.photoSaved,
          }}
          imageUploaderCopy={dictionary.imageUploader}
          profileImage={{
            currentImageUrl,
            displayName,
            hasProfile: Boolean(profile),
          }}
          steps={onboardingSteps({
            dictionary,
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
