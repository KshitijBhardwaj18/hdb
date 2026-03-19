FROM node:22.16.0-slim AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY . .

RUN pnpm install

RUN pnpm db:generate

RUN pnpm build

CMD pnpm db:deploy && pnpm start