# aPaaS Docker 部署指南

## 前置要求

- **Docker** >= 20.10
- **Docker Compose** v2（`docker compose` 命令，非旧版 `docker-compose`）

## 快速启动

```bash
# 一键构建并启动全部服务
pnpm docker:up
# 或直接使用 docker compose
docker compose up -d --build
```

首次构建需要几分钟（安装依赖 + 编译），后续启动利用缓存秒级完成。

## 访问地址

| 服务 | 地址 | 说明 |
|---|---|---|
| **Studio 搭建器** | http://localhost:8080 | 低代码搭建器前端（设计态） |
| **Runtime UI** | http://localhost:8081 | 应用运行时前端（用户态） |
| **API Gateway** | http://localhost:3000 | 后端 API（直连，调试用） |
| PostgreSQL | localhost:5432 | 数据库（调试用，用户/密码 `apaas`/`apaas`） |
| Redis | localhost:6379 | 缓存 + 流程队列 |

### 测试账号

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 管理员 | admin@apaas.dev | admin123 |
| 搭建者 | builder@apaas.dev | builder123 |

## 常用命令

```bash
# 查看全部服务日志
pnpm docker:logs

# 查看指定服务日志
docker compose logs -f gateway
docker compose logs -f studio

# 停止全部服务（保留数据）
pnpm docker:down

# 重新构建并启动（代码更新后）
docker compose up -d --build

# 停止并清除全部数据卷（完全重置）
docker compose down -v

# 查看服务状态
docker compose ps
```

## 环境变量

通过宿主机 `.env` 文件或环境变量覆盖默认值（docker-compose.yml 中引用）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `JWT_SECRET` | dev-secret-change-me... | JWT 签名密钥，**生产环境务必修改** |
| `JWT_EXPIRES_IN` | 7d | Token 过期时间 |

使用示例：

```bash
# 创建 .env 覆盖 JWT 密钥
echo 'JWT_SECRET=your-production-secret-key-here' > .env

# 然后启动
pnpm docker:up
```

## 架构说明

```
┌─────────────────────── Docker Network ───────────────────────┐
│                                                              │
│  ┌────────────┐   ┌────────┐   ┌──────────────────────────┐ │
│  │ PostgreSQL │   │ Redis  │   │  API Gateway (NestJS)     │ │
│  │  :5432     │   │ :6379  │   │  :3000                    │ │
│  └────────────┘   └────────┘   │  entrypoint:              │ │
│                                 │   ① 等 DB 就绪            │ │
│  ┌──────────────────┐          │   ② prisma migrate deploy │ │
│  │ Studio (nginx)   │          │   ③ seed (幂等)           │ │
│  │  :80 → :8080     │──/api──▶│   ④ node dist/main.js     │ │
│  │  Vite 静态文件   │          └──────────────────────────┘ │
│  └──────────────────┘                   ▲                    │
│                                         │                    │
│  ┌──────────────────┐                   │                    │
│  │ Runtime UI (nginx│──/api──────────────┘                   │
│  │  :80 → :8081     │                                        │
│  │  Vite 静态文件   │                                        │
│  └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

- **前端 nginx** 同时托管 Vite 构建的静态文件 + 反向代理 `/api` → Gateway，实现同源访问
- **Gateway entrypoint** 自动等待 PostgreSQL 就绪 → 执行 Prisma 迁移 → 种子数据 → 启动服务
- **多阶段构建**：`deps`（安装依赖）→ `builder`（编译全部包）→ 各运行时镜像（Gateway / nginx）

## 开发模式 vs Docker 部署

| | 开发模式 | Docker 部署 |
|---|---|---|
| 启动命令 | `pnpm infra:up && pnpm dev` | `pnpm docker:up` |
| PG/Redis | Docker 容器（`infra/`） | Docker 容器（同一 compose） |
| 后端 | `nest start --watch`（热重载） | `node dist/main.js` |
| 前端 | `vite` dev server（HMR） | nginx 托管静态文件 |
| API 代理 | Vite dev server proxy | nginx 反向代理 |
| 端口 | 5173 / 5174 / 3000 | 8080 / 8081 / 3000 |
| compose 文件 | `infra/docker-compose.yml` | `docker-compose.yml`（根目录） |

## 故障排查

### 端口冲突

```bash
# 检查端口占用
lsof -i :8080
lsof -i :3000

# 修改端口映射（编辑 docker-compose.yml 的 ports）
```

### 数据库迁移失败

```bash
# 查看完整日志
docker compose logs gateway

# 完全重置数据库
docker compose down -v
docker compose up -d --build
```

### 重新构建镜像

```bash
# 不使用缓存重新构建
docker compose build --no-cache

# 重新启动
docker compose up -d
```
