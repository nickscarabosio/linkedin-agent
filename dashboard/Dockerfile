FROM node:20-slim AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/

RUN npm ci --workspace=dashboard

# Copy source
COPY dashboard/ dashboard/

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=dashboard

# --- Production stage ---
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/

RUN npm ci --workspace=dashboard --omit=dev

COPY --from=builder /app/dashboard/.next/ dashboard/.next/
COPY --from=builder /app/dashboard/public/ dashboard/public/

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=dashboard"]
