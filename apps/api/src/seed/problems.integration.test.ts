import { asc, eq } from "drizzle-orm";
import { problems, testCases } from "@sfera/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestPostgres, type TestPostgres } from "../../test/postgres.js";
import type { ProblemFile } from "./problem-files.js";
import { seedProblem } from "./problems.js";

const baseFile: ProblemFile = {
  slug: "seed-test",
  title: "A + B",
  statement: "Print the sum.",
  timeLimit: 2,
  memoryLimit: 128000,
  testCases: [
    { input: "1 2\n", expectedOutput: "3\n", isSample: true },
    { input: "5 5\n", expectedOutput: "10\n", isSample: false },
  ],
};

let postgres: TestPostgres;

beforeAll(async () => {
  postgres = await startTestPostgres();
});

afterAll(async () => {
  await postgres?.stop();
});

function loadTestCases(slug: string) {
  return postgres.handle.db
    .select({
      id: testCases.id,
      ordinal: testCases.ordinal,
      input: testCases.input,
      expectedOutput: testCases.expectedOutput,
      isSample: testCases.isSample,
    })
    .from(testCases)
    .innerJoin(problems, eq(problems.id, testCases.problemId))
    .where(eq(problems.slug, slug))
    .orderBy(asc(testCases.ordinal));
}

describe("seedProblem", () => {
  it("adds a problem as public and numbers its tests from 1", async () => {
    const report = await seedProblem(postgres.handle.db, baseFile);

    expect(report.created).toBe(true);
    expect(report.testCaseCount).toBe(2);

    const [problem] = await postgres.handle.db
      .select()
      .from(problems)
      .where(eq(problems.slug, "seed-test"));
    expect(problem!.isPublic).toBe(true);

    const cases = await loadTestCases("seed-test");
    expect(cases.map((testCase) => testCase.ordinal)).toEqual([1, 2]);
    expect(cases[0]!.isSample).toBe(true);
    expect(cases[1]!.isSample).toBe(false);
  });

  it("is idempotent — a second run does not duplicate tests", async () => {
    const report = await seedProblem(postgres.handle.db, baseFile);

    expect(report.created).toBe(false);
    const cases = await loadTestCases("seed-test");
    expect(cases).toHaveLength(2);
  });

  it("keeps test ids across a repeated seed", async () => {
    // This is why we update by ordinal instead of deleting and reinserting —
    // otherwise submission_results would lose its link on every seed.
    const before = await loadTestCases("seed-test");
    await seedProblem(postgres.handle.db, baseFile);
    const after = await loadTestCases("seed-test");

    expect(after.map((testCase) => testCase.id)).toEqual(
      before.map((testCase) => testCase.id),
    );
  });

  it("updates the contents of a changed test", async () => {
    await seedProblem(postgres.handle.db, {
      ...baseFile,
      testCases: [
        { input: "7 7\n", expectedOutput: "14\n", isSample: true },
        { input: "5 5\n", expectedOutput: "10\n", isSample: false },
      ],
    });

    const cases = await loadTestCases("seed-test");
    expect(cases[0]!.input).toBe("7 7\n");
    expect(cases[0]!.expectedOutput).toBe("14\n");
  });

  it("deletes tests that vanished from the file", async () => {
    await seedProblem(postgres.handle.db, {
      ...baseFile,
      testCases: [{ input: "1 1\n", expectedOutput: "2\n", isSample: true }],
    });

    const cases = await loadTestCases("seed-test");
    expect(cases).toHaveLength(1);
    expect(cases[0]!.ordinal).toBe(1);
  });

  it("updates a problem's metadata", async () => {
    await seedProblem(postgres.handle.db, {
      ...baseFile,
      title: "New title",
      timeLimit: 5,
    });

    const [problem] = await postgres.handle.db
      .select()
      .from(problems)
      .where(eq(problems.slug, "seed-test"));
    expect(problem!.title).toBe("New title");
    expect(problem!.timeLimit).toBe(5);
  });
});
