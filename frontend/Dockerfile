# Frontend Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY public ./public
COPY hero-images ./public/hero-images
COPY src ./src
RUN npm install && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN npm install -g http-server && \
    chmod +x docker-entrypoint.sh
ENV API_BASE_URL=https://apiheroescall.8363742.xyz
ENV IMAGE_BASE_URL=https://heroescall.8363742.xyz
ENV SOCKET_URL=https://apiheroescall.8363742.xyz
EXPOSE 5173
CMD ["sh", "-c", "./docker-entrypoint.sh && http-server ./dist -p 5173 -a 0.0.0.0"]
