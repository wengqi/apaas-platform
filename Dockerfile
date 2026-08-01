# ============================================================
# aPaaS Dockerfile — 多阶段构建
# Targets: gateway, studio, runtime-ui
# 用法: docker build --target <target> -t apaas-<target> .
# ============================================================

# ---- Base: Node.js 20 + pnpm ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /app

# ---- Deps: 安装全部依赖（利用 Docker 层缓存）----
FROM base AS deps
RUN apk add --no-cache python3 make g++   # bcrypt 原生编译兜底
# 先复制所有 package.json + workspace 配置（依赖不变时命中缓存）
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/gateway/package.json apps/gateway/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/studio/package.json packages/studio/
COPY packages/runtime-ui/package.json packages/runtime-ui/
COPY packages/studio/features/process/simplified/package.json \
     packages/studio/features/process/simplified/
RUN pnpm install --frozen-lockfile

# ---- Builder: 构建全部包 ----
FROM deps AS builder
COPY . .
# 生成 Prisma Client
RUN pnpm --filter @apaas/db run generate
# Turbo 按依赖顺序构建（shared → db → gateway / studio / runtime-ui）
RUN pnpm build

# ============== Gateway 运行时 ==============
FROM base AS gateway
ENV NODE_ENV=production
# 复制构建产物 + 依赖（含 pnpm 符号链接结构、Prisma 生成客户端）
COPY --from=builder /app .
COPY infra/entrypoint-gateway.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]

# ============== Studio 前端（nginx） ==============
FROM nginx:alpine AS studio
COPY --from=builder /app/packages/studio/dist /usr/share/nginx/html
COPY infra/nginx/app.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ============== Runtime UI 前端（nginx） ==============
FROM nginx:alpine AS runtime-ui
COPY --from=builder /app/packages/runtime-ui/dist /usr/share/nginx/html
COPY infra/nginx/app.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
