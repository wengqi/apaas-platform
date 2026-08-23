# 租户隔离 $extends 重构 — 实现记录

> 完成日期：2026-08-23
> 关联技术债：TD-17（原 ROADMAP next-steps 中误标为 TD-16，TD-16 已用于微服务桩决策）

## 背景

原架构的租户隔离完全依赖**手动约定**：`tenantId` 作为位置参数从控制器（`requireTenantId(req)`）逐层传递到 ~94 个 service 方法，开发者必须在每个 Prisma 查询的 `where`/`data` 中手动添加 `tenantId`。无 AsyncLocalStorage、无请求上下文基础设施、无 `$extends`。

### 安全缺口（本次消除）

1. **依赖开发者自觉**：每个查询必须手动添加 `tenantId`，遗漏即导致跨租户泄露
2. **update/delete 仅凭 findFirst 前置校验**：8+ 处 `prisma.record.update({ where: { id } })` 不含 tenantId，安全靠前置 `findFirst` 兜底
3. **预存跨租户泄露 bug**：`object/auto-number.ts` 的 `prisma.record.findMany({ where: { objectId } })` 无 tenantId 过滤，扫描所有租户记录计算序号
4. **后台任务无 HTTP 上下文**：BullMQ process-queue 的 job data 不含 tenantId，靠实例行 `tenantId` 列恢复
5. **DatasetRow 缺少 `@@index([tenantId])`**：注入 tenantId 后查询将做全表扫描

## 架构设计 — 三层防御体系

| 层 | 机制 | 状态 |
|---|---|---|
| Layer 1 | 手动 tenantId 参数（现有约定） | ✅ 保留作为 belt-and-suspenders |
| Layer 2 | **Prisma `$extends` 自动注入（本次）** | ✅ 完成 |
| Layer 3 | PostgreSQL RLS（未来） | ⬜ 生产部署前叠加 |

### 核心组件

| 组件 | 文件 | 职责 |
|---|---|---|
| ALS 上下文 | `packages/db/src/tenant-context.ts` | `getTenantId()` / `runWithTenant()` / `runAsSystem()` — AsyncLocalStorage 封装 |
| 注入逻辑 | `packages/db/src/tenant-injection.ts` | `decideInjection()` / `injectToWhere()` / `injectToData()` / `injectToUpsert()` — 纯函数 |
| 模型白名单 | `packages/db/src/tenant-models.ts` | 24 个有 tenantId 列的模型集合 |
| $extends 扩展 | `packages/db/src/index.ts` | 11 个操作类型的 tenantId 自动注入 + fail-open warn |
| HTTP 拦截器 | `apps/gateway/src/common/tenant-context.interceptor.ts` | 从 `req.user.tenantId` 设置 ALS 上下文 |

### 注入逻辑

1. 检查模型是否在白名单（24 个有 tenantId 列的模型）→ 否则跳过
2. 从 ALS 获取 tenantId → 有值则注入到 `where`/`data`
3. 系统上下文（`runAsSystem`）→ 静默跳过
4. 无 ALS 上下文 → 跳过注入 + 记录 warn 日志（fail-open，便于审计遗漏路径）

### 排除模型（5 个，无 tenantId 列）

- `Tenant`：租户实体本身
- `UserRole`：关联表，通过 `Role.tenantId` 间接隔离
- `OrgMember`：关联表，通过 `OrgNode.tenantId` 间接隔离
- `View`：子表，通过 `objectId → ObjectMeta` 间接隔离
- `NodeExecution`：子表，通过 `instanceId → ProcessInstance` 间接隔离

### Prisma 5.x Extended WhereUnique

`@prisma/client ^5.22.0` 支持 Extended WhereUnique（Prisma 5.0+ 引入），`update`/`delete` 的 `where` 可接受非唯一字段（如 `tenantId`），`$extends` 查询扩展可安全注入。

## 后台任务上下文修复

| 路径 | 修复方式 |
|---|---|
| ProcessProcessor (process-queue) | Worker 回调内先 `findFirst` 实例获取 `instance.tenantId`，再 `runWithTenant(tid, () => engine.executeNextNode(...))` |
| ProcessProcessor (delay-queue) | 同上，从实例恢复 tenantId |
| ProcessProcessor (scheduled) | `startProcessByDefId` 内从流程定义获取 tenantId，`runWithTenant` 包裹 `startProcess` |
| DatasetProcessor (dataset-queue) | job.data 已含 tenantId，包裹 `runWithTenant` |
| Webhook 入站 | 从 connector.tenantId 设 ALS |
| Seed 脚本 | `runAsSystem` 包裹整个 seed 逻辑 |

## Schema 修复

- `DatasetRow` 添加 `@@index([tenantId])` — 迁移 `20260823133300_add_tenant_index_on_dataset_rows`

## 测试

| 测试文件 | 测试数 | 覆盖内容 |
|---|---|---|
| `packages/db/src/tenant-context.spec.ts` | 18 | ALS set/get/clear、嵌套 run、runAsSystem bypass、异步上下文传播 |
| `packages/db/src/tenant-injection.spec.ts` | 24 | decideInjection 决策（白名单/排除/系统/无上下文）、injectToWhere/Data/Upsert 注入正确性、TENANT_SCOPED_MODELS 完整性 |

### 回归测试

- gateway: 341 测试全部通过（18 spec 文件）
- db: 42 测试全部通过（2 spec 文件）
- 合计: 383 测试，0 失败
- `pnpm typecheck` 通过
- ESLint 0 warning

## 自动修复的预存 bug

`object/auto-number.ts` 的 `prisma.record.findMany({ where: { objectId } })` 跨租户扫描 — $extends 扩展现在自动注入 tenantId，无需修改业务代码。

## 回滚方案

- `$extends` 扩展：`packages/db/src/index.ts` 一处修改，注释掉 `$extends` 调用即回退
- ALS 基础设施：新增文件，删除即回退
- 后台任务修复：`runWithTenant` 包裹是增量添加，移除即回退
- 不修改 service 方法签名，现有代码完全不受影响
