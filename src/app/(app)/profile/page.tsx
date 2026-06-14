import { ProfileForm } from "@/components/forms/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile } = await requireMemberContext();

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Private story</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">My story</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          These answers are for grouping and invitations. They are not shown to other members.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Private story</CardTitle>
          <CardDescription>
            V1 keeps the same field names as the website story form so the data stays compatible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>
    </>
  );
}
