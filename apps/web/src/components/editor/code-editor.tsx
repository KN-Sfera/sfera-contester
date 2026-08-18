"use client";

import dynamic from "next/dynamic";
import { EDITOR_BREAKPOINT, useMediaQuery } from "@/lib/media";
import type { EditorProps } from "./types";

/**
 * The editor facade.
 *
 * The choice is made after mounting, so that **one** editor is loaded rather
 * than both. Until then we show the real content in a `<pre>` — not a
 * skeleton. On a slow connection, code you can read beats a pulsing rectangle.
 */

const MonacoEditor = dynamic(() => import("./monaco-editor"), { ssr: false });
const CodeMirrorEditor = dynamic(() => import("./codemirror-editor"), {
  ssr: false,
});

export function CodeEditor(props: EditorProps) {
  const { matches: isWide, mounted } = useMediaQuery(EDITOR_BREAKPOINT);

  if (!mounted) {
    return (
      <pre className="h-full overflow-auto bg-paper-sunken p-3 text-micro leading-relaxed text-ink-muted">
        {props.value}
      </pre>
    );
  }

  return isWide ? <MonacoEditor {...props} /> : <CodeMirrorEditor {...props} />;
}
