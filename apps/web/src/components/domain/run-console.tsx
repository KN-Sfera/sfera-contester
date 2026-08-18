"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  LANGUAGES,
  MAX_SOURCE_BYTES,
  type LanguageId,
  type RunResult,
} from "@sfera/shared";
import { CodeEditor } from "@/components/editor/code-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { runOnce } from "@/lib/api/runs";
import { formatBytes, formatMemory, formatTime } from "@/lib/format";
import { useMediaQuery, WORKSPACE_BREAKPOINT } from "@/lib/media";
import { starterCode } from "@/lib/starter-code";
import { verdictMeta } from "@/lib/verdict";

/**
 * The scratchpad: code, your own input, the output.
 *
 * The landing screen deliberately asks nothing of the visitor — no account, no
 * problem chosen. You arrive, you run something, and only then do you decide
 * whether to solve a problem. Judging happens in the same sandbox as a real
 * submission, so what you see here is what the judge would see.
 */

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({
  value: language.id,
  label: language.label,
}));

const DRAFT_KEY = "sfera-scratchpad";
const STDIN_KEY = "sfera-scratchpad-stdin";

type PanelId = "code" | "output";

const PANELS = [
  { id: "code", label: "Code" },
  { id: "output", label: "Output" },
] as const;

export function RunConsole() {
  const { show } = useToast();
  const { matches: isDesktop } = useMediaQuery(WORKSPACE_BREAKPOINT);

  const [language, setLanguage] = useState<LanguageId>("cpp");
  const [source, setSource] = useState("");
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [panel, setPanel] = useState<PanelId>("code");
  const [freshOutput, setFreshOutput] = useState(false);

  // The scratchpad survives a refresh; a language switch loads that language's
  // own draft, so trying the same input in C++ and Python costs nothing.
  useEffect(() => {
    setSource(read(`${DRAFT_KEY}:${language}`) ?? starterCode(language));
  }, [language]);

  useEffect(() => {
    setStdin(read(STDIN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (!source) return;
    const timer = window.setTimeout(() => {
      write(`${DRAFT_KEY}:${language}`, source);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [source, language]);

  useEffect(() => {
    const timer = window.setTimeout(() => write(STDIN_KEY, stdin), 400);
    return () => window.clearTimeout(timer);
  }, [stdin]);

  const sourceBytes = useMemo(
    () => new TextEncoder().encode(source).length,
    [source],
  );
  const tooLarge = sourceBytes > MAX_SOURCE_BYTES;

  const onRun = async () => {
    if (running || !source.trim() || tooLarge) return;
    setRunning(true);
    setResult(null);

    try {
      const run = await runOnce({
        language,
        source,
        stdin: stdin === "" ? undefined : stdin,
      });
      setResult(run);
      setFreshOutput(panel !== "output");
    } catch (error) {
      show(
        error instanceof ApiError && error.message
          ? error.message
          : "Could not run the code.",
        "error",
      );
    } finally {
      setRunning(false);
    }
  };

  const controls = (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        label="Language"
        hideLabel
        options={LANGUAGE_OPTIONS}
        value={language}
        onChange={(event) => setLanguage(event.target.value as LanguageId)}
        className="w-44"
      />
      <Button
        size="sm"
        variant="primary"
        className="ml-auto"
        onClick={onRun}
        loading={running}
        disabled={running || tooLarge}
      >
        Run
      </Button>
    </div>
  );

  const editor = (
    <>
      <div className="h-[46vh] min-h-64 border border-rule lg:h-[calc(100dvh-24rem)]">
        <CodeEditor
          value={source}
          language={language}
          onChange={setSource}
          onSubmit={onRun}
        />
      </div>
      <p className="flex flex-wrap items-center justify-between gap-2 text-micro text-ink-faint">
        <span>Ctrl/Cmd+Enter runs</span>
        <span className={tooLarge ? "text-[var(--v-wa)]" : undefined}>
          {formatBytes(sourceBytes)} / {formatBytes(MAX_SOURCE_BYTES)}
        </span>
      </p>
    </>
  );

  const input = (
    <label className="flex flex-col gap-1.5">
      <span className="label">Standard input</span>
      <textarea
        value={stdin}
        onChange={(event) => setStdin(event.target.value)}
        rows={5}
        spellCheck={false}
        placeholder="Whatever your program reads from stdin"
        className="w-full resize-y border border-rule-strong bg-paper-sunken px-3 py-2 text-small leading-relaxed rounded-[2px] transition-colors duration-[var(--dur-fast)] placeholder:text-ink-faint hover:border-ink-muted focus:border-ink"
      />
    </label>
  );

  const output = <RunOutput result={result} running={running} />;

  if (isDesktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] gap-px bg-rule">
        <section
          className="flex flex-col gap-3 bg-paper px-5 py-5"
          aria-label="Code"
        >
          {controls}
          {editor}
        </section>
        <section
          className="flex flex-col gap-5 overflow-y-auto bg-paper px-5 py-5"
          aria-label="Input and output"
        >
          {input}
          {output}
        </section>
      </div>
    );
  }

  return (
    <div>
      <Tabs
        label="Scratchpad panels"
        items={PANELS.map((item) =>
          item.id === "output" ? { ...item, dot: freshOutput } : item,
        )}
        active={panel}
        onChange={(next) => {
          setPanel(next);
          if (next === "output") setFreshOutput(false);
        }}
      />

      <div className="flex flex-col gap-4 px-4 py-5">
        <TabPanel id="code" active={panel} className="flex flex-col gap-3">
          {controls}
          {editor}
          {input}
        </TabPanel>

        <TabPanel id="output" active={panel}>
          {output}
        </TabPanel>
      </div>
    </div>
  );
}

function RunOutput({
  result,
  running,
}: {
  result: RunResult | null;
  running: boolean;
}) {
  if (running) {
    return (
      <p aria-live="polite" className="text-small text-ink-muted">
        Compiling and running…
      </p>
    );
  }

  if (!result) {
    return (
      <div className="border border-dashed border-rule px-4 py-6">
        <p className="text-small text-ink-muted">
          Nothing has run yet. This is a scratchpad — the code goes nowhere and
          counts for nothing.{" "}
          <Link href="/problems" className="text-ink underline">
            Pick a problem
          </Link>{" "}
          when you want it judged.
        </p>
      </div>
    );
  }

  const meta = verdictMeta(result.verdict);

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex items-center justify-between border-b border-rule pb-2">
        <span className="label">Output</span>
        <span className="flex items-center gap-3">
          <span className="text-micro text-ink-faint">
            {formatTime(result.time)} · {formatMemory(result.memory)}
          </span>
          <VerdictBadge verdict={result.verdict} />
        </span>
      </div>

      {result.compileOutput ? (
        <Block label="Compiler" content={result.compileOutput} />
      ) : (
        <>
          <Block label="stdout" content={result.stdout} />
          {result.stderr && <Block label="stderr" content={result.stderr} />}
          {/*
            Judge0 sends an empty `exit_code` for a clean run, so a truthiness
            check is not enough — it printed "Exit code  —" on every success.
            Only a real, non-zero number is worth a line here.
          */}
          {typeof result.exitCode === "number" && result.exitCode !== 0 && (
            <p className="text-micro text-ink-muted">
              Exit code {result.exitCode} — {meta.description}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Block({ label, content }: { label: string; content: string }) {
  return (
    <div className="border border-rule">
      <p className="label-micro px-3 pt-2">{label}</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 pb-2.5 pt-1 text-small leading-relaxed">
        {content || <span className="text-ink-faint">(empty)</span>}
      </pre>
    </div>
  );
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing or an exhausted quota — the draft stops being durable,
    // the editor keeps working.
  }
}
