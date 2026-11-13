FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/vencord-plugin/package.json packages/vencord-plugin/package.json
RUN npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile
COPY packages/vencord-plugin/ packages/vencord-plugin/
COPY packages/timeline-service/ packages/timeline-service/
RUN pnpm --filter @server-events-timeline/vencord-plugin exec node scripts/build-web.mjs

FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build /app/packages/vencord-plugin/.output/site/ ./
COPY packages/timeline-service/server.mjs ./
ENV TIMELINE_DATA=/data
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
