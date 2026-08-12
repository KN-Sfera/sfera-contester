import type { Redis } from "ioredis";
import type { JudgeProgressBus, JudgeProgressEvent } from "./types.js";

function channel(submissionId: string): string {
  return `judge:progress:${submissionId}`;
}

/**
 * Postęp leci przez pub/sub Redisa, a nie bezpośrednio z workera do klienta —
 * worker i API to osobne procesy, a w Fazie 5 będą na osobnych hostach.
 *
 * Subskrypcja wymaga osobnego połączenia: klient Redisa w trybie subscribe nie
 * przyjmuje zwykłych komend, więc nie da się współdzielić go z resztą aplikacji.
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
          // Uszkodzona wiadomość nie może zabić strumienia SSE.
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
