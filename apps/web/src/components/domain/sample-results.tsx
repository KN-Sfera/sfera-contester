import type { RunSamplesResult } from "@sfera/shared";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { formatMemory, formatTime } from "@/lib/format";
import { verdictMeta } from "@/lib/verdict";

/**
 * The result of a run against the samples.
 *
 * Unlike a submission, this shows the program's full output — these tests are
 * public, so there is nothing to protect, and the contestant needs to see what
 * was actually printed.
 */
export function SampleResults({ result }: { result: RunSamplesResult }) {
  const meta = verdictMeta(result.verdict);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-rule pb-2">
        <span className="label">Samples</span>
        <VerdictBadge verdict={result.verdict} />
      </div>

      {result.results.map((testCase) => (
        <div key={testCase.ordinal} className="border border-rule">
          <div className="flex items-center justify-between border-b border-rule px-3 py-1.5">
            <span className="label-micro">Test {testCase.ordinal}</span>
            <span className="flex items-center gap-3">
              <span className="text-micro text-ink-faint">
                {formatTime(testCase.time)} · {formatMemory(testCase.memory)}
              </span>
              <VerdictBadge verdict={testCase.verdict} />
            </span>
          </div>

          {testCase.compileOutput ? (
            <Output label="Compiler" content={testCase.compileOutput} />
          ) : (
            <>
              <Output label="Your output" content={testCase.stdout} />
              {testCase.stderr && <Output label="Errors" content={testCase.stderr} />}
            </>
          )}
        </div>
      ))}

      {result.verdict !== "AC" && (
        <p className="text-small text-ink-muted">
          {meta.description} Samples are not the full test set — passing them
          does not guarantee an accepted submission.
        </p>
      )}
    </div>
  );
}

function Output({ label, content }: { label: string; content: string }) {
  return (
    <div className="border-t border-rule first:border-t-0">
      <p className="label-micro px-3 pt-2">{label}</p>
      <pre className="max-h-40 overflow-auto px-3 pb-2.5 pt-1 text-small leading-relaxed whitespace-pre-wrap">
        {content || "—"}
      </pre>
    </div>
  );
}
