import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The integration tests stand up a real Postgres through Testcontainers, so
// they need a running Docker and are kept out of `npm test`.

const alias = {
  "@sfera/shared": fileURLToPath(
    new URL("./packages/shared/src/index.ts", import.meta.url),
  ),
  "@sfera/db": fileURLToPath(
    new URL("./packages/db/src/index.ts", import.meta.url),
  ),
  "@sfera/judge0": fileURLToPath(
    new URL("./packages/judge0/src/index.ts", import.meta.url),
  ),
  "@sfera/queue": fileURLToPath(
    new URL("./packages/queue/src/index.ts", import.meta.url),
  ),
};

// Projects do not inherit the top-level `test` options, so the timeouts have to
// be set on each of them. The default 10 s is not enough to boot a container.
const timeouts = {
  testTimeout: 60_000,
  hookTimeout: 180_000,
};

// Ryuk is the Testcontainers reaper, pulled from Docker Hub on every start. On
// machines without Hub access it blocks the whole suite. We close containers
// explicitly in `afterAll` anyway, so the only thing lost is cleanup after the
// test process is hard-killed.
const env = { TESTCONTAINERS_RYUK_DISABLED: "true" };

export default defineConfig({
  test: {
    // Every file stands up its own container — we do not run them in parallel.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "db",
          root: "packages/db",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          ...timeouts,
          env,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "api",
          root: "apps/api",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./test/setup-env.ts"],
          ...timeouts,
          env,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "worker",
          root: "apps/worker",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          ...timeouts,
          env,
        },
      },
    ],
  },
});
