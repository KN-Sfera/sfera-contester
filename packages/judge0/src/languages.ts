import { LANGUAGES } from "@sfera/shared";

/** The list for the frontend — without `judge0Id`, an implementation detail. */
export function listLanguages() {
  return LANGUAGES.map(({ id, label, monaco }) => ({ id, label, monaco }));
}
