import {
  BookOpenCheck,
  Download,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";

import playbook from "@/content/event-host-playbook.json";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localizeText } from "@/lib/i18n/dynamic";
import type { Locale } from "@/lib/i18n/locales";
import type { EventMaterial, EventQuestion } from "@/lib/types";

type HostPlaybookCopy = (typeof playbook.locales)[Locale];

export function EventHostPlaybook({
  locale,
  materials,
  questions,
}: {
  locale: Locale;
  materials: EventMaterial[];
  questions: EventQuestion[];
}) {
  const copy: HostPlaybookCopy = playbook.locales[locale];
  const localizedMaterials = materials.filter((material) => material.locale === locale);
  const sharingQuestions = questions.filter((question) => question.type === "sharing_time");
  const spicyQuestions = questions.filter((question) => question.type === "spicy_time");

  return (
    <section aria-labelledby="host-playbook-title" className="grid gap-4">
      <Card className="overflow-hidden border-ocean-blue/20">
        <CardHeader className="bg-ocean-blue/8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean-blue">
                {copy.eyebrow}
              </p>
              <CardTitle id="host-playbook-title">{copy.title}</CardTitle>
              <CardDescription className="max-w-3xl leading-6">{copy.intro}</CardDescription>
            </div>
            <Badge variant="muted">v{playbook.version}</Badge>
          </div>
          <p className="flex items-center gap-2 pt-2 text-xs font-semibold text-ocean-blue">
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            {copy.privacy}
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6">
          <HostChecklist icon={BookOpenCheck} items={copy.before} title={copy.beforeTitle} />

          <div className="grid gap-3">
            <h3 className="font-display text-xl font-extrabold text-wine-burgundy">
              {copy.roundsTitle}
            </h3>
            <ol className="grid gap-3 lg:grid-cols-2">
              {copy.rounds.map((round, index) => (
                <li className="rounded-xl border border-wine-burgundy/10 bg-blush-pink p-4" key={round.title}>
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lipstick-red text-xs font-black text-white">
                      {index + 1}
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wide text-lipstick-red">{round.time}</p>
                  </div>
                  <h4 className="mt-3 font-display text-lg font-extrabold text-wine-burgundy">{round.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-muted">{round.body}</p>
                </li>
              ))}
            </ol>
          </div>

          <HostChecklist icon={UsersRound} items={copy.principles} title={copy.principlesTitle} />

          <div className="grid gap-3 md:grid-cols-2">
            <HostNotice body={copy.unexpected} icon={ShieldAlert} title={copy.unexpectedTitle} />
            <HostNotice body={copy.support} icon={Sparkles} title={copy.supportTitle} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.downloadsTitle}</CardTitle>
          <CardDescription>{copy.downloadsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex items-center gap-2 rounded-lg border border-wine-burgundy/10 bg-white px-4 py-2 text-sm font-semibold text-wine-burgundy transition hover:border-lipstick-red/40 hover:text-lipstick-red"
              href={`/host-materials/event-host-guide-${locale}.pdf`}
              rel="noreferrer"
              target="_blank"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {copy.materialLabels.host_guide} · v{playbook.version}
            </a>
          </div>
          {localizedMaterials.length ? (
            <div className="flex flex-wrap gap-2">
              {localizedMaterials.map((material) => (
                <a
                  className="inline-flex items-center gap-2 rounded-lg border border-wine-burgundy/10 bg-white px-4 py-2 text-sm font-semibold text-wine-burgundy transition hover:border-lipstick-red/40 hover:text-lipstick-red"
                  href={material.public_url}
                  key={material.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                  {copy.materialLabels[material.kind]} · v{material.version}
                </a>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-blush-pink p-4 text-sm font-semibold leading-6 text-muted">
              {copy.emptyDownloads}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{locale === "es" ? "Preguntas del evento" : "Event questions"}</CardTitle>
            <Badge variant="muted">{questions.length} {copy.questionCount}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {questions.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <QuestionGroup
                description={copy.sharingDescription}
                locale={locale}
                questions={sharingQuestions}
                title={copy.sharingTitle}
              />
              <QuestionGroup
                description={copy.spicyDescription}
                locale={locale}
                questions={spicyQuestions}
                title={copy.spicyTitle}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              {copy.emptyQuestions}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function HostChecklist({
  icon: Icon,
  items,
  title,
}: {
  icon: typeof BookOpenCheck;
  items: readonly string[];
  title: string;
}) {
  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-2 font-display text-xl font-extrabold text-wine-burgundy">
        <Icon aria-hidden="true" className="h-5 w-5 text-lipstick-red" />
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li className="flex gap-3 rounded-lg bg-blush-pink p-3 text-sm leading-6 text-muted" key={item}>
            <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-lipstick-red" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HostNotice({ body, icon: Icon, title }: { body: string; icon: typeof ShieldAlert; title: string }) {
  return (
    <div className="rounded-xl border border-ocean-blue/15 bg-ocean-blue/8 p-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-ocean-blue">
        <Icon aria-hidden="true" className="h-5 w-5" />
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-ocean-blue">{body}</p>
    </div>
  );
}

function QuestionGroup({
  description,
  locale,
  questions,
  title,
}: {
  description: string;
  locale: Locale;
  questions: EventQuestion[];
  title: string;
}) {
  return (
    <section className="grid content-start gap-3">
      <div>
        <h3 className="font-display text-xl font-extrabold text-wine-burgundy">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
      <ol className="grid gap-2">
        {questions.map((question, index) => (
          <li className="flex gap-3 rounded-lg border border-wine-burgundy/10 p-3" key={question.id}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blush-pink text-xs font-black text-wine-burgundy">
              {index + 1}
            </span>
            <p className="pt-0.5 text-sm font-semibold leading-6 text-wine-burgundy">
              {localizeText(question.prompt, question.localized_content, locale, "prompt")}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
