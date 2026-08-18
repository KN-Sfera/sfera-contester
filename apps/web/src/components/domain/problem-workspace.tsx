"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LANGUAGES, MAX_SOURCE_BYTES, type LanguageId, type RunSamplesResult } from "@sfera/shared";
import { CodeEditor } from "@/components/editor/code-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import type { PublicProblem } from "@/lib/api/problems";
import { runSamples, submit } from "@/lib/api/submissions";
import { useSession } from "@/lib/auth/session-context";
import { formatBytes } from "@/lib/format";
import { useMediaQuery, WORKSPACE_BREAKPOINT } from "@/lib/media";
import { draftKey, starterCode } from "@/lib/starter-code";
import { LiveVerdict } from "./live-verdict";
import { SampleCases } from "./sample-cases";
import { SampleResults } from "./sample-results";

/**
 * The problem workspace: statement, editor, results.
 *
 * On the desktop, three columns like a printed spread. On a phone the same
 * three panels become tabs — forcing a split pane into 375 px produces an
 * unusable editor, so the panels change form rather than shrink.
 */

type PanelId = "statement" | "code" | "results";

const PANELS = [
  { id: "statement", label: "Statement" },
  { id: "code", label: "Code" },
  { id: "results", label: "Results" },
] as const;

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({
  value: language.id,
  label: language.label,
}));

export function ProblemWorkspace({
  problem,
  letter,
  statement,
}: {
  problem: PublicProblem;
  letter: string;
  /**
   * The statement arrives ready-made from the server. Were `Statement`
   * imported here, the Markdown parser and KaTeX would land in the browser
   * bundle — and the statement is public and static.
   */
  statement: React.ReactNode;
}) {
  const { status } = useSession();
  const { show } = useToast();
  // The three-column spread starts at 1024 px — below that the same three
  // panels become tabs. Until hydration we assume the mobile variant.
  const { matches: isDesktop } = useMediaQuery(WORKSPACE_BREAKPOINT);

  const [language, setLanguage] = useState<LanguageId>("cpp");
  const [source, setSource] = useState("");
  const [panel, setPanel] = useState<PanelId>("statement");
  const [freshResults, setFreshResults] = useState(false);

  const [samples, setSamples] = useState<RunSamplesResult | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"none" | "samples" | "submit">("none");

  // The draft survives a refresh and a language switch. Losing code to an
  // accidental reload is the most expensive mistake this screen could make.
  useEffect(() => {
    const stored = readDraft(problem.slug, language);
    setSource(stored ?? starterCode(language));
  }, [problem.slug, language]);

  useEffect(() => {
    if (!source) return;
    const key = draftKey(problem.slug, language);
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(key, source);
      } catch {
        // Out of quota or private browsing — the draft stops being durable,
        // but the editor keeps working.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [source, problem.slug, language]);

  const sourceBytes = useMemo(
    () => new TextEncoder().encode(source).length,
    [source],
  );
  const tooLarge = sourceBytes > MAX_SOURCE_BYTES;

  /** The dot on the "Results" tab, for when the user is on another panel. */
  const markResults = useCallback(() => {
    setFreshResults((current) => current || panel !== "results");
  }, [panel]);

  const onRunSamples = async () => {
    if (busy !== "none" || !source.trim()) return;
    setBusy("samples");
    setSubmissionId(null);
    setSamples(null);

    try {
      const result = await runSamples({
        problemSlug: problem.slug,
        language,
        source,
      });
      setSamples(result);
      markResults();
    } catch (error) {
      show(errorMessage(error, "Could not run the samples."), "error");
    } finally {
      setBusy("none");
    }
  };

  const onSubmit = async () => {
    if (busy !== "none" || !source.trim()) return;

    if (status !== "authenticated") {
      show("Sign in to submit a solution.", "error");
      return;
    }
    if (tooLarge) {
      show(`The code exceeds the ${formatBytes(MAX_SOURCE_BYTES)} limit.`, "error");
      return;
    }

    setBusy("submit");
    setSamples(null);

    try {
      const created = await submit({
        problemSlug: problem.slug,
        language,
        source,
      });
      setSubmissionId(created.submissionId);
      markResults();
    } catch (error) {
      show(errorMessage(error, "Could not submit the solution."), "error");
    } finally {
      setBusy("none");
    }
  };

  const editor = (
    <EditorPanel
      language={language}
      onLanguageChange={setLanguage}
      source={source}
      onSourceChange={setSource}
      onSubmit={onSubmit}
      onRunSamples={onRunSamples}
      busy={busy}
      sourceBytes={sourceBytes}
      tooLarge={tooLarge}
      anonymous={status === "anonymous"}
    />
  );

  const results = (
    <ResultsPanel
      slug={problem.slug}
      submissionId={submissionId}
      samples={samples}
      busy={busy}
    />
  );

  /*
   * The layout is switched in JS rather than with `lg:hidden` classes.
   *
   * Switching through CSS **mounts** both variants at once — and each carries
   * its own editor. That produced two Monaco or CodeMirror instances, both
   * wired to the same `onChange`, one of them merely hidden. Here we pay one
   * frame of the mobile layout on desktop before hydration; there we paid for
   * a duplicate editor the entire time.
   */
  if (isDesktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_320px] gap-px bg-rule">
        <section className="overflow-y-auto bg-paper px-6 py-6" aria-label="Problem statement">
          {statement}
          <div className="mt-8">
            <SampleCases cases={problem.testCases} />
          </div>
        </section>

        <section
          className="flex flex-col gap-3 bg-paper px-5 py-5"
          aria-label={`Solution for problem ${letter}`}
        >
          {editor}
        </section>

        <section className="overflow-y-auto bg-paper px-5 py-5" aria-label="Results">
          {results}
        </section>
      </div>
    );
  }

  return (
    <>
      <div>
        <Tabs
          label="Problem panels"
          items={PANELS.map((item) =>
            item.id === "results" ? { ...item, dot: freshResults } : item,
          )}
          active={panel}
          onChange={(next) => {
            setPanel(next);
            if (next === "results") setFreshResults(false);
          }}
        />

        <div className="px-4 py-5">
          <TabPanel id="statement" active={panel}>
            {statement}
            <div className="mt-8">
              <SampleCases cases={problem.testCases} />
            </div>
          </TabPanel>

          <TabPanel id="code" active={panel} className="flex flex-col gap-3">
            {editor}
          </TabPanel>

          <TabPanel id="results" active={panel}>
            {results}
          </TabPanel>
        </div>
      </div>
    </>
  );
}

