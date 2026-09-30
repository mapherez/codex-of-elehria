FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run check && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 CONTENT_DIR=/data/content STATE_DIR=/data/state
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force
COPY --from=build /app/build/server ./build/server
COPY config ./config
USER node
EXPOSE 3000
ENTRYPOINT ["node", "build/server/main.js"]

FROM runtime AS public
COPY --from=build /app/build/public ./build/public
CMD ["public"]

FROM runtime AS admin
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/build/admin ./build/admin
USER node
CMD ["admin"]
