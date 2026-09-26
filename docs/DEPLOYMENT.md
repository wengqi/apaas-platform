# aPaaS 低代码平台 — 部署指南（Phase 10.5）

> 适用版本：2026-09（Phase 10 打磨与集成完成后）
> 部署形态：Docker Compose 单机部署（PostgreSQL + Redis + Gateway + Nginx×2）
> 架构说明：`docs/architecture/ARCHITECTURE.md`

---

## 1. 架构总览

```
                    ┌──────────────────────────────────────┐
                    │           Docker Compose             │
                    │                                      │
 浏览器 ──80/443──▶ │  ┌────────┐   /api ──▶  ┌─────────┐  │
                    │  │ Studio │  ──────────▶ │ Gateway │──┼──▶ PostgreSQL 16
 移动端 ──────────▶ │  │ (nginx)│   /runtime ─▶│ (NestJS)│  │    （元数据+记录）
                    │  └────────┘              │         │  │         ▲
                    │  ┌─────────┐             │ BullMQ  │──┼──▶ Redis 7
                    │  │Runtime-UI│ ──────────▶ │         │  │    （队列+缓存）
                    │  │ (nginx) │             └─────────┘  │
                    │  └─────────┘                         │
                    └──────────────────────────────────────┘
```

| 组件 | 说明 | 端口 |
|---|---|---|
| gateway | NestJS API 网关 — 全部业务逻辑 + BullMQ Worker | 3000 |
| studio | 搭建器前端（React 构建产物 + nginx） | 80（容器内） |
| runtime-ui | 运行时前端（React 构建产物 + nginx） | 80（容器内） |
| postgres | PostgreSQL 16（JSONB 宽表 + 元数据） | 5432 |
| redis | Redis 7（BullMQ 流程/数据集/延时队列） | 6379 |

> 微服务骨架（meta-svc / process-svc / runtime-svc）保留但**不参与部署**（TD-16 决策：单体优先，业务集中在 gateway）。

---

## 2. 前置要求

- Docker Engine ≥ 24 + Docker Compose v2
- Node.js ≥ 24 + pnpm ≥ 9（仅本地开发/调试需要；isolated-vm@7 要求 Node ≥ 24）
- 内存 ≥ 4 GB（isolated-vm 云函数沙箱每个 Isolate 上限 128MB，见 `CLOUD_FUNCTION_MEMORY_LIMIT_MB`）

## 3. 本地开发环境

```bash
# ① 启动基础设施（PostgreSQL + Redis）
pnpm infra:up

# ② 安装依赖 + 生成 Prisma Client
pnpm install
pnpm db:generate

# ③ 执行数据库迁移 + 种子数据
pnpm db:migrate
pnpm db:seed          # 基础账号/租户（superadmin / demo 租户）
pnpm --filter @apaas/db run seed:demo   # 资产管理 Demo 应用（可选）

# ④ 启动全部服务（gateway:3000 / studio:5173 / runtime-ui:5174）
pnpm dev
```

环境变量：复制 `.env.example` 为 `.env`（必填项缺失时 gateway 启动即 fail-fast，
schema 见 `apps/gateway/src/config/env.validation.ts`）。

## 4. 生产部署（Docker Compose 全栈）

### 4.1 构建与启动

```bash
# 一键构建 + 启动全部服务（多阶段 Dockerfile：deps → builder → gateway/studio/runtime-ui）
docker compose up -d --build
# 等价：pnpm docker:up

# 查看状态与日志
docker compose ps
pnpm docker:logs
```

首次启动 gateway 的 entrypoint 会自动：等待 PostgreSQL 就绪 → `prisma migrate deploy` → 启动 NestJS。

### 4.2 环境变量（生产必改项）

