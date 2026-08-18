import { loader } from "@monaco-editor/react";
// `editor.main` is the full editor with contributions — find widget, context
// menu, history. `editor.api` alone would give a bare view without them, and
// assembling the contribution list by hand drifts with every Monaco upgrade.
// The package ships no declarations for this path, so the type comes from the
// public entry point — it is the same module, contributions included.
import type * as MonacoApi from "monaco-editor";
// @ts-expect-error — no .d.ts for this path in the monaco-editor package.
import * as monacoMain from "monaco-editor/editor/editor.main.js";

const monaco = monacoMain as typeof MonacoApi;

/**
 * Monaco, hosted locally.
 *
 * `@monaco-editor/react` pulls the editor from `cdn.jsdelivr.net` by default.
 * For a self-hosted contester that is a failure, not an inconvenience: the
 * contest runs in a hall, often on a cut-off network, and the editor cannot
 * depend on reaching the internet. So we hand it the npm instance instead.
 */

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (workerId: string, label: string) => Worker;
    };
  }
}

if (typeof window !== "undefined") {
  window.MonacoEnvironment = {
    // C++ and Python have no language servers in Monaco — only the core
    // editor worker is needed.
    getWorker: () =>
      new Worker(
        new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
        { type: "module" },
      ),
  };
}

loader.config({ monaco });

export { monaco };
