import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testy integracyjne stawiają prawdziwego Postgresa przez Testcontainers, więc
// wymagają działającego Dockera i są trzymane poza `npm test`.

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

// Projekty nie dziedziczą opcji `test` z poziomu głównego, więc limity czasu
// muszą być w każdym z osobna. Domyślne 10 s nie wystarcza na start kontenera.
const timeouts = {
  testTimeout: 60_000,
  hookTimeout: 180_000,
};

// Ryuk to kontener-sprzątacz Testcontainers, ściągany z Docker Huba przy każdym
// starcie. Na maszynach bez dostępu do Huba blokuje cały zestaw. Kontenery i tak
// zamykamy jawnie w `afterAll`, więc nic nie tracimy poza sprzątaniem po twardym
// ubiciu procesu testów.
const env = { TESTCONTAINERS_RYUK_DISABLED: "true" };

export default defineConfig({
  test: {
    // Każdy plik stawia własny kontener — nie odpalamy ich naraz.
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
