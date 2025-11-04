# Backend Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY . .
RUN npm install --omit=dev
ENV PORT=3001
EXPOSE $PORT
CMD ["node", "server.js"]
