# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Production deps plus Prisma CLI for migrate deploy at container start.
RUN npm ci --omit=dev && \
    npm install prisma@7.9.1 --no-save && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["docker-entrypoint.sh"]
