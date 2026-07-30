FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/reports-service ./services/reports-service

RUN pnpm install --filter reports-service... --prod

WORKDIR /app/services/reports-service

EXPOSE 4005

CMD ["node", "src/server.js"]
