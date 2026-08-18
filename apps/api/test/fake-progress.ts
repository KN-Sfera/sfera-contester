import type { JudgeProgressBus, JudgeProgressEvent } from "@sfera/queue";

export interface FakeProgressBus extends JudgeProgressBus {
  /** Active subscription count — proves the streams clean up after themselves. */
  subscriberCount: () => number;
}

/**
 * An in-memory progress bus. It lets a test drive the events without Redis.
 */
export function createFakeProgressBus(): FakeProgressBus {
  const listeners = new Map<string, Set<(event: JudgeProgressEvent) => void>>();

  return {
    subscriberCount: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),

    async publish(event) {
      for (const listener of listeners.get(event.submissionId) ?? []) {
        listener(event);
      }
    },

    async subscribe(submissionId, listener) {
      const set = listeners.get(submissionId) ?? new Set();
      set.add(listener);
      listeners.set(submissionId, set);

      return async () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(submissionId);
      };
    },

    async close() {
      listeners.clear();
    },
  };
}
