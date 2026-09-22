# syntax=docker/dockerfile:1

# ---- build: install everything, generate the Prisma client, compile, drop dev dependencies
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Prisma's schema engine needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Prisma reads DATABASE_URL while generating the client. This placeholder exists only
# in this stage and is never part of the final image.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: the compiled app, production dependencies, and the migrations
FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
# Uploaded PDFs are written here: mount a persistent volume on it.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
VOLUME /data/uploads
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Apply database migrations first with: npm run prisma:deploy
CMD ["node", "dist/main.js"]
