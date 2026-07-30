FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/execution-service ./services/execution-service

RUN pnpm install --filter execution-service... --prod

WORKDIR /app/services/execution-service

EXPOSE 4003

CMD ["node", "src/server.js"]
