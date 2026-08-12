import type { ContestRow, Database } from "@sfera/db";
import { getLeaderboard, type LeaderboardView } from "./service.js";

export type LeaderboardListener = (view: LeaderboardView) => void;

interface Watcher {
  timer: NodeJS.Timeout;
  listeners: Set<LeaderboardListener>;
  lastPayload: string | null;
}

export interface BroadcasterOptions {
  /** Co ile przeliczać ranking. */
  intervalMs?: number;
}

/**
 * Rozsyła ranking do podłączonych klientów.
 *
 * Przelicza go **raz na konkurs i wariant widoku**, a nie raz na klienta —
 * przy stu zawodnikach patrzących na tablicę różnica to jedno zapytanie na cykl
 * zamiast stu. Wysyła tylko wtedy, gdy wynik faktycznie się zmienił, więc
 * spokojny fragment konkursu nie generuje ruchu.
 *
 * Warianty są dwa, bo admin widzi przez zamrożenie, a zawodnik nie.
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
      // Nie blokuj zamknięcia procesu tylko dlatego, że ktoś patrzy na tablicę.
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

  /** Wymusza natychmiastowe przeliczenie — używane przy podłączeniu klienta. */
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
      // Chwilowy błąd bazy nie może zrywać strumieni — spróbujemy za cykl.
    }
  }

  /** Zatrzymuje wszystkie zegary. Wołane przy zamykaniu aplikacji. */
  close(): void {
    for (const watcher of this.watchers.values()) {
      clearInterval(watcher.timer);
    }
    this.watchers.clear();
  }
}
