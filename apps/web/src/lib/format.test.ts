import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatClock,
  formatLimitMemory,
  formatMemory,
  formatRelative,
  formatTime,
  plural,
} from "./format";

describe("plural", () => {
  it("switches on one", () => {
    expect(plural(1, "minute", "minutes")).toBe("minute");
    expect(plural(2, "minute", "minutes")).toBe("minutes");
    expect(plural(0, "minute", "minutes")).toBe("minutes");
  });
});

describe("formatTime", () => {
  it("keeps the decimals fixed so a column is comparable at a glance", () => {
    expect(formatTime(0.03)).toBe("0.030 s");
    expect(formatTime("1.5")).toBe("1.500 s");
  });

  it("renders a missing measurement as a dash, not as zero", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime("")).toBe("—");
    expect(formatTime("nonsense")).toBe("—");
  });
});

describe("formatMemory", () => {
  it("switches to megabytes above a kilobyte", () => {
    expect(formatMemory(512)).toBe("512 KB");
    expect(formatMemory(2150)).toBe("2.1 MB");
  });

  it("reports the problem limit in whole megabytes", () => {
    expect(formatLimitMemory(128000)).toBe("125 MB");
    expect(formatLimitMemory(65536)).toBe("64 MB");
  });

  it("renders a missing measurement as a dash", () => {
    expect(formatMemory(null)).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-08-12T12:00:00Z");

  it("says how long ago", () => {
    expect(formatRelative(new Date("2026-08-12T11:57:00Z"), now)).toBe("3 minutes ago");
    expect(formatRelative(new Date("2026-08-12T11:59:00Z"), now)).toBe("1 minute ago");
    expect(formatRelative(new Date("2026-08-12T09:00:00Z"), now)).toBe("3 hours ago");
    expect(formatRelative(new Date("2026-08-10T12:00:00Z"), now)).toBe("2 days ago");
  });

  it("does not label a fresh submission as '0 minutes ago'", () => {
    expect(formatRelative(new Date("2026-08-12T11:59:40Z"), now)).toBe("just now");
  });

  it("switches to a date past a week", () => {
    // "14 days ago" no longer tells anyone anything useful.
    expect(formatRelative(new Date("2026-07-01T12:00:00Z"), now)).toMatch(/2026/);
  });

  it("survives an unparseable date", () => {
    expect(formatRelative("not-a-date", now)).toBe("—");
  });
});

describe("formatClock", () => {
  it("drops the hours until there are any", () => {
    expect(formatClock(125)).toBe("02:05");
    expect(formatClock(3725)).toBe("01:02:05");
  });

  it("stops at zero once the contest is over", () => {
    expect(formatClock(-30)).toBe("00:00");
  });
});

describe("formatBytes", () => {
  it("shows the source size next to its limit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(65536)).toBe("64.0 kB");
  });
});
