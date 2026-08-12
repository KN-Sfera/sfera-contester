import { LANGUAGES } from "@sfera/shared";

/** Lista dla frontu — bez `judge0Id`, który jest szczegółem implementacji. */
export function listLanguages() {
  return LANGUAGES.map(({ id, label, monaco }) => ({ id, label, monaco }));
}
