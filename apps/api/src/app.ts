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
   * A ready-made connection — integration tests pass a Testcontainers database
   * here. Without it the app opens its own pool and closes it with itself.
   */
  database?: DatabaseHandle;
  /** Tests substitute a fake so that checking HTTP does not require Redis. */
  queue?: JudgeQueue;
  progressBus?: JudgeProgressBus;
  /** Tests substitute a scripted client instead of the real sandbox. */
  judge0?: Judge0Client;
}

/**
 * Builds a Fastify instance without listening on a port — that lets tests hit
 * the endpoints through `app.inject()` without starting a server.
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

  // The Redis connection is created lazily, so an app with injected fakes
  // connects to nothing. Previously, passing only the queue without the bus was
  // enough for a test to quietly open a real connection and hang in ioredis's
  // infinite retries.
  let redis: ReturnType<typeof createRedis> | undefined;
  const sharedRedis = () => (redis ??= createRedis(config.REDIS_URL));

  const ownsQueue = options.queue === undefined;
  const queue =
    options.queue ?? createBullJudgeQueue({ connection: sharedRedis() });

  const ownsProgressBus = options.progressBus === undefined;
  const progressBus =
    options.progressBus ??
    // Subscriptions get their own connections — a Redis client in subscribe
    // mode accepts no ordinary commands.
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

  // credentials: true — without it the browser will not send the session cookie.
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 30, timeWindow: "1 minute" });
  // Test archives can run to tens of megabytes; the limit protects memory from
  // an accidental upload.
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
