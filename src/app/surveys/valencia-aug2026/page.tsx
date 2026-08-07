import type { Metadata } from "next";

import { PublicInvitationLogo } from "@/components/public-invitation-logo";

import { ValenciaAugustSurveyForm } from "./survey-form";

export const metadata: Metadata = {
  title: "Valencia member survey · August 2026",
  description:
    "Help one plus one club shape upcoming events, introductions, and community experiences in Valencia.",
  robots: { follow: false, index: false },
};

export default function ValenciaAugustSurveyPage() {
  return (
    <main className="min-h-screen bg-blush-pink">
      <header className="border-b border-wine-burgundy/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <PublicInvitationLogo className="w-36 sm:w-40" priority />
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-lipstick-red">
              Member survey
            </p>
            <p className="mt-0.5 text-sm font-semibold text-wine-burgundy">Valencia · August 2026</p>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-wine-burgundy text-white">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-28 h-80 w-80 rounded-full border-[54px] border-lipstick-red/20"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-44 -left-36 h-96 w-96 rounded-full border-[70px] border-white/5"
        />
        <div className="relative mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-extrabold uppercase tracking-[0.18em] text-lipstick-red">
              one plus one club, shaped by you
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
              Help us plan what comes next in Valencia
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Takes less than 5 minutes and gives you the chance to see what kind of events we might
              be organizing in the near future.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-8 sm:py-12">
        <ValenciaAugustSurveyForm />
      </section>
    </main>
  );
}
