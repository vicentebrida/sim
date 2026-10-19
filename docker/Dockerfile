# syntax=docker/dockerfile:1
# Imagem única do SIM: API + worker + SPA (SIM_MODE=api|worker|all).

FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /repo
# O Node 25+ não traz mais o corepack: instala o pnpm na versão de `packageManager`.
COPY package.json ./
RUN npm install -g "$(node -p 'require("./package.json").packageManager')"

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@sim/api --filter=@sim/web
RUN pnpm deploy --filter=@sim/api --prod --legacy /out

FROM node:26-alpine AS runtime
ENV NODE_ENV=production SIM_MODE=all PORT=3000 SIM_WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
