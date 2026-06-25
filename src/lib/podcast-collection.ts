import type { Locale } from "@/lib/i18n/locales";

export type PodcastLanguage = "en" | "es";

export type PodcastCollectionItem = {
  description: string;
  href: string;
  language: PodcastLanguage;
  title: string;
};

const podcastCollection: PodcastCollectionItem[] = [
  {
    title: "Modern Love",
    description: "Personal essays and conversations about connection, intimacy, and relationships.",
    href: "https://www.nytimes.com/column/modern-love-podcast",
    language: "en",
  },
  {
    title: "Where Should We Begin? with Esther Perel",
    description: "Real relationship sessions that explore the patterns behind how people connect.",
    href: "https://www.estherperel.com/podcast",
    language: "en",
  },
  {
    title: "On Being with Krista Tippett",
    description: "Long-form conversations about meaning, community, and the inner life.",
    href: "https://onbeing.org/series/podcast/",
    language: "en",
  },
  {
    title: "Entiende Tu Mente",
    description: "Conversaciones breves de psicología para entender mejor cómo pensamos y nos relacionamos.",
    href: "https://entiendetumente.info/",
    language: "es",
  },
  {
    title: "Se Regalan Dudas",
    description: "Conversaciones honestas sobre amor, amistad, bienestar y las preguntas que compartimos.",
    href: "https://seregalandudas.com/",
    language: "es",
  },
  {
    title: "El Hilo",
    description: "Historias y conversaciones en español para entender mejor la cultura y la sociedad actual.",
    href: "https://elhilo.audio/",
    language: "es",
  },
];

export function podcastsForLocale(locale: Locale) {
  if (locale === "en") {
    return podcastCollection.filter((podcast) => podcast.language === "en");
  }

  return [...podcastCollection].sort((left, right) => {
    if (left.language === right.language) return 0;
    return left.language === "es" ? -1 : 1;
  });
}
