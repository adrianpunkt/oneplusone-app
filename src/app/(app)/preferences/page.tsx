import { PreferencesForm } from "@/components/forms/preferences-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getPreferences } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

type PreferencesPageProps = {
  searchParams: Promise<{
    from?: string | string[];
    saved?: string;
  }>;
};

function searchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PreferencesPage({
  searchParams,
}: PreferencesPageProps) {
  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const { from, saved } = await searchParams;
  const preferences = await getPreferences(member.id);
  const returnToDashboard = searchParamValue(from) === "dashboard";

  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-black text-wine">
          {dictionary.preferences.title}
        </h1>
      </section>
      <Card>
        <CardContent className="pt-5">
          <PreferencesForm
            copy={dictionary.preferences}
            preferences={preferences}
            returnToDashboard={returnToDashboard}
            saved={saved === "1"}
          />
        </CardContent>
      </Card>
    </>
  );
}
