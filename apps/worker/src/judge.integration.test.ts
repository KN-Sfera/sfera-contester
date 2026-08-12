import { eq } from "drizzle-orm";
import {
  problems,
  submissionResults,
  submissions,
  testCases,
  users,
  type Database,
} from "@sfera/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFakeJudge0,
  createRecordingProgressBus,
} from "../test/fakes.js";
import { startTestPostgres, type TestPostgres } from "../test/postgres.js";
import { judgeSubmission, SubmissionNotFoundError } from "./judge.js";

let postgres: TestPostgres;
let db: Database;
let userId: string;
let problemId: string;

beforeAll(async () => {
  postgres = await startTestPostgres();
  db = postgres.handle.db;

  const [user] = await db
    .insert(users)
    .values({
      email: "worker@example.com",
      passwordHash: "hash",
      displayName: "Worker",
    })
    .returning();
  userId = user!.id;

  const [problem] = await db
    .insert(problems)
    .values({
      slug: "worker-problem",
      title: "A + B",
      statement: "Wypisz sumę.",
      timeLimit: 2,
      memoryLimit: 128000,
      isPublic: true,
    })
    .returning();
  problemId = problem!.id;

  await db.insert(testCases).values([
    { problemId, ordinal: 1, input: "1 2\n", expectedOutput: "3\n", isSample: true },
    { problemId, ordinal: 2, input: "5 5\n", expectedOutput: "10\n" },
    { problemId, ordinal: 3, input: "9 9\n", expectedOutput: "18\n" },
  ]);
});

afterAll(async () => {
  await postgres?.stop();
});

async function newSubmission(): Promise<string> {
  const [submission] = await db
    .insert(submissions)
    .values({ userId, problemId, language: "python", source: "print(3)" })
    .returning({ id: submissions.id });
  return submission!.id;
}

function loadSubmission(id: string) {
  return db
    .select()
    .from(submissions)
    .where(eq(submissions.id, id))
    .then((rows) => rows[0]!);
}

function loadResults(id: string) {
  return db
    .select()
    .from(submissionResults)
    .where(eq(submissionResults.submissionId, id));
}

describe("judgeSubmission", () => {
  it("przy komplecie AC zapisuje wynik każdego testu", async () => {
    const id = await newSubmission();
    const judge0 = createFakeJudge0(["AC", "AC", "AC"]);
    const progress = createRecordingProgressBus();

    await judgeSubmission({ db, judge0, progress }, id);

    const submission = await loadSubmission(id);
    expect(submission.status).toBe("DONE");
    expect(submission.verdict).toBe("AC");
    expect(submission.failedTestOrdinal).toBeNull();
    expect(submission.judgedAt).not.toBeNull();
    expect(await loadResults(id)).toHaveLength(3);
  });

  it("przerywa na pierwszym błędzie i nie odpala dalszych testów", async () => {
    const id = await newSubmission();
    const judge0 = createFakeJudge0(["AC", "WA", "AC"]);
    const progress = createRecordingProgressBus();

    await judgeSubmission({ db, judge0, progress }, id);

    // Trzeci test nie poszedł do Judge0 — to jest ta oszczędność, o którą chodzi.
    expect(judge0.calls).toHaveLength(2);

    const submission = await loadSubmission(id);
    expect(submission.verdict).toBe("WA");
    expect(submission.failedTestOrdinal).toBe(2);
    expect(await loadResults(id)).toHaveLength(2);
  });

  it("przekazuje limity zadania do Judge0", async () => {
    const id = await newSubmission();
    const judge0 = createFakeJudge0(["AC", "AC", "AC"]);

    await judgeSubmission(
      { db, judge0, progress: createRecordingProgressBus() },
      id,
    );

    expect(judge0.calls[0]).toMatchObject({
      cpuTimeLimit: 2,
      memoryLimit: 128000,
      stdin: "1 2\n",
      expectedStdout: "3\n",
    });
  });

  it("publikuje postęp: start, każdy test, koniec", async () => {
    const id = await newSubmission();
    const progress = createRecordingProgressBus();

    await judgeSubmission(
      { db, judge0: createFakeJudge0(["AC", "TLE"]), progress },
      id,
    );

    expect(progress.events).toEqual([
      { type: "started", submissionId: id, totalTests: 3 },
      { type: "test", submissionId: id, ordinal: 1, totalTests: 3, verdict: "AC" },
      { type: "test", submissionId: id, ordinal: 2, totalTests: 3, verdict: "TLE" },
      { type: "done", submissionId: id, verdict: "TLE", failedTestOrdinal: 2 },
    ]);
  });

  it("zapisuje najgorszy czas i pamięć", async () => {
    const id = await newSubmission();
    const judge0 = createFakeJudge0([
      { verdict: "AC", status: "AC", stdout: "", stderr: "", compileOutput: "", time: "0.100", memory: 2048, exitCode: 0, message: null },
      { verdict: "AC", status: "AC", stdout: "", stderr: "", compileOutput: "", time: "0.700", memory: 1024, exitCode: 0, message: null },
      { verdict: "AC", status: "AC", stdout: "", stderr: "", compileOutput: "", time: "0.300", memory: 4096, exitCode: 0, message: null },
    ]);

    await judgeSubmission(
      { db, judge0, progress: createRecordingProgressBus() },
      id,
    );

    const submission = await loadSubmission(id);
    expect(submission.maxTime).toBeCloseTo(0.7);
    expect(submission.maxMemory).toBe(4096);
  });

  it("ponowne ocenianie nadpisuje poprzednie wyniki", async () => {
    const id = await newSubmission();

    await judgeSubmission(
      { db, judge0: createFakeJudge0(["WA"]), progress: createRecordingProgressBus() },
      id,
    );
    expect(await loadResults(id)).toHaveLength(1);

    await judgeSubmission(
      {
        db,
        judge0: createFakeJudge0(["AC", "AC", "AC"]),
        progress: createRecordingProgressBus(),
      },
      id,
    );

    const results = await loadResults(id);
    expect(results).toHaveLength(3);
    expect((await loadSubmission(id)).verdict).toBe("AC");
  });

  it("nieistniejący submit rzuca błędem nienadającym się do ponowienia", async () => {
    await expect(
      judgeSubmission(
        {
          db,
          judge0: createFakeJudge0([]),
          progress: createRecordingProgressBus(),
        },
        "00000000-0000-0000-0000-000000000000",
      ),
    ).rejects.toThrow(SubmissionNotFoundError);
  });

  it("awaria Judge0 idzie w górę, żeby BullMQ mogło ponowić", async () => {
    const id = await newSubmission();
    const judge0 = createFakeJudge0([]);
    judge0.execute = async () => {
      throw new Error("Cannot reach Judge0");
    };

    await expect(
      judgeSubmission({ db, judge0, progress: createRecordingProgressBus() }, id),
    ).rejects.toThrow("Cannot reach Judge0");

    // Submit zostaje w RUNNING — o oznaczeniu FAILED decyduje worker po
    // wyczerpaniu ponowień, nie pojedyncza nieudana próba.
    expect((await loadSubmission(id)).status).toBe("RUNNING");
  });
});
