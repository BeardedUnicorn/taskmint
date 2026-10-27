# syntax=docker/dockerfile:1
#
# The TaskMint web app image: the built app, served by nginx, which also
# passes /api to the TaskMint server. Build from the repository root:
#
#   docker build -f apps/web/Dockerfile .
#
# Dockerfile.dockerignore (next to this file) limits the build context to
# what the web build needs.

FROM node:24-alpine AS build
RUN corepack enable && pnpm config set store-dir /pnpm/store
WORKDIR /src
# The lock file alone fills the store, so this layer is reused until it changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch
COPY . .
# Only the web app and what it uses (not the desktop app's Tauri tooling)
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@taskmint/web..."
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
RUN pnpm --filter @taskmint/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# Rendered into /etc/nginx/conf.d at start, with TASKMINT_SERVER filled in
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
ENV TASKMINT_SERVER=http://server:3000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
