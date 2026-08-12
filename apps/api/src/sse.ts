import type { FastifyReply } from "fastify";

/** Co ile wysyłamy komentarz podtrzymujący połączenie. */
const HEARTBEAT_MS = 20_000;

export interface SseStream {
  /** Wysyła zdarzenie nazwane, np. `event: done`. */
  sendNamed: (name: string, data: unknown) => void;
  close: () => void;
}

/**
 * Opakowuje surową odpowiedź w strumień SSE.
 *
 * Heartbeat jest konieczny: proxy i load balancery zrywają połączenia bez ruchu,
 * a ocenianie długiego zadania albo spokojny fragment konkursu potrafią milczeć
 * dłużej niż ich timeout.
 */
export function openSseStream(
  reply: FastifyReply,
  onClose: () => void,
): SseStream {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Wyłącza buforowanie w nginxie — bez tego zdarzenia docierają paczkami
    // dopiero na końcu.
    "X-Accel-Buffering": "no",
  });

  let closed = false;

  const heartbeat = setInterval(() => {
    if (!closed) reply.raw.write(": keep-alive\n\n");
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    onClose();
    reply.raw.end();
  }

  // Zamknięcie karty przez użytkownika musi zwolnić subskrypcję,
  // inaczej połączenia wyciekają przy każdym odświeżeniu strony.
  reply.raw.on("close", close);

  return {
    sendNamed(name, data) {
      if (closed) return;
      reply.raw.write(`event: ${name}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close,
  };
}
