import type { FastifyInstance } from "fastify";
import { getPublicProblem, listProblems } from "./service.js";

export async function problemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/problems", async () => listProblems(app.db));

  app.get<{ Params: { slug: string } }>(
    "/api/problems/:slug",
    async (request, reply) => {
      const problem = await getPublicProblem(app.db, request.params.slug);
      if (!problem) {
        return reply.code(404).send({ error: "Problem not found" });
      }
      return problem;
    },
  );
}
