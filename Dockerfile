FROM node:20-alpine AS base
WORKDIR /app

FROM base AS backend-deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

FROM base AS frontend-build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

FROM base AS backend
COPY backend/ ./backend/
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
WORKDIR /app/backend
RUN npx prisma generate

EXPOSE 4000
CMD ["node", "src/server.js"]
