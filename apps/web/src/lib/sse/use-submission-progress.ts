"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@sfera/shared";
import { eventSourceUrl } from "@/lib/api/client";
import type { JudgeEvent } from "@/lib/api/types";

/**
 * Judging progress over SSE.
 *
 * The worker publishes to Redis pub/sub, the API forwards it as a stream, and
 * here it lands in React state. The stream closes itself after `done` or
 * `failed` — the API sends the event and ends the connection.
 *
 * `EventSource` takes no headers, but the session cookie rides along with
 * `withCredentials`.
 */

export interface SubmissionProgress {
  /** How many tests the problem has. Known only after the `started` event. */
  total: number;
  /** Verdicts of successive tests, in judging order. */
  results: (Verdict | undefined)[];
  /** The final verdict — judging is still running while this is `null`. */
  verdict: Verdict | null;
  /** A judging failure (not a verdict) — a dead sandbox, for example. */
  error: string | null;
  connected: boolean;
}

const INITIAL: SubmissionProgress = {
  total: 0,
  results: [],
  verdict: null,
  error: null,
  connected: false,
};

export function useSubmissionProgress(
  submissionId: string | null,
  /** We keep the stream closed for submissions that already have a verdict. */
  enabled: boolean,
): SubmissionProgress {
  const [progress, setProgress] = useState<SubmissionProgress>(INITIAL);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!submissionId || !enabled) return;

    setProgress(INITIAL);

    const source = new EventSource(
      eventSourceUrl(`/api/submissions/${encodeURIComponent(submissionId)}/events`),
      { withCredentials: true },
    );
    sourceRef.current = source;

    source.onopen = () => {
      setProgress((current) => ({ ...current, connected: true }));
    };

    const handle = (raw: MessageEvent<string>) => {
      let event: JudgeEvent;
      try {
        event = JSON.parse(raw.data) as JudgeEvent;
      } catch {
        return;
      }

      setProgress((current) => {
        switch (event.type) {
          case "started":
            return { ...current, total: event.totalTests };
          case "test": {
            const results = [...current.results];
            // Ordinals count from 1 — that is the number a contestant sees.
            results[event.ordinal - 1] = event.verdict;
            return { ...current, total: event.totalTests, results };
          }
          case "done":
            return { ...current, verdict: event.verdict };
          case "failed":
            return { ...current, error: event.message };
        }
      });
    };

    for (const name of ["started", "test", "done", "failed"]) {
      source.addEventListener(name, handle as EventListener);
    }

    source.onerror = () => {
      // A stream closed after `done` also lands here — that is a normal
      // ending, not a failure, so we do not surface an error.
      setProgress((current) => ({ ...current, connected: false }));
      source.close();
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [submissionId, enabled]);

  return progress;
}
