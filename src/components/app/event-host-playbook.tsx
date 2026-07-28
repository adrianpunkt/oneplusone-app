import {
  BookOpenCheck,
  Download,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { SupportQuestionDialog } from "@/components/forms/support-question-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import type { EventGuideQuestionSnapshot, EventMaterial } from "@/lib/types";

const copy = {
  en: {
    download: "Download the event PDF",
    downloadDescription: "This is the same event-specific PDF attached to your host email.",
    eyebrow: "Private host workspace",
    helpDescription: "Send us anything that is unclear about welcoming the group, the schedule, or the questions.",
    helpTitle: "Questions about hosting?",
    notReady: "Your event package is not ready yet. It will appear here after the team generates a PDF for the current question set.",
    privacy: "Only you, the assigned host, can see these instructions and questions.",
    questions: "Event questions",
    sharing: "Sharing",
    spicy: "Spicy",
    supportIntro: "Ask us anything about hosting this event. Your message will include a link to this page so we have the right context.",
    supportSubject: "Question about hosting an event",
    supportTitle: "How can we help with hosting?",
    supportTrigger: "Ask a hosting question",
  },
  es: {
    download: "Descargar el PDF del evento",
    downloadDescription: "Es el mismo PDF específico del evento que recibiste adjunto en el correo con la guía.",
    eyebrow: "Espacio privado para organizar el evento",
    helpDescription: "Pregúntanos cualquier duda sobre cómo recibir al grupo, los horarios o las preguntas.",
    helpTitle: "¿Tienes dudas sobre cómo recibir al grupo?",
    notReady: "El paquete del evento todavía no está listo. Aparecerá aquí cuando el equipo genere el PDF de la selección actual de preguntas.",
    privacy: "Solo tú, como persona asignada para recibir al grupo, puedes ver estas instrucciones y preguntas.",
    questions: "Preguntas del evento",
    sharing: "Sharing",
    spicy: "Spicy",
    supportIntro: "Pregúntanos cualquier cosa sobre cómo recibir al grupo en este evento. Tu mensaje incluirá un enlace a esta página para que tengamos el contexto correcto.",
    supportSubject: "Pregunta sobre cómo recibir al grupo en un evento",
    supportTitle: "¿Cómo podemos ayudarte con el evento?",
    supportTrigger: "Hacer una pregunta sobre el evento",
  },
} as const;

export function EventHostPlaybook({
  locale,
  material,
}: {
  locale: Locale;
  material: EventMaterial | null;
}) {
  const text = copy[locale];
  const supportCopy = {
    ...getDictionary(locale).actions.support,
    intro: text.supportIntro,
    subject: text.supportSubject,
    title: text.supportTitle,
    trigger: text.supportTrigger,
  };
  const snapshot = material?.source_snapshot || null;
  if (!material || !snapshot || snapshot.event.languageCode !== locale) {
    return (
      <Card className="scroll-mt-6 border-amber-300/70 bg-amber-50" id="host-guide">
        <CardHeader>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">{text.eyebrow}</p>
          <CardTitle>{locale === "es" ? "Paquete del evento" : "Host package"}</CardTitle>
          <CardDescription className="leading-6 text-amber-900">{text.notReady}</CardDescription>
        </CardHeader>
        <CardContent className="grid justify-items-start">
          <SupportQuestionDialog
            copy={supportCopy}
            emailSource="authenticated"
            locale={locale}
          />
        </CardContent>
      </Card>
    );
  }

  const instructions = snapshot.instructions;
  return (
    <section aria-labelledby="host-playbook-title" className="grid scroll-mt-6 gap-4" id="host-guide">
      <Card className="overflow-hidden border-ocean-blue/20">
        <CardHeader className="bg-ocean-blue/8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ocean-blue">{text.eyebrow}</p>
              <CardTitle id="host-playbook-title">{instructions.title}</CardTitle>
              <CardDescription className="max-w-3xl leading-6">{instructions.intro}</CardDescription>
            </div>
            <Badge variant="muted">v{snapshot.guideVersion} · r{snapshot.questionSetRevision}</Badge>
          </div>
          <p className="flex items-center gap-2 pt-2 text-xs font-semibold text-ocean-blue">
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            {text.privacy}
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6">
          <HostChecklist icon={BookOpenCheck} items={instructions.steps} title={locale === "es" ? "Antes de empezar" : "Before you begin"} />

          <div className="grid gap-3 lg:grid-cols-2">
            <RoundCard body={instructions.sharingBody} icon={UsersRound} title={instructions.sharingTitle} />
            <RoundCard body={instructions.spicyBody} icon={Sparkles} title={instructions.spicyTitle} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <HostNotice body={instructions.passing} icon={ShieldAlert} title={locale === "es" ? "Pasar preguntas" : "Passing questions"} />
            <HostNotice body={instructions.closing} icon={Sparkles} title={locale === "es" ? "Cerrar el evento" : "Closing the event"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.download}</CardTitle>
          <CardDescription>{text.downloadDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            className="inline-flex items-center gap-2 rounded-lg border border-wine-burgundy/10 bg-white px-4 py-2 text-sm font-semibold text-wine-burgundy transition hover:border-lipstick-red/40 hover:text-lipstick-red"
            href={material.public_url}
            rel="noreferrer"
            target="_blank"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {text.download} · v{material.version}
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{text.questions}</CardTitle>
            <Badge variant="muted">
              {snapshot.questions.sharing.length + snapshot.questions.spicy.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <QuestionGroup questions={snapshot.questions.sharing} title={text.sharing} />
          <QuestionGroup questions={snapshot.questions.spicy} title={text.spicy} />
        </CardContent>
      </Card>

      <Card className="border-ocean-blue/20 bg-ocean-blue/8">
        <CardHeader>
          <CardTitle>{text.helpTitle}</CardTitle>
          <CardDescription className="leading-6">{text.helpDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid justify-items-start">
          <SupportQuestionDialog
            copy={supportCopy}
            emailSource="authenticated"
            locale={locale}
          />
        </CardContent>
      </Card>
    </section>
  );
}
function HostChecklist({ icon: Icon, items, title }: { icon: typeof BookOpenCheck; items: string[]; title: string }) {
  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-2 font-display text-xl font-extrabold text-wine-burgundy">
        <Icon aria-hidden="true" className="h-5 w-5 text-lipstick-red" />
        {title}
      </h3>
      <ol className="grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <li className="flex gap-3 rounded-lg bg-blush-pink p-3 text-sm leading-6 text-muted" key={item}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lipstick-red text-xs font-black text-white">{index + 1}</span>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundCard({ body, icon: Icon, title }: { body: string; icon: typeof UsersRound; title: string }) {
  return (
    <div className="rounded-xl border border-wine-burgundy/10 bg-blush-pink p-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-wine-burgundy">
        <Icon aria-hidden="true" className="h-5 w-5 text-lipstick-red" />{title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

function HostNotice({ body, icon: Icon, title }: { body: string; icon: typeof ShieldAlert; title: string }) {
  return (
    <div className="rounded-xl border border-ocean-blue/15 bg-ocean-blue/8 p-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-ocean-blue">
        <Icon aria-hidden="true" className="h-5 w-5" />{title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-ocean-blue">{body}</p>
    </div>
  );
}

function QuestionGroup({ questions, title }: { questions: EventGuideQuestionSnapshot[]; title: string }) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="font-display text-xl font-extrabold text-wine-burgundy">{title}</h3>
      <ol className="grid gap-2">
        {questions.map((question, index) => (
          <li className="flex gap-3 rounded-lg border border-wine-burgundy/10 p-3" key={question.id}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blush-pink text-xs font-black text-wine-burgundy">{index + 1}</span>
            <p className="pt-0.5 text-sm font-semibold leading-6 text-wine-burgundy">{question.prompt}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
