import { describe, expect, it } from "vitest";
import { compareOutputs, normalizeOutput } from "./index.js";

describe("normalizeOutput", () => {
  it("zamienia CRLF i samotny CR na LF", () => {
    expect(normalizeOutput("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("ucina białe znaki na końcu każdej linii", () => {
    expect(normalizeOutput("a   \nb\t\nc")).toBe("a\nb\nc");
  });

  it("nie rusza wcięć na początku linii", () => {
    expect(normalizeOutput("  a\n    b")).toBe("  a\n    b");
  });

  it("ucina puste linie na końcu", () => {
    expect(normalizeOutput("3\n\n\n")).toBe("3");
  });

  it("zachowuje puste linie w środku", () => {
    expect(normalizeOutput("a\n\nb")).toBe("a\n\nb");
  });

  it("pusty string zostaje pusty", () => {
    expect(normalizeOutput("")).toBe("");
  });
});

describe("compareOutputs", () => {
  it("akceptuje różnicę tylko w znaku końca linii", () => {
    expect(compareOutputs("3\n", "3")).toBe(true);
    expect(compareOutputs("3\r\n", "3\n")).toBe(true);
  });

  it("akceptuje nadmiarowe spacje na końcu linii", () => {
    expect(compareOutputs("3 \n", "3\n")).toBe(true);
  });

  it("odrzuca różnicę w treści", () => {
    expect(compareOutputs("4\n", "3\n")).toBe(false);
  });

  it("odrzuca różnicę we wcięciu", () => {
    expect(compareOutputs(" 3\n", "3\n")).toBe(false);
  });

  it("odrzuca brakującą linię", () => {
    expect(compareOutputs("1\n2\n", "1\n2\n3\n")).toBe(false);
  });

  it("traktuje pusty output i same białe znaki jako równe", () => {
    expect(compareOutputs("\n\n", "")).toBe(true);
  });
});
