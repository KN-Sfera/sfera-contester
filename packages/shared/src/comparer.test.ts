import { describe, expect, it } from "vitest";
import { compareOutputs, normalizeOutput } from "./index.js";

describe("normalizeOutput", () => {
  it("turns CRLF and a lone CR into LF", () => {
    expect(normalizeOutput("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("trims trailing whitespace on every line", () => {
    expect(normalizeOutput("a   \nb\t\nc")).toBe("a\nb\nc");
  });

  it("leaves leading indentation alone", () => {
    expect(normalizeOutput("  a\n    b")).toBe("  a\n    b");
  });

  it("trims blank lines at the end", () => {
    expect(normalizeOutput("3\n\n\n")).toBe("3");
  });

  it("keeps blank lines in the middle", () => {
    expect(normalizeOutput("a\n\nb")).toBe("a\n\nb");
  });

  it("leaves an empty string empty", () => {
    expect(normalizeOutput("")).toBe("");
  });
});

describe("compareOutputs", () => {
  it("accepts a difference in line endings alone", () => {
    expect(compareOutputs("3\n", "3")).toBe(true);
    expect(compareOutputs("3\r\n", "3\n")).toBe(true);
  });

  it("accepts extra spaces at the end of a line", () => {
    expect(compareOutputs("3 \n", "3\n")).toBe(true);
  });

  it("rejects a difference in content", () => {
    expect(compareOutputs("4\n", "3\n")).toBe(false);
  });

  it("rejects a difference in indentation", () => {
    expect(compareOutputs(" 3\n", "3\n")).toBe(false);
  });

  it("rejects a missing line", () => {
    expect(compareOutputs("1\n2\n", "1\n2\n3\n")).toBe(false);
  });

  it("treats empty output and pure whitespace as equal", () => {
    expect(compareOutputs("\n\n", "")).toBe(true);
  });
});
