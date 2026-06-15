import { ProfileForm } from "@/components/forms/profile-form";
import { requireMemberContext } from "@/lib/data/member";

export const dynamic = "force-dynamic";

export default async function EditMyStoryPage() {
  const { profile } = await requireMemberContext();

  return (
    <article className="grid w-full min-w-0 gap-6">
      <header>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
          Update my story
        </h1>
      </header>

      <div className="min-w-0 overflow-hidden rounded-lg border border-wine/10 bg-white px-4 py-8 shadow-[0_18px_45px_rgba(68,10,18,0.07)] sm:px-8 sm:py-10">
        <ProfileForm profile={profile} />
      </div>
    </article>
  );
}
