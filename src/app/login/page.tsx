import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LanguageSwitcher } from "@/components/app/language-switcher";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/forms/login-form";
import { SupportQuestionDialog } from "@/components/forms/support-question-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getOptionalMemberContextForRender } from "@/lib/data/member";
import { isDemoMemberEmail } from "@/lib/demo-member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import {
  decodeEmailHint,
  normalizeMemberLoginNextPath,
  normalizeOtpType,
} from "@/lib/auth-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login",
};

type LoginSearchParams = {
  auth?: string | string[];
  email_hint?: string | string[];
  next?: string | string[];
  otp_type?: string | string[];
  sent?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function authMessage(
  auth: string | undefined,
  dictionary: ReturnType<typeof getDictionary>,
  email: string,
) {
  if (auth === "missing-code") return dictionary.login.missingCode;
  if (auth === "expired-link-sent") {
    if (email && isDemoMemberEmail(email)) return dictionary.login.expiredLink;
    return email ? dictionary.login.expiredLinkSent(email) : dictionary.login.expiredLink;
  }
  if (auth === "expired-link") return dictionary.login.expiredLink;
  if (auth === "inactive") return dictionary.login.inactiveMembership;
  return "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const locale = await getRequestLocaleFallback();
  const dictionary = getDictionary(locale);

  const {
    auth: authParam,
    email_hint: emailHint,
    next: nextParam,
    otp_type: otpTypeParam,
    sent: sentParam,
  } = await searchParams;
  const auth = firstSearchParam(authParam);
  const next = normalizeMemberLoginNextPath(firstSearchParam(nextParam));
  const sent = firstSearchParam(sentParam);
  const context = await getOptionalMemberContextForRender();
  if (context) redirect(next);

  const initialEmail = decodeEmailHint(emailHint);
  const message = authMessage(auth, dictionary, initialEmail);
  const initialPasswordRequired = Boolean(initialEmail && isDemoMemberEmail(initialEmail));
  const initialSent = Boolean(initialEmail && (auth === "expired-link-sent" || sent === "1"));
  const initialOtpType = normalizeOtpType(firstSearchParam(otpTypeParam));
  const codeStepMessage = auth === "expired-link-sent"
    ? dictionary.login.expiredLinkSentCodeStep
    : undefined;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="grid w-full max-w-md gap-4">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <Link href="/" className="rounded-lg">
                <BrandLogo className="w-40" priority />
              </Link>
              <LanguageSwitcher
                ariaLabel={dictionary.common.language}
                currentLocale={locale}
              />
            </div>
          </CardHeader>
          <CardContent>
            {message ? (
              <p className="mb-4 rounded-lg border border-lipstick-red/20 bg-lipstick-red/8 p-3 text-sm font-semibold leading-6 text-lipstick-red">
                {message}
              </p>
            ) : null}
            <LoginForm
              codeStepMessage={codeStepMessage}
              copy={{
                checking: dictionary.login.checking,
                codePlaceholder: dictionary.login.codePlaceholder,
                codeSentToast: dictionary.login.codeSentToast,
                email: dictionary.login.email,
                emailCode: dictionary.login.emailCode,
                emailPlaceholder: dictionary.login.emailPlaceholder,
                introBodyAppName: dictionary.login.introBodyAppName,
                introBodyPrefix: dictionary.login.introBodyPrefix,
                introBodySuffix: dictionary.login.introBodySuffix,
                introTitle: dictionary.login.introTitle,
                joinClub: dictionary.login.joinClub,
                login: dictionary.login.login,
                notRegisteredBody: dictionary.login.notRegisteredBody,
                notRegisteredTitle: dictionary.login.notRegisteredTitle,
                password: dictionary.login.password,
                passwordPlaceholder: dictionary.login.passwordPlaceholder,
                passwordStepPrefix: dictionary.login.passwordStepPrefix,
                passwordStepSuffix: dictionary.login.passwordStepSuffix,
                sendLoginCode: dictionary.login.sendLoginCode,
                sendNewCode: dictionary.login.sendNewCode,
                sending: dictionary.login.sending,
                sentCodePrefix: locale === "es" ? "Hemos enviado un código a " : "We sent a login code to ",
                sentCodeSuffix: ".",
              }}
              initialEmail={initialEmail}
              initialOtpType={initialOtpType}
              initialPasswordRequired={initialPasswordRequired}
              initialSent={initialSent}
              locale={locale}
              next={next}
            />
          </CardContent>
        </Card>
        <SupportQuestionDialog
          copy={{
            ...dictionary.actions.support,
            intro: dictionary.login.supportIntro,
            subject: dictionary.login.assistanceSubject,
            trigger: dictionary.login.needAssistance,
          }}
          locale={locale}
        />
      </div>
    </main>
  );
}
