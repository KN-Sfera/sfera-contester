import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  problems,
  submissionResults,
  submissions,
  testCases,
  users,
} from "./schema/index.js";

let container: StartedPostgreSqlContainer;
let handle: DatabaseHandle;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16.2").start();
  await runMigrations(container.getConnectionUri());
  handle = createDatabase({ connectionString: container.getConnectionUri() });
});

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

async function insertUser(email: string) {
  const [user] = await handle.db
    .insert(users)
    .values({ email, passwordHash: "hash", displayName: "Contestant" })
    .returning();
  return user!;
}

async function insertProblem(slug: string) {
  const [problem] = await handle.db
    .insert(problems)
    .values({ slug, title: "A + B", statement: "Print the sum." })
    .returning();
  return problem!;
}

describe("migrations", () => {
  it("are idempotent — a second run breaks nothing", async () => {
    await expect(
      runMigrations(container.getConnectionUri()),
    ).resolves.toBeUndefined();
  });

  it("create every table in the schema", async () => {
    const result = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' order by table_name`,
    );
    const tables = result.rows.map((row) => row.table_name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "users",
        "problems",
        "test_cases",
        "submissions",
        "submission_results",
      ]),
    );
  });
});

describe("users", () => {
  it("assigns the default USER role and an id", async () => {
    const user = await insertUser("kowalski@example.com");

    expect(user.role).toBe("USER");
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses two accounts with the same email", async () => {
    await insertUser("duplikat@example.com");

    await expect(insertUser("duplikat@example.com")).rejects.toThrow();
  });
});

describe("test_cases", () => {
  it("refuses two tests with the same ordinal in one problem", async () => {
    const problem = await insertProblem("unikalne-ordinale");
    await handle.db.insert(testCases).values({
      problemId: problem.id,
      ordinal: 1,
      input: "1 2\n",
      expectedOutput: "3\n",
    });

    await expect(
      handle.db.insert(testCases).values({
        problemId: problem.id,
        ordinal: 1,
        input: "inne\n",
        expectedOutput: "dane\n",
      }),
    ).rejects.toThrow();
  });

  it("allows the same ordinal in a different problem", async () => {
    const first = await insertProblem("problem-one");
    const second = await insertProblem("problem-two");

    await handle.db.insert(testCases).values([
      { problemId: first.id, ordinal: 1, input: "a", expectedOutput: "a" },
      { problemId: second.id, ordinal: 1, input: "b", expectedOutput: "b" },
    ]);

    const rows = await handle.db.select().from(testCases);
    expect(rows.filter((row) => row.ordinal === 1).length).toBeGreaterThanOrEqual(2);
  });

  it("disappears along with the problem", async () => {
    const problem = await insertProblem("do-usuniecia");
    await handle.db
      .insert(testCases)
      .values({ problemId: problem.id, ordinal: 1, input: "x", expectedOutput: "x" });

    await handle.db.delete(problems).where(eq(problems.id, problem.id));

    const left = await handle.db
      .select()
      .from(testCases)
      .where(eq(testCases.problemId, problem.id));
    expect(left).toHaveLength(0);
  });
});

describe("submissions", () => {
  it("starts as QUEUED with no verdict", async () => {
    const user = await insertUser("queued@example.com");
    const problem = await insertProblem("queued-problem");

    const [submission] = await handle.db
      .insert(submissions)
      .values({
        userId: user.id,
        problemId: problem.id,
        language: "cpp",
        source: "int main(){}",
      })
      .returning();

    expect(submission!.status).toBe("QUEUED");
    expect(submission!.verdict).toBeNull();
    expect(submission!.judgedAt).toBeNull();
    expect(submission!.contestId).toBeNull();
  });

  it("deletes per-test results along with the submission", async () => {
    const user = await insertUser("kaskada@example.com");
    const problem = await insertProblem("kaskada-problem");
    const [testCase] = await handle.db
      .insert(testCases)
      .values({ problemId: problem.id, ordinal: 1, input: "1", expectedOutput: "1" })
      .returning();
    const [submission] = await handle.db
      .insert(submissions)
      .values({
        userId: user.id,
        problemId: problem.id,
        language: "python",
        source: "print(1)",
      })
      .returning();

    await handle.db.insert(submissionResults).values({
      submissionId: submission!.id,
      testCaseId: testCase!.id,
      ordinal: 1,
      verdict: "AC",
    });

    await handle.db.delete(submissions).where(eq(submissions.id, submission!.id));

    const left = await handle.db
      .select()
      .from(submissionResults)
      .where(eq(submissionResults.submissionId, submission!.id));
    expect(left).toHaveLength(0);
  });

  it("keeps a result when its test case is deleted — only the ordinal remains", async () => {
    const user = await insertUser("historia@example.com");
    const problem = await insertProblem("historia-problem");
    const [testCase] = await handle.db
      .insert(testCases)
      .values({ problemId: problem.id, ordinal: 1, input: "1", expectedOutput: "1" })
      .returning();
    const [submission] = await handle.db
      .insert(submissions)
      .values({
        userId: user.id,
        problemId: problem.id,
        language: "python",
        source: "print(1)",
      })
      .returning();
    await handle.db.insert(submissionResults).values({
      submissionId: submission!.id,
      testCaseId: testCase!.id,
      ordinal: 7,
      verdict: "WA",
    });

    await handle.db.delete(testCases).where(eq(testCases.id, testCase!.id));

    const [result] = await handle.db
      .select()
      .from(submissionResults)
      .where(eq(submissionResults.submissionId, submission!.id));
    expect(result!.testCaseId).toBeNull();
    expect(result!.ordinal).toBe(7);
    expect(result!.verdict).toBe("WA");
  });
});
