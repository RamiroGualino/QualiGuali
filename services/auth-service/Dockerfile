FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/auth-service ./services/auth-service

RUN pnpm install --filter auth-service... --prod

WORKDIR /app/services/auth-service

EXPOSE 4000

CMD ["node", "src/server.js"]
