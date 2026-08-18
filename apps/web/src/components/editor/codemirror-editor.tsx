"use client";

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import {
  HighlightStyle,
  bracketMatching,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { getLanguage } from "@sfera/shared";
import type { EditorProps } from "./types";

/**
 * The small-screen editor.
 *
 * Monaco weighs about a megabyte and behaves badly on a phone — it loses
 * on-screen keyboards and makes selection awkward. CodeMirror 6 weighs a
 * fraction of that and is built with touch in mind. Nobody writes an ICPC
 * solution on a phone, but fixing a typo on the way to the hall does happen.
 */

const LANGUAGE = new Compartment();
const READ_ONLY = new Compartment();

/**
 * Highlighting built from theme tokens — the editor must not be the only
 * place on screen with a palette of its own.
 */
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--v-re)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--v-ac)" },
  { tag: tags.comment, color: "var(--ink-faint)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool], color: "var(--v-tle)" },
  { tag: [tags.typeName, tags.className], color: "var(--v-ce)" },
  { tag: tags.function(tags.variableName), color: "var(--balloon-6)" },
  { tag: tags.operator, color: "var(--ink-muted)" },
  { tag: tags.meta, color: "var(--ink-faint)" },
]);

const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--paper-sunken)",
    color: "var(--ink)",
    height: "100%",
    fontSize: "13px",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "12px 0",
    caretColor: "var(--ink)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--ink-faint)",
    border: "none",
    fontFamily: "var(--font-mono)",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--ink) 4%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink-muted)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "var(--selection)" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
});

function languageSupport(language: EditorProps["language"]) {
  return getLanguage(language)?.monaco === "python" ? python() : cpp();
}

export default function CodeMirrorEditor({
  value,
  language,
  readOnly = false,
  onChange,
  onSubmit,
}: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Callbacks live in refs so that changing a handler does not rebuild the
  // whole editor and lose the cursor position.
  const handlers = useRef({ onChange, onSubmit });
  handlers.current = { onChange, onSubmit };

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        indentUnit.of("    "),
        syntaxHighlighting(highlight),
        theme,
        EditorView.lineWrapping,
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              handlers.current.onSubmit?.();
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        LANGUAGE.of(languageSupport(language)),
        READ_ONLY.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            handlers.current.onChange?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;

    return () => {
      instance.destroy();
      view.current = null;
    };
    // Built once — language, mode and content are updated by transactions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: LANGUAGE.reconfigure(languageSupport(language)),
    });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: READ_ONLY.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    // Replace only on a real difference — otherwise every keystroke would
    // wipe the selection.
    if (current === value) return;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div ref={host} className="h-full overflow-auto" />;
}
