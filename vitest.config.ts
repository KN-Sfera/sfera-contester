import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testy importują @sfera/shared prosto ze źródeł, żeby `npm test` nie wymagał
// wcześniejszego `npm run build:shared`.
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

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          root: "packages/shared",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // Te wymagają Dockera — lecą w vitest.integration.config.ts.
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "judge0",
          root: "packages/judge0",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "api",
          root: "apps/api",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // Te wymagają Dockera — lecą w vitest.integration.config.ts.
          exclude: ["src/**/*.integration.test.ts"],
          setupFiles: ["./test/setup-env.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "worker",
          root: "apps/worker",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
    ],
  },
});
