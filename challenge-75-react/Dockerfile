# Multi-stage build: build React client, run Express API and serve static

FROM node:18-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client ./
RUN npm run build

FROM node:18-alpine AS server
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server ./
COPY --from=client-builder /app/client/dist ../client/dist
EXPOSE 4000
CMD ["node", "index.js"]
