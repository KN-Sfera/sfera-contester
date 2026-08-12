import { createDatabase, runMigrations } from "@sfera/db";
import { readProblemFiles, resolveProblemsDir } from "../seed/problem-files.js";
import { seedProblems } from "../seed/problems.js";
import { loadOpsEnv } from "./ops-env.js";

async function main(): Promise<void> {
  const env = loadOpsEnv();

  const dir = resolveProblemsDir(env.PROBLEMS_DIR);
  const files = readProblemFiles(dir);
  console.log(`Znaleziono ${files.length} zadań w ${dir}`);

  await runMigrations(env.DATABASE_URL);

  const handle = createDatabase({ connectionString: env.DATABASE_URL });
  try {
    const reports = await seedProblems(handle.db, files);
    for (const report of reports) {
      const action = report.created ? "dodane" : "zaktualizowane";
      console.log(`  ${report.slug}: ${action}, ${report.testCaseCount} testów`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
