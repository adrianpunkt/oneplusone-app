import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LanguageSwitcher } from "@/components/app/language-switcher";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/forms/login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getOptionalMemberContext } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
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
  const locale = await getRequestLocaleFallback();
  const dictionary = getDictionary(locale);

  const { auth, next } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <BrandLogo className="w-44" priority />
            <LanguageSwitcher
              ariaLabel={dictionary.common.language}
              currentLocale={locale}
            />
          </div>
        </CardHeader>
        <CardContent>
          {auth === "missing-code" ? (
            <p className="mb-4 rounded-lg border border-lipstick/20 bg-lipstick/8 p-3 text-sm font-semibold leading-6 text-lipstick">
              {dictionary.login.missingCode}
            </p>
          ) : null}
          <LoginForm
            copy={{
              checking: dictionary.login.checking,
              codePlaceholder: dictionary.login.codePlaceholder,
              codeSentToast: dictionary.login.codeSentToast,
              email: dictionary.login.email,
              emailCode: dictionary.login.emailCode,
              emailPlaceholder: dictionary.login.emailPlaceholder,
              introBody: dictionary.login.introBody,
              introTitle: dictionary.login.introTitle,
              joinClub: dictionary.login.joinClub,
              login: dictionary.login.login,
              notRegisteredBody: dictionary.login.notRegisteredBody,
              notRegisteredTitle: dictionary.login.notRegisteredTitle,
              sendLoginCode: dictionary.login.sendLoginCode,
              sendNewCode: dictionary.login.sendNewCode,
              sending: dictionary.login.sending,
              sentCodePrefix: locale === "es" ? "Hemos enviado un código a " : "We sent a login code to ",
              sentCodeSuffix: ".",
            }}
            next={safeInternalPath(next, "/dashboard")}
          />
        </CardContent>
      </Card>
    </main>
  );
}
