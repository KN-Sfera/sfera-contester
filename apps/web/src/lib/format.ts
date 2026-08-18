/**
 * Formatting of judge data.
 *
 * Everything a contestant reads under time pressure: run times, memory, "how
 * long ago". Numbers have to be comparable at a glance, so a fixed number of
 * decimals and a fixed unit within a column.
 */

/** Naive English plural: one item, two items. */
export function plural(count: number, one: string, many: string): string {
  return Math.abs(count) === 1 ? one : many;
}

/** Run time in seconds → "0.031 s". Judge0 reports seconds. */
export function formatTime(seconds: number | string | null): string {
  if (seconds === null || seconds === "") return "—";
  const value = typeof seconds === "string" ? Number(seconds) : seconds;
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(3)} s`;
}

/** Memory in kilobytes → "2.1 MB". Judge0 reports KB. */
export function formatMemory(kilobytes: number | null): string {
  if (kilobytes === null || !Number.isFinite(kilobytes)) return "—";
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

/** Time limit from the problem definition (seconds) → "2 s". */
export function formatLimitTime(seconds: number): string {
  return Number.isInteger(seconds) ? `${seconds} s` : `${seconds.toFixed(1)} s`;
}

/** Memory limit from the problem definition (kilobytes) → "128 MB". */
export function formatLimitMemory(kilobytes: number): string {
  const mb = kilobytes / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(0)} MB`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "3 minutes ago". Past a week we switch to a date — "14 days ago" no longer
 * tells anyone anything useful.
 */
export function formatRelative(
  value: Date | string,
  now: Date = new Date(),
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const diff = now.getTime() - date.getTime();
  if (diff < 0) return "in a moment";
  if (diff < MINUTE) return "just now";

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} ${plural(minutes, "minute", "minutes")} ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} ${plural(hours, "hour", "hours")} ago`;
  }

  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days} ${plural(days, "day", "days")} ago`;
  }

  return formatDateTime(date);
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Seconds → "01:23:45" or "23:45". The contest clock in Phase 4. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Source size in bytes → "1.2 kB". Shown next to the 64 kB limit on submit. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}
