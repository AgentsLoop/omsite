FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini git
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/app/data
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node config ./config
RUN install -d -o node -g node /app/data
USER node
EXPOSE 8787
VOLUME ["/app/data"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.mjs"]
