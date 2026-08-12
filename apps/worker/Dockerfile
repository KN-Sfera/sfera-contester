FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/judge0 ./packages/judge0
COPY packages/queue ./packages/queue
COPY apps/worker ./apps/worker
# Provide stubs so npm workspaces resolve
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install \
  && npm run build -w @sfera/shared \
  && npm run build -w @sfera/db \
  && npm run build -w @sfera/judge0 \
  && npm run build -w @sfera/queue \
  && npm run build -w @sfera/worker

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/judge0 ./packages/judge0
COPY --from=build /app/packages/queue ./packages/queue
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
