/**
 * Class name joining. Deliberately without `clsx` and `tailwind-merge` —
 * components in this project don't override each other's Tailwind classes,
 * so resolving conflicts at runtime would be a dependency with no use case.
 */
export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
