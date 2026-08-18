import type { LanguageId } from "@sfera/shared";

/**
 * The shared editor interface. The rest of the application does not know —
 * and has no business knowing — whether Monaco or CodeMirror sits underneath.
 */
export interface EditorProps {
  value: string;
  language: LanguageId;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  /** Ctrl/Cmd+Enter — submit a solution without reaching for the mouse. */
  onSubmit?: () => void;
}
