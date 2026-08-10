FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY data ./data
# Provide stubs so npm workspaces resolve
COPY apps/web/package.json ./apps/web/package.json
RUN npm install && npm run build -w @sfera/shared && npm run build -w @sfera/api

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PROBLEMS_DIR=/app/data/problems
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/data ./data
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
