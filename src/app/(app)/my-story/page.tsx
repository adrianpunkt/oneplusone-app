import Link from "next/link";
import { Check } from "lucide-react";

import { ProfileStory } from "@/components/forms/profile-form";
import { Button } from "@/components/ui/button";
import { requireMemberContext } from "@/lib/data/member";

export const dynamic = "force-dynamic";

type MyStoryPageProps = {
  searchParams: Promise<{
    saved?: string;
  }>;
};

export default async function MyStoryPage({ searchParams }: MyStoryPageProps) {
  const { profile } = await requireMemberContext();
  const { saved } = await searchParams;

  return (
    <article className="grid w-full min-w-0 gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
            My story
          </h1>
        </div>
        <Button asChild>
          <Link href="/my-story/edit">Update story</Link>
        </Button>
      </header>

      {saved === "1" ? (
        <p
          className="inline-flex items-center gap-2 rounded-lg border border-ocean/15 bg-white px-4 py-3 text-sm font-semibold text-ocean shadow-sm"
          role="status"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={3} />
          Your story was saved.
        </p>
      ) : null}

      <div className="min-w-0 overflow-hidden rounded-lg border border-wine/10 bg-white px-4 py-8 shadow-[0_18px_45px_rgba(68,10,18,0.07)] sm:px-8 sm:py-10">
        <ProfileStory profile={profile} />
      </div>
    </article>
  );
}
