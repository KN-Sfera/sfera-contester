import type { LanguageId } from "@sfera/shared";

/**
 * Starter code — the read/write skeleton, not a solution.
 *
 * An empty editor costs every contestant the same thirty seconds spent typing
 * the same headers. We hand over the skeleton and put the cursor where the
 * actual work begins.
 */
const TEMPLATES: Record<LanguageId, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  clangpp: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  c: `#include <stdio.h>

int main(void) {

    return 0;
}
`,
  clang: `#include <stdio.h>

int main(void) {

    return 0;
}
`,
  python: `import sys

def main() -> None:
    data = sys.stdin.read().split()


if __name__ == "__main__":
    main()
`,
};

export function starterCode(language: LanguageId): string {
  return TEMPLATES[language] ?? "";
}

/** Draft key. A solution survives a page refresh and a language switch. */
export function draftKey(slug: string, language: LanguageId): string {
  return `sfera-draft:${slug}:${language}`;
}
