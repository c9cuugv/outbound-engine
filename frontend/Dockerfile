# ── Stage 1: Build ──
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN npm run build && \
    find /app/dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) \
    -exec gzip -9 -k {} \;

# ── Stage 2: Serve ──
FROM nginx:stable-alpine

# Force 1 worker — container is CPU-capped; auto detects host cores and over-provisions
RUN sed -i 's/worker_processes auto;/worker_processes 1;/' /etc/nginx/nginx.conf && \
    sed -i 's/worker_connections 1024;/worker_connections 256;/' /etc/nginx/nginx.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
