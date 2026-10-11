FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
# The build only needs a syntactically valid URL to generate Prisma Client;
# it never connects to PostgreSQL and this placeholder is not copied to runtime.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
RUN npm ci --omit=dev && npx prisma generate

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./prisma.config.ts
COPY --chown=node:node src ./src
USER node
EXPOSE 5000
CMD ["node", "src/server.js"]
