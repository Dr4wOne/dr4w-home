# dr4w home hub. Build: docker compose build · Run: docker compose up -d (see docker-compose.yml)
FROM node:25-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @dr4w-home/web build

FROM node:25-slim
# avahi-utils lets the hub find a TV that changed address from the TV's own mDNS announcement.
RUN apt-get update && apt-get install -y --no-install-recommends avahi-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ENV NODE_ENV=production DR4W_HOME_CONFIG=/config/config.json
WORKDIR /app/apps/hub
CMD ["node", "src/main.ts"]
