import type { Dictionary } from "@/lib/i18n/dictionaries";

export function localizeDbError(message: string, dictionary: Dictionary) {
  return (
    dictionary.dbErrors[message as keyof typeof dictionary.dbErrors] || message
  );
}
