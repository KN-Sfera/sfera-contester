import type { FastifyReply } from "fastify";

/** How often we send a comment to keep the connection alive. */
const HEARTBEAT_MS = 20_000;

export interface SseStream {
  /** Sends a named event, e.g. `event: done`. */
  sendNamed: (name: string, data: unknown) => void;
  close: () => void;
}

/**
 * Wraps a raw reply in an SSE stream.
 *
 * The heartbeat is necessary: proxies and load balancers drop idle connections,
 * and judging a long problem — or a quiet stretch of a contest — can stay silent
 * for longer than their timeout.
 */
export function openSseStream(
  reply: FastifyReply,
  onClose: () => void,
): SseStream {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Disables buffering in nginx — without it events arrive in a batch at the
    // very end.
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

  // Closing the tab has to release the subscription, otherwise connections
  // leak on every page refresh.
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
