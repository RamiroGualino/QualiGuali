FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/projects-service ./services/projects-service

RUN pnpm install --filter projects-service... --prod

WORKDIR /app/services/projects-service

EXPOSE 4001

CMD ["node", "src/server.js"]
