import { RouteToast } from "@/components/app/route-toast";
import { ProfileForm } from "@/components/forms/profile-form";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { profileImageUrl } from "@/lib/profile-image";
import { storyValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

type MyStoryPageProps = {
  searchParams: Promise<{
    saved?: string;
  }>;
};

export default async function MyStoryPage({ searchParams }: MyStoryPageProps) {
  const { locale, member, profile } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const { saved } = await searchParams;
  const firstName = storyValue(profile?.profile_json, "profile.first_name");
  const imageUrl = profileImageUrl(profile?.profile_json);
  const displayName = firstName || member.email || "Me";

  return (
    <article className="grid w-full min-w-0 gap-6" data-app-content="wide">
      <header>
        <h1 className="font-display text-3xl font-black text-wine sm:text-4xl">
          {dictionary.profile.title}
        </h1>
      </header>

      <RouteToast
        clearSearchParams={["saved"]}
        title={dictionary.profile.storySaved}
        toastKey={saved === "1" ? "story-saved" : null}
      />

      <div className="min-w-0 overflow-hidden rounded-lg border border-wine/10 bg-white px-4 py-8 shadow-[0_18px_45px_rgba(68,10,18,0.07)] sm:px-8 sm:py-10">
        <ProfileForm
          autocompleteCopy={dictionary.autocomplete}
          copy={dictionary.profile}
          imageUploaderCopy={dictionary.imageUploader}
          profile={profile}
          profileImage={{
            currentImageUrl: imageUrl,
            displayName,
            hasProfile: Boolean(profile),
          }}
        />
      </div>
    </article>
  );
}
