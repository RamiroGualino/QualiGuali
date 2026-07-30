FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY services/defects-service ./services/defects-service

RUN pnpm install --filter defects-service... --prod

WORKDIR /app/services/defects-service

EXPOSE 4004

CMD ["node", "src/server.js"]
