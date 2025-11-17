# Frontend Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
COPY frontend/tsconfig*.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/public ./public
COPY frontend/hero-images ./hero-images
COPY frontend/src ./src
RUN npm install && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/hero-images ./dist/hero-images
COPY frontend/docker-entrypoint.sh ./
RUN npm install -g http-server && \
    chmod +x docker-entrypoint.sh
ENV API_BASE_URL=https://apiheroescall.8363742.xyz
ENV IMAGE_BASE_URL=https://heroescall.8363742.xyz
ENV SOCKET_URL=https://apiheroescall.8363742.xyz
EXPOSE 5173
CMD ["sh", "-c", "./docker-entrypoint.sh && http-server ./dist -p 5173 -a 0.0.0.0"]
