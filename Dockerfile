# syntax=docker/dockerfile:1

# Builder using Red Hat UBI Node.js 20
FROM registry.access.redhat.com/ubi9/nodejs-20 AS builder
WORKDIR /opt/app-root/src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npm run build

# Runtime (same base for simplicity; includes npm)
FROM registry.access.redhat.com/ubi9/nodejs-20 AS runtime
WORKDIR /opt/app-root/src
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /opt/app-root/src/dist ./dist
CMD ["node", "dist/index.js"]
