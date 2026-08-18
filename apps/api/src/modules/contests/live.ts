import type { ContestRow, Database } from "@sfera/db";
import { getLeaderboard, type LeaderboardView } from "./service.js";

export type LeaderboardListener = (view: LeaderboardView) => void;

interface Watcher {
  timer: NodeJS.Timeout;
  listeners: Set<LeaderboardListener>;
  lastPayload: string | null;
}

export interface BroadcasterOptions {
  /** How often to recompute the ranking. */
  intervalMs?: number;
}

/**
 * Broadcasts the ranking to connected clients.
 *
 * It recomputes **once per contest and view variant**, not once per client —
 * with a hundred contestants watching the scoreboard that is one query per
 * cycle instead of a hundred. It sends only when the result actually changed, so
 * a quiet stretch of a contest generates no traffic.
 *
 * There are two variants, because an admin sees through the freeze and a
 * contestant does not.
 */
export class LeaderboardBroadcaster {
  private readonly watchers = new Map<string, Watcher>();
  private readonly intervalMs: number;

  constructor(
    private readonly db: Database,
    options: BroadcasterOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 5000;
  }

  subscribe(
    contest: ContestRow,
    options: { isAdmin: boolean },
    listener: LeaderboardListener,
  ): () => void {
    const key = `${contest.id}:${options.isAdmin ? "admin" : "public"}`;
    let watcher = this.watchers.get(key);

    if (!watcher) {
      const created: Watcher = {
        listeners: new Set(),
        lastPayload: null,
        timer: setInterval(() => {
          void this.tick(key, contest, options.isAdmin);
        }, this.intervalMs),
      };
      // Do not hold the process open just because somebody is watching the board.
      created.timer.unref?.();
      this.watchers.set(key, created);
      watcher = created;
    }

    watcher.listeners.add(listener);

    return () => {
      const current = this.watchers.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        clearInterval(current.timer);
        this.watchers.delete(key);
      }
    };
  }

  /** Forces an immediate recompute — used when a client connects. */
  async push(contest: ContestRow, options: { isAdmin: boolean }): Promise<LeaderboardView> {
    return getLeaderboard(this.db, contest, options);
  }

  private async tick(
    key: string,
    contest: ContestRow,
    isAdmin: boolean,
  ): Promise<void> {
    const watcher = this.watchers.get(key);
    if (!watcher || watcher.listeners.size === 0) return;

    try {
      const view = await getLeaderboard(this.db, contest, { isAdmin });
      const payload = JSON.stringify(view);
      if (payload === watcher.lastPayload) return;

      watcher.lastPayload = payload;
      for (const listener of watcher.listeners) {
        listener(view);
      }
    } catch {
      // A transient database error must not tear down streams — we retry next cycle.
    }
  }

  /** Stops every timer. Called when the application shuts down. */
  close(): void {
    for (const watcher of this.watchers.values()) {
      clearInterval(watcher.timer);
    }
    this.watchers.clear();
  }
}
