# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Vite needs to know the API base URL at build time for production.
# In Docker Compose, frontend and backend are on the same host,
# so we configure nginx to proxy /api → backend:3000.
ENV VITE_API_URL=/api
RUN npm run build

# ── Runtime stage — serve with nginx ──────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
