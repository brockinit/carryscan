FROM node:20-bookworm-slim

WORKDIR /app

COPY services/ingest/package.json services/ingest/package-lock.json* /app/
RUN npm install --omit=dev=false

COPY services/ingest/ /app/
COPY db/seed/ /app/db/seed/

ENV NODE_ENV=production
CMD ["npx", "tsx", "src/main.ts"]