function EditorPanel({
  language,
  onLanguageChange,
  source,
  onSourceChange,
  onSubmit,
  onRunSamples,
  busy,
  sourceBytes,
  tooLarge,
  anonymous,
}: {
  language: LanguageId;
  onLanguageChange: (language: LanguageId) => void;
  source: string;
  onSourceChange: (source: string) => void;
  onSubmit: () => void;
  onRunSamples: () => void;
  busy: "none" | "samples" | "submit";
  sourceBytes: number;
  tooLarge: boolean;
  anonymous: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="Language"
          hideLabel
          options={LANGUAGE_OPTIONS}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as LanguageId)}
          className="w-44"
        />

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onRunSamples}
            loading={busy === "samples"}
            disabled={busy !== "none"}
          >
            Samples
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onSubmit}
            loading={busy === "submit"}
            disabled={busy !== "none" || tooLarge}
          >
            Submit
          </Button>
        </div>
      </div>

      <div className="h-[52vh] min-h-72 border border-rule lg:h-[calc(100dvh-16rem)]">
        <CodeEditor
          value={source}
          language={language}
          onChange={onSourceChange}
          onSubmit={onSubmit}
        />
      </div>

      <p className="flex flex-wrap items-center justify-between gap-2 text-micro text-ink-faint">
        <span>Ctrl/Cmd+Enter submits</span>
        <span className={tooLarge ? "text-[var(--v-wa)]" : undefined}>
          {formatBytes(sourceBytes)} / {formatBytes(MAX_SOURCE_BYTES)}
        </span>
      </p>

      {anonymous && (
        <p className="text-micro text-ink-muted">
          <Link href="/login" className="text-ink underline">
            Sign in
          </Link>{" "}
          to submit solutions. Samples run without an account.
        </p>
      )}
    </>
  );
}

function ResultsPanel({
  slug,
  submissionId,
  samples,
  busy,
}: {
  slug: string;
  submissionId: string | null;
  samples: RunSamplesResult | null;
  busy: "none" | "samples" | "submit";
}) {
  if (submissionId) {
    return (
      <div className="flex flex-col gap-4">
        <LiveVerdict submissionId={submissionId} slug={slug} />
        <Link
          href={`/submissions/${submissionId}`}
          className="text-micro uppercase tracking-[0.1em] text-ink-muted"
        >
          Full submission results
        </Link>
      </div>
    );
  }

  if (samples) return <SampleResults result={samples} />;

  if (busy === "samples") {
    return <p className="text-small text-ink-muted">Compiling and running…</p>;
  }

  return (
    <p className="text-small text-ink-muted">
      Run your code against the samples to check input and output. Submit to put
      it through every test.
    </p>
  );
}

function readDraft(slug: string, language: LanguageId): string | null {
  try {
    return localStorage.getItem(draftKey(slug, language));
  } catch {
    return null;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
