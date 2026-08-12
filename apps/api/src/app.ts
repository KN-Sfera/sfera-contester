import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { Database, DatabaseHandle } from "@sfera/db";
import {
  createBullJudgeQueue,
  createRedis,
  createRedisProgressBus,
  type JudgeProgressBus,
  type JudgeQueue,
} from "@sfera/queue";
import { config } from "./config.js";
import { createAppDatabase } from "./db.js";
import { createAppJudge0, type Judge0Client } from "./judge0.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { contestRoutes } from "./modules/contests/routes.js";
import { problemSetRoutes } from "./modules/problem-sets/routes.js";
import { problemRoutes } from "./modules/problems/routes.js";
import { runRoutes } from "./modules/runs/routes.js";
import { submissionRoutes } from "./modules/submissions/routes.js";
import { authPlugin } from "./plugins/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    judgeQueue: JudgeQueue;
    progressBus: JudgeProgressBus;
    judge0: Judge0Client;
  }
}

export interface BuildAppOptions {
  logger?: boolean;
  /**
   * Gotowe połączenie — testy integracyjne podają tu bazę z Testcontainers.
   * Bez tego app zakłada własną pulę i zamyka ją razem z sobą.
   */
  database?: DatabaseHandle;
  /** Testy podstawiają atrapę, żeby nie potrzebować Redisa do sprawdzenia HTTP. */
  queue?: JudgeQueue;
  progressBus?: JudgeProgressBus;
  /** Testy podstawiają skryptowany klient zamiast prawdziwego sandboxa. */
  judge0?: Judge0Client;
}

/**
 * Buduje instancję Fastify bez nasłuchiwania na porcie — dzięki temu testy mogą
 * uderzać w endpointy przez `app.inject()` bez podnoszenia serwera.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  const ownsDatabase = options.database === undefined;
  const database = options.database ?? createAppDatabase();
  app.decorate("db", database.db);
  if (ownsDatabase) {
    app.addHook("onClose", () => database.close());
  }

  // Połączenie do Redisa powstaje leniwie — dzięki temu app z wstrzykniętymi
  // atrapami nie łączy się nigdzie. Wcześniej wystarczyło podać samą kolejkę
  // bez szyny, żeby test po cichu otworzył prawdziwe połączenie i zawisł
  // w nieskończonych retry ioredisa.
  let redis: ReturnType<typeof createRedis> | undefined;
  const sharedRedis = () => (redis ??= createRedis(config.REDIS_URL));

  const ownsQueue = options.queue === undefined;
  const queue =
    options.queue ?? createBullJudgeQueue({ connection: sharedRedis() });

  const ownsProgressBus = options.progressBus === undefined;
  const progressBus =
    options.progressBus ??
    // Subskrypcje dostają własne połączenia — klient Redisa w trybie subscribe
    // nie przyjmuje zwykłych komend.
    createRedisProgressBus({
      publisher: sharedRedis(),
      createSubscriber: () => createRedis(config.REDIS_URL),
    });

  app.decorate("judge0", options.judge0 ?? createAppJudge0());
  app.decorate("judgeQueue", queue);
  app.decorate("progressBus", progressBus);
  app.addHook("onClose", async () => {
    if (ownsQueue) await queue.close();
    if (ownsProgressBus) await progressBus.close();
    await redis?.quit();
  });

  // credentials: true — bez tego przeglądarka nie odeśle ciasteczka sesji.
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 30, timeWindow: "1 minute" });
  // Paczki testów potrafią ważyć kilkadziesiąt MB; limit chroni przed zalaniem
  // pamięci przez przypadkowy wrzut.
  await app.register(multipart, { limits: { fileSize: 64 * 1024 * 1024 } });
  await app.register(authPlugin);

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(problemRoutes);
  await app.register(runRoutes);
  await app.register(submissionRoutes);
  await app.register(adminRoutes);
  await app.register(problemSetRoutes);
  await app.register(contestRoutes);

  return app;
}
