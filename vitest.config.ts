import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests import @sfera/shared straight from source, so `npm test` does not
// require a prior `npm run build:shared`.
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
          // These need Docker — they run from vitest.integration.config.ts.
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
          // These need Docker — they run from vitest.integration.config.ts.
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
      {
        // JSX is transformed by the esbuild built into Vite. `@vitejs/plugin-react`
        // would only provide Fast Refresh, which tests never use, and would
        // force Vite 8 while Vitest sits on 7.
        esbuild: { jsx: "automatic" },
        resolve: {
          alias: {
            ...alias,
            "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
          },
        },
        test: {
          name: "web",
          root: "apps/web",
          // jsdom, because we test components and hooks, not just functions.
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
