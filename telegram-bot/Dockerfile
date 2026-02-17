FROM node:20-slim AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY telegram-bot/package.json telegram-bot/

RUN npm ci --workspace=shared --workspace=telegram-bot

# Copy source
COPY shared/ shared/
COPY telegram-bot/ telegram-bot/

# Build shared first, then telegram-bot
RUN npm run build --workspace=shared
RUN npm run build --workspace=telegram-bot

# --- Production stage ---
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY telegram-bot/package.json telegram-bot/

RUN npm ci --workspace=shared --workspace=telegram-bot --omit=dev

COPY --from=builder /app/shared/dist/ shared/dist/
COPY --from=builder /app/telegram-bot/dist/ telegram-bot/dist/

EXPOSE 3001

CMD ["node", "telegram-bot/dist/index.js"]
