# syntax=docker/dockerfile:1.7
# ---------- build ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig*.json ./
COPY packages packages
COPY apps apps
COPY plugins plugins
RUN npm ci
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:24-bookworm-slim
ARG INKARR_VERSION=dev
LABEL org.opencontainers.image.title="Inkarr" \
      org.opencontainers.image.description="Modular ebook & audiobook collection manager" \
      org.opencontainers.image.source="https://github.com/eliasthecactus/inkarr" \
      org.opencontainers.image.version="${INKARR_VERSION}"
ENV NODE_ENV=production \
    INKARR_DATA=/config \
    INKARR_PORT=8585 \
    INKARR_VERSION=${INKARR_VERSION}
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /config /books /audiobooks /downloads && chown -R node:node /config /books /audiobooks /downloads
USER node
VOLUME ["/config"]
EXPOSE 8585
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.INKARR_PORT||8585)+'/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
