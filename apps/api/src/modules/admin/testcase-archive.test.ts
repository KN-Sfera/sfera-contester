import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  InvalidArchiveError,
  parseTestCaseArchive,
} from "./testcase-archive.js";

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, strToU8(content)]),
    ),
  );
}

describe("parseTestCaseArchive", () => {
  it("pairs .in files with their .out", () => {
    const cases = parseTestCaseArchive(
      zip({ "1.in": "1 2\n", "1.out": "3\n" }),
    );

    expect(cases).toEqual([
      { input: "1 2\n", expectedOutput: "3\n", isSample: true },
    ]);
  });

  it("sorts naturally — 2 before 10", () => {
    const cases = parseTestCaseArchive(
      zip({
        "10.in": "dziesiec",
        "10.out": "10",
        "2.in": "dwa",
        "2.out": "2",
        "1.in": "jeden",
        "1.out": "1",
      }),
    );

    expect(cases.map((c) => c.expectedOutput)).toEqual(["1", "2", "10"]);
  });

  it("makes the first test a sample and hides the rest", () => {
    const cases = parseTestCaseArchive(
      zip({ "1.in": "a", "1.out": "a", "2.in": "b", "2.out": "b" }),
    );

    expect(cases.map((c) => c.isSample)).toEqual([true, false]);
  });

  it("takes the sample count as an option", () => {
    const cases = parseTestCaseArchive(
      zip({
        "1.in": "a",
        "1.out": "a",
        "2.in": "b",
        "2.out": "b",
        "3.in": "c",
        "3.out": "c",
      }),
      { sampleCount: 2 },
    );

    expect(cases.map((c) => c.isSample)).toEqual([true, true, false]);
  });

  it("accepts the .txt/.ans convention", () => {
    const cases = parseTestCaseArchive(
      zip({ "01.txt": "wejscie", "01.ans": "wyjscie" }),
    );

    expect(cases).toEqual([
      { input: "wejscie", expectedOutput: "wyjscie", isSample: true },
    ]);
  });

  it("copes with tests inside a subdirectory", () => {
    const cases = parseTestCaseArchive(
      zip({ "tests/1.in": "a", "tests/1.out": "b" }),
    );

    expect(cases).toHaveLength(1);
  });

  it("skips macOS clutter and hidden files", () => {
    const cases = parseTestCaseArchive(
      zip({
        "1.in": "a",
        "1.out": "b",
        "__MACOSX/._1.in": "smiec",
        ".DS_Store": "smiec",
      }),
    );

    expect(cases).toHaveLength(1);
  });

  it("rejects an input with no expected output", () => {
    expect(() =>
      parseTestCaseArchive(zip({ "1.in": "a", "1.out": "b", "2.in": "c" })),
    ).toThrow(InvalidArchiveError);
  });

  it("names the missing files", () => {
    expect(() =>
      parseTestCaseArchive(zip({ "7.in": "a" })),
    ).toThrow(/7/);
  });

  it("rejects an archive with no tests", () => {
    expect(() => parseTestCaseArchive(zip({ "readme.md": "nothing to see here" }))).toThrow(
      InvalidArchiveError,
    );
  });

  it("rejects data that is not a ZIP", () => {
    expect(() =>
      parseTestCaseArchive(new TextEncoder().encode("this is not a zip")),
    ).toThrow(InvalidArchiveError);
  });
});
