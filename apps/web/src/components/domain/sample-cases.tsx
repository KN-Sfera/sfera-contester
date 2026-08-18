"use client";

import { useState } from "react";
import type { ProblemTestCase } from "@sfera/shared";
import { useToast } from "@/components/ui/toast";

/**
 * Sample input and output.
 *
 * Copying gets its own button because it is one of the most frequent actions
 * on this page — dragging a mouse across multi-line input wastes seconds a
 * contest does not have.
 */
export function SampleCases({ cases }: { cases: readonly ProblemTestCase[] }) {
  if (cases.length === 0) {
    return (
      <p className="text-small text-ink-muted">
        This problem has no samples. Check your solution on your own input.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {cases.map((testCase, index) => (
        <li key={testCase.id}>
          <p className="label mb-2">Sample {index + 1}</p>
          <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
            <SampleBlock title="Input" content={testCase.input} />
            <SampleBlock title="Output" content={testCase.expectedOutput} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function SampleBlock({ title, content }: { title: string; content: string }) {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A non-HTTPS context or a denied permission. Selecting by hand still
      // works, so we say so instead of staying silent.
      show("The browser refused to copy. Select the text manually.", "error");
    }
  };

  return (
    <div className="bg-paper-sunken">
      <div className="flex items-center justify-between border-b border-rule px-3 py-1.5">
        <span className="label-micro">{title}</span>
        <button
          type="button"
          onClick={copy}
          className="text-micro uppercase tracking-[0.1em] text-ink-faint transition-colors duration-[var(--dur-fast)] hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-small leading-relaxed">
        {content}
      </pre>
    </div>
  );
}
