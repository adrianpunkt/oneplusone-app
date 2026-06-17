import { RouteToast } from "@/components/app/route-toast";
import { ProfileForm } from "@/components/forms/profile-form";
import { requireMemberContext } from "@/lib/data/member";
import { profileImageUrl } from "@/lib/profile-image";
import { storyValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

type MyStoryPageProps = {
  searchParams: Promise<{
    saved?: string;
  }>;
};

export default async function MyStoryPage({ searchParams }: MyStoryPageProps) {
  const { member, profile } = await requireMemberContext();
  const { saved } = await searchParams;
  const firstName = storyValue(profile?.profile_json, "profile.first_name");
  const imageUrl = profileImageUrl(profile?.profile_json);
  const displayName = firstName || member.email || "Me";

  return (
    <article className="grid w-full min-w-0 gap-6">
      <header>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
          My story
        </h1>
      </header>

      <RouteToast
        clearSearchParams={["saved"]}
        title="Story saved."
        toastKey={saved === "1" ? "story-saved" : null}
      />

      <div className="min-w-0 overflow-hidden rounded-lg border border-wine/10 bg-white px-4 py-8 shadow-[0_18px_45px_rgba(68,10,18,0.07)] sm:px-8 sm:py-10">
        <ProfileForm
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
