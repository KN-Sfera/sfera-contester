import type { Redis } from "ioredis";
import type { JudgeProgressBus, JudgeProgressEvent } from "./types.js";

function channel(submissionId: string): string {
  return `judge:progress:${submissionId}`;
}

/**
 * Progress travels through Redis pub/sub rather than straight from the worker
 * to the client — the worker and the API are separate processes, and in Phase 5
 * they will sit on separate hosts.
 *
 * Subscribing needs its own connection: a Redis client in subscribe mode
 * accepts no ordinary commands, so it cannot be shared with the rest of the app.
 */
export function createRedisProgressBus(options: {
  publisher: Redis;
  createSubscriber: () => Redis;
}): JudgeProgressBus {
  const subscribers = new Set<Redis>();

  return {
    async publish(event: JudgeProgressEvent) {
      await options.publisher.publish(
        channel(event.submissionId),
        JSON.stringify(event),
      );
    },

    async subscribe(submissionId, listener) {
      const subscriber = options.createSubscriber();
      subscribers.add(subscriber);

      subscriber.on("message", (_channel: string, payload: string) => {
        try {
          listener(JSON.parse(payload) as JudgeProgressEvent);
        } catch {
          // A corrupted message must not kill the SSE stream.
        }
      });

      await subscriber.subscribe(channel(submissionId));

      return async () => {
        subscribers.delete(subscriber);
        await subscriber.quit();
      };
    },

    async close() {
      await Promise.all([...subscribers].map((client) => client.quit()));
      subscribers.clear();
    },
  };
}
