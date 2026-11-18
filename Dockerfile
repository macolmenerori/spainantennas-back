FROM node:26-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN npm install -g corepack && corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY config.env ./
COPY src src
COPY .prettierrc .prettierrc
COPY .prettierignore .prettierignore
COPY eslint.config.mjs eslint.config.mjs
COPY tsconfig.json tsconfig.json
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY config.env ./
EXPOSE 8083
HEALTHCHECK --interval=120s --retries=2 --start-period=5m --timeout=30s CMD wget -q -O- http://localhost:8083/healthcheck || exit 1
CMD ["pnpm", "start"]