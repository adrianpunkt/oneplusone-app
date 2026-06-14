import { PreferencesForm } from "@/components/forms/preferences-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getPreferences } from "@/lib/data/portal";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const { member } = await requireMemberContext();
  const preferences = await getPreferences(member.id);

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Going out</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          My going out preferences
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Tell us when you prefer to meet, what the host should know, and whether you are open
          to helping at the table.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Dinners, brunches, and hosting</CardTitle>
          <CardDescription>
            These details can change any time and are only used for planning events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm preferences={preferences} />
        </CardContent>
      </Card>
    </>
  );
}
