# Dockerfile for Grok Engine
FROM oven/bun:1.2-alpine AS base

WORKDIR /app

COPY package.json bun.lock* pnpm-workspace.yaml* ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/cli/package.json ./packages/cli/
COPY apps/cloud-server/package.json ./apps/cloud-server/

RUN bun install --frozen-lockfile

COPY . .

RUN cd packages/engine && bun run build
RUN cd apps/cloud-server && bun run build

EXPOSE 8080

CMD ["bun", "run", "apps/cloud-server/dist/index.js"]
