import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { podcastsForLocale, type PodcastLanguage } from "@/lib/podcast-collection";

export const dynamic = "force-dynamic";

const languageFlags: Record<PodcastLanguage, string> = {
  en: "🇬🇧",
  es: "🇪🇸",
};

function languageName(language: PodcastLanguage, dictionary: ReturnType<typeof getDictionary>) {
  return language === "es" ? dictionary.collection.spanish : dictionary.collection.english;
}

export default async function CollectionPage() {
  const { locale } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const podcasts = podcastsForLocale(locale);

  return (
    <section className="grid gap-5">
      <div className="grid gap-2">
        <h1 className="font-display text-3xl font-black text-wine-burgundy">
          {dictionary.collection.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {dictionary.collection.intro}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {podcasts.map((podcast) => {
          const language = languageName(podcast.language, dictionary);

          return (
            <Card className="h-full border-wine-burgundy/10 bg-white/90" key={podcast.href}>
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="font-display text-xl text-wine-burgundy">
                    {podcast.title}
                  </CardTitle>
                  <Badge
                    aria-label={`${dictionary.collection.languageLabel}: ${language}`}
                    className="shrink-0 border-ocean-blue/20 bg-ocean-blue/10 text-ocean-blue"
                    variant="ocean-blue"
                  >
                    <span aria-hidden="true">{languageFlags[podcast.language]}</span>
                    <span>{language}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid h-full content-between gap-5">
                <p className="text-sm leading-6 text-muted">{podcast.description}</p>
                <Button asChild className="w-fit" variant="ocean-blue">
                  <a href={podcast.href} rel="noreferrer" target="_blank">
                    {dictionary.collection.openPodcast}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
