FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/qa-core-service ./services/qa-core-service

RUN pnpm install --filter qa-core-service... --prod

WORKDIR /app/services/qa-core-service

EXPOSE 4002

CMD ["node", "src/server.js"]
