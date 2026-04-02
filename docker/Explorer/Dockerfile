# Explorer Dockerfile supports both development and production targets.
# Example (dev):  docker compose -f docker/docker-compose.explorer.yaml --profile dev up --build
# Example (prod): docker compose -f docker/docker-compose.explorer.yaml --profile prod up --build

FROM node:20-bookworm AS base
WORKDIR /workspace/docker/packages/Explorer
COPY docker/packages/Explorer/package*.json ./
RUN npm install

FROM base AS dev
COPY docker/packages/Explorer ./
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY docker/packages/Explorer ./
RUN npm run build

FROM node:20-bookworm AS runner
WORKDIR /workspace/docker/packages/Explorer
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /workspace/docker/packages/Explorer/.next ./.next
COPY --from=builder /workspace/docker/packages/Explorer/node_modules ./node_modules
COPY --from=builder /workspace/docker/packages/Explorer/package.json ./package.json
COPY --from=builder /workspace/docker/packages/Explorer/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
