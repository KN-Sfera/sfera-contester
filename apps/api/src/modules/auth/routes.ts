import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./password.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  RegistrationClosedError,
  login,
  logoutEverywhere,
  register,
  toPublicUser,
  toSessionClaims,
} from "./service.js";

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  displayName: z.string().trim().min(2).max(64),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", {
    config: {
      rateLimit: { max: 5, timeWindow: "1 hour" },
    },
    handler: async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const user = await register(app.db, parsed.data);
        app.issueSession(reply, toSessionClaims(user));
        return reply.code(201).send(toPublicUser(user));
      } catch (error) {
        if (error instanceof RegistrationClosedError) {
          return reply.code(403).send({ error: error.message });
        }
        if (error instanceof EmailTakenError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  app.post("/api/auth/login", {
    config: {
      // Tighter than the global 30/min — this is a dictionary-attack target.
      rateLimit: { max: 10, timeWindow: "15 minutes" },
    },
    handler: async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const user = await login(app.db, parsed.data);
        app.issueSession(reply, toSessionClaims(user));
        return toPublicUser(user);
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          // The same message for a wrong password and a missing account —
          // otherwise the endpoint becomes an oracle for which emails exist.
          return reply.code(401).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    app.clearSession(reply);
    return { ok: true };
  });

  app.post(
    "/api/auth/logout-all",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      await logoutEverywhere(app.db, request.currentUser!.id);
      app.clearSession(reply);
      return { ok: true };
    },
  );

  app.get(
    "/api/auth/me",
    { preHandler: app.requireAuth },
    async (request) => request.currentUser,
  );
}
