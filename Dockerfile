# ---- build the React client ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- build the API ----
FROM node:20-alpine AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- runtime: one container serves API + static client ----
FROM node:20-alpine
ENV NODE_ENV=production SERVE_CLIENT_DIR=/app/client-dist UPLOAD_DIR=/app/uploads PORT=4000
WORKDIR /app
COPY --from=server /app/server/node_modules ./server/node_modules
COPY --from=server /app/server/dist ./server/dist
COPY --from=server /app/server/package.json ./server/
COPY --from=client /app/client/dist ./client-dist
COPY database ./database
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
