"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  LANGUAGES,
  type LanguageId,
  type ProblemSummary,
  type RunResult,
  type RunSamplesResult,
  type Verdict,
} from "@sfera/shared";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[var(--muted)]">
      Ładowanie edytora…
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

const DEFAULT_SOURCES: Record<LanguageId, string> = {
  c: `#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    if (scanf("%d %d", &a, &b) == 2) {\n        printf("%d\\n", a + b);\n    }\n    return 0;\n}\n`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    long long a, b;\n    if (cin >> a >> b) cout << a + b << "\\n";\n    return 0;\n}\n`,
  clang: `#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    if (scanf("%d %d", &a, &b) == 2) {\n        printf("%d\\n", a + b);\n    }\n    return 0;\n}\n`,
  clangpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b;\n    if (cin >> a >> b) cout << a + b << "\\n";\n    return 0;\n}\n`,
  python: `a, b = map(int, input().split())\nprint(a + b)\n`,
};

function verdictColor(verdict: Verdict | null): string {
  if (!verdict) return "var(--muted)";
  if (verdict === "AC" || verdict === "OK") return "var(--ok)";
  if (verdict === "WA") return "var(--wa)";
  if (verdict === "CE") return "var(--ce)";
  return "var(--err)";
}

export default function HomePage() {
  const [language, setLanguage] = useState<LanguageId>("cpp");
  const [source, setSource] = useState(DEFAULT_SOURCES.cpp);
  const [stdin, setStdin] = useState("1 2\n");
  const [expected, setExpected] = useState("3\n");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [samplesResult, setSamplesResult] = useState<RunSamplesResult | null>(
    null,
  );
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "stdout" | "stderr" | "compile" | "samples"
  >("stdout");

  const monacoLanguage = useMemo(
    () => LANGUAGES.find((l) => l.id === language)?.monaco ?? "cpp",
    [language],
  );

  useEffect(() => {
    fetch(`${API_URL}/api/problems`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ProblemSummary[]) => {
        setProblems(data);
        if (data[0]) setSelectedProblem(data[0].slug);
      })
      .catch(() => setProblems([]));
  }, []);

  function onLanguageChange(next: LanguageId) {
    setLanguage(next);
    setSource(DEFAULT_SOURCES[next]);
  }

  async function loadProblem(slug: string) {
    setSelectedProblem(slug);
    const res = await fetch(`${API_URL}/api/problems/${slug}`);
    if (!res.ok) return;
    const problem = await res.json();
    const sample = problem.testCases?.[0];
    if (sample) {
      setStdin(sample.input ?? "");
      setExpected(sample.expectedOutput ?? "");
    }
  }

  async function runCode() {
    setBusy(true);
    setError(null);
    setSamplesResult(null);
    try {
      const res = await fetch(`${API_URL}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          source,
          stdin,
          expectedStdout: expected.length > 0 ? expected : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : JSON.stringify(data.error ?? data);
        throw new Error(message || "Run failed");
      }
      setResult(data as RunResult);
      setActiveTab("stdout");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSamples() {
    if (!selectedProblem) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/run-samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          source,
          problemSlug: selectedProblem,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Samples run failed",
        );
      }
      setSamplesResult(data as RunSamplesResult);
      setResult(null);
      setActiveTab("samples");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Samples run failed");
    } finally {
      setBusy(false);
    }
  }

  const displayVerdict = samplesResult?.verdict ?? result?.verdict ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-[var(--accent)] uppercase">
            Internal sandbox
          </p>
          <h1
            className="mt-1 text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-sans), sans-serif" }}
          >
            Sfera
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Odpalaj kod w izolowanym Dockerze (Judge0) i porównuj stdout z
            expected — prymitywny playground pod zadania algorytmiczne.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as LanguageId)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={runCode}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-dim)] disabled:opacity-50"
          >
            {busy ? "Running…" : "Run Code"}
          </button>
          <button
            type="button"
            disabled={busy || !selectedProblem}
            onClick={runSamples}
            className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] disabled:opacity-50"
          >
            Run Samples
          </button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
            <span>editor</span>
            <span style={{ fontFamily: "var(--font-mono), monospace" }}>
              {language}
            </span>
          </div>
          <div className="min-h-[380px] flex-1">
            <MonacoEditor
              height="100%"
              theme="vs-dark"
              language={monacoLanguage}
              value={source}
              onChange={(value) => setSource(value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "IBM Plex Mono, ui-monospace, monospace",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            Problem (samples)
            <select
              className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              value={selectedProblem}
              onChange={(e) => loadProblem(e.target.value)}
            >
              {problems.map((problem) => (
                <option key={problem.slug} value={problem.slug}>
                  {problem.title}
                </option>
              ))}
            </select>
          </label>

          {problems.find((p) => p.slug === selectedProblem) && (
            <p className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm whitespace-pre-wrap text-[var(--muted)]">
              {problems.find((p) => p.slug === selectedProblem)?.statement}
            </p>
          )}

          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            stdin
            <textarea
              className="min-h-[100px] rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-sm text-[var(--text)]"
              style={{ fontFamily: "var(--font-mono), monospace" }}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            expected stdout (opcjonalnie → AC/WA)
            <textarea
              className="min-h-[100px] rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-sm text-[var(--text)]"
              style={{ fontFamily: "var(--font-mono), monospace" }}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </label>
        </aside>
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["stdout", "stdout"],
                ["stderr", "stderr"],
                ["compile", "compile"],
                ["samples", "samples"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`rounded px-3 py-1 text-xs uppercase tracking-wide ${
                  activeTab === id
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-elevated)] text-[var(--muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span
              className="font-semibold"
              style={{ color: verdictColor(displayVerdict) }}
            >
              {displayVerdict ?? "—"}
            </span>
            {result && (
              <>
                <span className="text-[var(--muted)]">
                  {result.time ?? "?"}s
                </span>
                <span className="text-[var(--muted)]">
                  {result.memory != null ? `${result.memory} KB` : "— KB"}
                </span>
                <span className="text-[var(--muted)]">
                  exit {result.exitCode ?? "—"}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="min-h-[160px] p-4 font-mono text-sm whitespace-pre-wrap"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        >
          {error && <p style={{ color: "var(--err)" }}>{error}</p>}
          {!error && activeTab === "stdout" && (
            <div className="space-y-2">
              {result?.message && (
                <p style={{ color: "var(--err)" }}>
                  {result.status}: {result.message}
                </p>
              )}
              <div>{result?.stdout || (result ? "(empty)" : "Jeszcze nie uruchomiono.")}</div>
            </div>
          )}
          {!error && activeTab === "stderr" && (result?.stderr || "(empty)")}
          {!error &&
            activeTab === "compile" &&
            (result?.compileOutput || "(empty)")}
          {!error && activeTab === "samples" && (
            <div className="space-y-3">
              {!samplesResult && (
                <p className="text-[var(--muted)]">
                  Uruchom „Run Samples”, żeby przetestować sample cases zadania.
                </p>
              )}
              {samplesResult?.results.map((caseResult) => (
                <div
                  key={caseResult.ordinal}
                  className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
                >
                  <div className="mb-2 flex gap-3 text-xs">
                    <span>Test {caseResult.ordinal}</span>
                    <span style={{ color: verdictColor(caseResult.verdict) }}>
                      {caseResult.verdict}
                    </span>
                    <span className="text-[var(--muted)]">
                      {caseResult.status}
                    </span>
                  </div>
                  <div className="text-[var(--muted)]">stdout:</div>
                  <div>{caseResult.stdout || "(empty)"}</div>
                  {caseResult.stderr && (
                    <>
                      <div className="mt-2 text-[var(--muted)]">stderr:</div>
                      <div>{caseResult.stderr}</div>
                    </>
                  )}
                  {caseResult.compileOutput && (
                    <>
                      <div className="mt-2 text-[var(--muted)]">compile:</div>
                      <div>{caseResult.compileOutput}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
