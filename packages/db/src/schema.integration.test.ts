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
    .values({ email, passwordHash: "hash", displayName: "Zawodnik" })
    .returning();
  return user!;
}

async function insertProblem(slug: string) {
  const [problem] = await handle.db
    .insert(problems)
    .values({ slug, title: "A + B", statement: "Wypisz sumę." })
    .returning();
  return problem!;
}

describe("migracje", () => {
  it("są idempotentne — drugie wywołanie nic nie psuje", async () => {
    await expect(
      runMigrations(container.getConnectionUri()),
    ).resolves.toBeUndefined();
  });

  it("tworzą wszystkie tabele schematu", async () => {
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
  it("nadaje domyślną rolę USER i id", async () => {
    const user = await insertUser("kowalski@example.com");

    expect(user.role).toBe("USER");
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nie pozwala na dwa konta z tym samym adresem", async () => {
    await insertUser("duplikat@example.com");

    await expect(insertUser("duplikat@example.com")).rejects.toThrow();
  });
});

describe("test_cases", () => {
  it("nie pozwala na dwa testy o tym samym numerze w zadaniu", async () => {
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

  it("ten sam numer w innym zadaniu jest w porządku", async () => {
    const first = await insertProblem("zadanie-jeden");
    const second = await insertProblem("zadanie-dwa");

    await handle.db.insert(testCases).values([
      { problemId: first.id, ordinal: 1, input: "a", expectedOutput: "a" },
      { problemId: second.id, ordinal: 1, input: "b", expectedOutput: "b" },
    ]);

    const rows = await handle.db.select().from(testCases);
    expect(rows.filter((row) => row.ordinal === 1).length).toBeGreaterThanOrEqual(2);
  });

  it("znika razem z zadaniem", async () => {
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
  it("startuje jako QUEUED bez werdyktu", async () => {
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

  it("wyniki per test znikają razem z submitem", async () => {
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

  it("wynik przeżywa usunięcie testu — zostaje sam ordinal", async () => {
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