| 变量 | 说明 | 生产要求 |
|---|---|---|
| `JWT_SECRET` | 登录令牌签名密钥 | **必须**改为 32+ 位随机串 |
| `CONNECTOR_ENCRYPTION_KEY` | 连接器凭证 AES-256-GCM 密钥（32 字节 hex） | **必须**重新生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATABASE_URL` | PostgreSQL 连接串 | 使用强密码 + 内网地址 |
| `REDIS_URL` | Redis 连接串 | 生产建议开启 requirepass |
| `NODE_ENV` | 运行环境 | `production` |
| `CORS_ORIGINS` | 允许的跨域来源 | 填实际前端域名 |
| `THROTTLE_TTL_MS` / `THROTTLE_DEFAULT_LIMIT` / `THROTTLE_AUTH_LIMIT` | API 限流（默认 60s / 100 / 10） | 按流量调整 |

完整变量清单见 `.env.example`（与 `env.validation.ts` 由 `scripts/check-doc-sync.sh` 强制同步）。

### 4.3 初始化数据

```bash
# 进入 gateway 容器执行迁移与种子（entrypoint 已自动 migrate deploy，此处为手动兜底）
docker compose exec gateway pnpm --filter @apaas/db run migrate:deploy
docker compose exec gateway pnpm --filter @apaas/db run seed
```

### 4.4 Nginx 路由

两个前端容器共用 `infra/nginx/app.conf`：
- `/api/**` → 反代 gateway:3000
- 其余路径 → 静态资源 + SPA fallback（`try_files ... /index.html`）

生产建议在最外层再叠加一层 TLS 终止（SLB / Caddy / certbot）。

## 5. 健康检查与验收

| 检查项 | 命令/地址 | 预期 |
|---|---|---|
| Gateway | `curl http://<host>:3000/api/v1/health` | `{"status":"ok"}` |
| Swagger | `http://<host>:3000/api/docs` | 文档可打开 |
| Studio | `http://<studio-host>/` | 登录页渲染 |
| Runtime-UI | `http://<runtime-host>/login` | 登录页渲染 |
| 数据库迁移 | `docker compose logs gateway \| grep migrate` | 无报错 |
| 队列连通 | 登录后启动一个测试流程实例 | 实例状态 RUNNING→COMPLETED |

**端到端验收**：登录 Studio（superadmin@apaas.dev）→ 打开资产管理 Demo → Runtime-UI 查看资产列表/仪表盘 → 创建领用申请记录 → 任务中心审批 → 申请人收到站内通知（验证 审批→通知 链路）。

## 6. 数据备份与恢复

```bash
# 备份（建议 cron 每日执行）
docker compose exec postgres pg_dump -U apaas -d apaas -Fc > backup_$(date +%F).dump

# 恢复
docker compose exec -T postgres pg_restore -U apaas -d apaas --clean < backup_2026-09-25.dump
```

Redis 仅承载队列与限流计数，可丢失（流程实例状态持久化在 PostgreSQL，崩溃后由引擎从 DB 恢复推进）。

## 7. 升级与回滚

```bash
git pull && docker compose up -d --build   # 滚动重建（entrypoint 自动执行新迁移）
docker compose down && git checkout <prev-tag> && docker compose up -d --build
```

> 迁移文件一经提交不可修改（只追加），回滚代码不会自动回滚数据库 — 需按迁移历史手工处理。

## 8. 常见问题（Troubleshooting）

| 现象 | 原因 | 处理 |
|---|---|---|
| gateway 启动即退出 | 必填环境变量缺失（Joi fail-fast） | 看 `docker compose logs gateway`，补齐 .env |
| 前端页面白屏 / JS 报缓存错误 | 浏览器缓存旧 bundle | 强刷（Cmd+Shift+R）或关闭标签页重建 |
| Vite 构建产物损坏 | 缓存损坏 | 删除 `packages/*/dist` 与 `.turbo` 后重建镜像 |
| 流程实例卡 RUNNING | Redis 队列未消费 / worker 崩溃 | 检查 Redis 连通性；实例状态持久化于 DB，重启 gateway 自动恢复推进 |
| 429 Too Many Requests | 限流阈值过低 | 调整 `THROTTLE_*` 环境变量 |
| 定时触发器不执行 | 流程未发布或 cron 未注册 | 发布流程后查看 gateway 日志 `registerScheduledJob` |
| 云函数 OOM | Isolate 内存上限过低 | 调整 `CLOUD_FUNCTION_MEMORY_LIMIT_MB`（默认 128） |

## 9. 安全基线清单

- [ ] `JWT_SECRET` / `CONNECTOR_ENCRYPTION_KEY` 已更换为强随机值
- [ ] PostgreSQL / Redis 未暴露公网（仅 compose 内网）
- [ ] HTTPS 已在最外层启用（nginx 或 SLB）
- [ ] `CORS_ORIGINS` 收敛到实际域名
- [ ] 数据库每日备份已配置并验证可恢复
- [ ] 默认种子账号（superadmin/admin/builder/user）已在生产修改密码或禁用
