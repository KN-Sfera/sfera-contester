"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useRef } from "react";
import { getLanguage } from "@sfera/shared";
import { useTheme } from "@/lib/theme/theme-context";
import type { EditorProps } from "./types";
// Side effect: swaps in the local Monaco instance instead of the CDN one.
// This import has to run before <Editor /> renders for the first time.
import "./monaco-setup";

/**
 * The desktop editor — where people actually write solutions, and where
 * Monaco's assistance earns its weight.
 *
 * We define the theme ourselves rather than take `vs-dark`: the editor's
 * palette has to be the same palette as the rest of the interface.
 */

const SUBMIT_KEYBINDING = 2048 | 3; // CtrlCmd | Enter — without pulling `monaco` into the bundle.

export default function MonacoEditor({
  value,
  language,
  readOnly = false,
  onChange,
  onSubmit,
}: EditorProps) {
  const { theme } = useTheme();
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const onMount = useCallback<OnMount>((editor, monaco) => {
    for (const [name, palette] of Object.entries(THEMES)) {
      monaco.editor.defineTheme(name, palette);
    }
    monaco.editor.setTheme(
      document.documentElement.dataset.theme === "light"
        ? "sfera-paper"
        : "sfera-ink",
    );

    editor.addCommand(SUBMIT_KEYBINDING, () => submitRef.current?.());
  }, []);

  return (
    <Editor
      value={value}
      language={getLanguage(language)?.monaco ?? "cpp"}
      theme={theme === "light" ? "sfera-paper" : "sfera-ink"}
      onChange={(next) => onChange?.(next ?? "")}
      onMount={onMount}
      loading={
        <span className="text-label text-ink-faint">Loading editor…</span>
      }
      options={{
        readOnly,
        fontSize: 13,
        fontFamily: "var(--font-mono)",
        fontLigatures: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        smoothScrolling: true,
        automaticLayout: true,
        tabSize: 4,
        padding: { top: 12, bottom: 12 },
        // An ICPC problem is a single file — a minimap and an overview ruler
        // have nothing to show.
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
      height="100%"
    />
  );
}

/**
 * Monaco does not understand `var(--...)`, so the values have to be literal
 * here. This is the only place in the project where colours are duplicated —
 * kept side by side so any drift from `globals.css` is visible at once.
 */
const THEMES = {
  "sfera-ink": {
    base: "vs-dark" as const,
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a6a63", fontStyle: "italic" },
      { token: "keyword", foreground: "b08bd9" },
      { token: "string", foreground: "5cc48a" },
      { token: "number", foreground: "d9a441" },
      { token: "type", foreground: "a79e90" },
    ],
    colors: {
      "editor.background": "#0e0f0d",
      "editor.foreground": "#edebe4",
      "editorLineNumber.foreground": "#4c4c46",
      "editorLineNumber.activeForeground": "#9b9a92",
      "editor.lineHighlightBackground": "#17181500",
      "editor.selectionBackground": "#edebe42e",
      "editorCursor.foreground": "#edebe4",
      "editorIndentGuide.background1": "#26261f",
    },
  },
  "sfera-paper": {
    base: "vs" as const,
    inherit: true,
    rules: [
      { token: "comment", foreground: "7e7f77", fontStyle: "italic" },
      { token: "keyword", foreground: "5f3f91" },
      { token: "string", foreground: "256c45" },
      { token: "number", foreground: "8a5d0c" },
      { token: "type", foreground: "6b6357" },
    ],
    colors: {
      "editor.background": "#e4e1d8",
      "editor.foreground": "#191a17",
      "editorLineNumber.foreground": "#a3a49b",
      "editorLineNumber.activeForeground": "#5e5f58",
      "editor.lineHighlightBackground": "#00000008",
      "editor.selectionBackground": "#191a1724",
      "editorCursor.foreground": "#191a17",
      "editorIndentGuide.background1": "#cfccc2",
    },
  },
};
