FROM node:20-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web

# Unlike the backend services, this runs the Vite *dev* server (not a
# production build), so devDependencies (vite itself) are needed — no
# --prod here. See docs/RUNBOOK.md for the [DECISIÓN PENDIENTE] on serving
# a real production build (static + nginx, or similar) once there's an
# actual prod deploy target.
RUN pnpm install --filter web...

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["pnpm", "dev"]
