import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/forms/login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getOptionalMemberContext } from "@/lib/data/member";
import { safeInternalPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string; next?: string }>;
}) {
  const context = await getOptionalMemberContext();
  if (context) redirect("/dashboard");

  const { auth, next } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandLogo className="w-44" priority />
        </CardHeader>
        <CardContent>
          {auth === "missing-code" ? (
            <p className="mb-4 rounded-lg border border-lipstick/20 bg-lipstick/8 p-3 text-sm font-semibold leading-6 text-lipstick">
              That login link was issued for a different auth flow. Request a fresh link from this
              page.
            </p>
          ) : null}
          <LoginForm next={safeInternalPath(next, "/dashboard")} />
        </CardContent>
      </Card>
    </main>
  );
}
