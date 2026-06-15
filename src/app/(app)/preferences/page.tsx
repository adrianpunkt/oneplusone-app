import { PreferencesForm } from "@/components/forms/preferences-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getPreferences } from "@/lib/data/portal";

export const dynamic = "force-dynamic";

type PreferencesPageProps = {
  searchParams: Promise<{
    saved?: string;
  }>;
};

export default async function PreferencesPage({
  searchParams,
}: PreferencesPageProps) {
  const { member } = await requireMemberContext();
  const { saved } = await searchParams;
  const preferences = await getPreferences(member.id);

  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          Going-out preferences
        </h1>
      </section>
      <Card>
        <CardContent className="pt-5">
          <PreferencesForm preferences={preferences} saved={saved === "1"} />
        </CardContent>
      </Card>
    </>
  );
}
