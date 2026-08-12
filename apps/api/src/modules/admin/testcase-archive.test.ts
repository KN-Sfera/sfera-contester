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
  it("paruje pliki .in z .out", () => {
    const cases = parseTestCaseArchive(
      zip({ "1.in": "1 2\n", "1.out": "3\n" }),
    );

    expect(cases).toEqual([
      { input: "1 2\n", expectedOutput: "3\n", isSample: true },
    ]);
  });

  it("sortuje naturalnie — 2 przed 10", () => {
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

  it("pierwszy test jest samplem, reszta ukryta", () => {
    const cases = parseTestCaseArchive(
      zip({ "1.in": "a", "1.out": "a", "2.in": "b", "2.out": "b" }),
    );

    expect(cases.map((c) => c.isSample)).toEqual([true, false]);
  });

  it("liczbę sampli da się ustawić", () => {
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

  it("akceptuje konwencję .txt/.ans", () => {
    const cases = parseTestCaseArchive(
      zip({ "01.txt": "wejscie", "01.ans": "wyjscie" }),
    );

    expect(cases).toEqual([
      { input: "wejscie", expectedOutput: "wyjscie", isSample: true },
    ]);
  });

  it("radzi sobie z testami w podkatalogu", () => {
    const cases = parseTestCaseArchive(
      zip({ "tests/1.in": "a", "tests/1.out": "b" }),
    );

    expect(cases).toHaveLength(1);
  });

  it("pomija śmieci z macOS i pliki ukryte", () => {
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

  it("odrzuca wejście bez oczekiwanego wyjścia", () => {
    expect(() =>
      parseTestCaseArchive(zip({ "1.in": "a", "1.out": "b", "2.in": "c" })),
    ).toThrow(InvalidArchiveError);
  });

  it("nazywa brakujące pliki po imieniu", () => {
    expect(() =>
      parseTestCaseArchive(zip({ "7.in": "a" })),
    ).toThrow(/7/);
  });

  it("odrzuca archiwum bez testów", () => {
    expect(() => parseTestCaseArchive(zip({ "readme.md": "nic tu nie ma" }))).toThrow(
      InvalidArchiveError,
    );
  });

  it("odrzuca dane, które nie są ZIP-em", () => {
    expect(() =>
      parseTestCaseArchive(new TextEncoder().encode("to nie jest zip")),
    ).toThrow(InvalidArchiveError);
  });
});
