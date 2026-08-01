#!/bin/sh
set -e

echo "🔄 aPaaS Gateway 启动中..."

# ① 等待 PostgreSQL 就绪（Node.js net 模块检测，无需额外安装）
echo "⏳ 等待 PostgreSQL..."
node -e "
const net = require('net');
const host = process.env.PG_HOST || 'postgres';
const port = parseInt(process.env.PG_PORT || '5432');
function check() {
  const conn = net.connect(port, host);
  conn.on('connect', () => { conn.end(); process.exit(0); });
  conn.on('error', () => setTimeout(check, 1000));
}
check();
"

# ② 执行数据库迁移
echo "📦 执行 Prisma 迁移..."
pnpm --filter @apaas/db run migrate:deploy

# ③ 执行种子数据（幂等，重复执行安全）
echo "🌱 执行种子数据..."
pnpm --filter @apaas/db run seed || echo "⚠️  种子数据已存在或跳过"

# ④ 启动 Gateway
echo "🚀 启动 API Gateway..."
exec node apps/gateway/dist/main.js
