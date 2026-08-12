import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { config } from "../config.js";
import {
  resolveSession,
  toPublicUser,
  type PublicUser,
  type SessionClaims,
} from "../modules/auth/service.js";

export const SESSION_COOKIE = "sfera_session";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireRole: (role: "ADMIN") => preHandlerHookHandler;
    issueSession: (reply: FastifyReply, claims: SessionClaims) => void;
    clearSession: (reply: FastifyReply) => void;
  }
  interface FastifyRequest {
    /** Ustawiane przez requireAuth. Poza chronionymi trasami jest undefined. */
    currentUser?: PublicUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionClaims;
    user: SessionClaims;
  }
}

/**
 * Owinięte w fastify-plugin — bez tego dekoratory zostałyby zamknięte
 * w kontekście pluginu i `app.requireAuth` nie istniałoby w routach.
 */
async function plugin(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: `${config.SESSION_TTL_DAYS}d` },
  });

  app.decorateRequest("currentUser", undefined);

  app.decorate("issueSession", (reply: FastifyReply, claims: SessionClaims) => {
    reply.setCookie(SESSION_COOKIE, reply.server.jwt.sign(claims), {
      httpOnly: true,
      sameSite: "lax",
      secure: config.COOKIE_SECURE,
      path: "/",
      maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
    });
  });

  app.decorate("clearSession", (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  });

  /**
   * Ustawia `request.currentUser` albo odsyła 401. Zwraca informację, czy
   * przetwarzanie ma iść dalej — dzięki temu requireRole nie musi wywoływać
   * hooka z wnętrza hooka ani zgadywać po `reply.sent`.
   */
  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    let claims: SessionClaims;
    try {
      claims = await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "Wymagane zalogowanie" });
      return false;
    }

    // Podpis to za mało — token mógł zostać unieważniony przez wylogowanie
    // albo zmianę hasła.
    const user = await resolveSession(request.server.db, claims);
    if (!user) {
      request.server.clearSession(reply);
      await reply.code(401).send({ error: "Sesja wygasła" });
      return false;
    }

    request.currentUser = toPublicUser(user);
    return true;
  }

  app.decorate("requireAuth", (async (request, reply) => {
    await authenticate(request, reply);
  }) as preHandlerHookHandler);

  app.decorate("requireRole", (role: "ADMIN"): preHandlerHookHandler => {
    return (async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await authenticate(request, reply))) return;

      if (request.currentUser?.role !== role) {
        await reply.code(403).send({ error: "Brak uprawnień" });
      }
    }) as preHandlerHookHandler;
  });
}

export const authPlugin = fp(plugin, { name: "sfera-auth" });
