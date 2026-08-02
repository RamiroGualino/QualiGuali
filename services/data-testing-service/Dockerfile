FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/data-testing-service ./services/data-testing-service

RUN pnpm install --filter data-testing-service... --prod

WORKDIR /app/services/data-testing-service

EXPOSE 4006

CMD ["node", "src/server.js"]
