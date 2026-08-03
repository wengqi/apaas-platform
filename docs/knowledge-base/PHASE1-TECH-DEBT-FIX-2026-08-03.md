# 第一阶段：阻断性技术债修复记录 — 2026-08-03

> 目标：让已实现的功能真正可用、安全、可观测。修复 5 项阻断性/高优先级技术债。

## 概述

| 任务 | 状态 | 新增文件 | 修改文件 |
|------|------|----------|----------|
| 1.1 行级/字段级权限执行接线 | ✅ | 1 | 4 |
| 1.2 ChangeLog 全模块集成 | ✅ | 1 | 8 |
| 1.3 通知系统补全 | ✅ | 4 | 4 |
| 1.4 定时触发器实现 | ✅ | 0 | 4 |
| 1.5 审计日志写入路径 | ✅ | 1 | 2 |
| **合计** | | **7 新增** | **22 修改** |

验证：`pnpm build` 全量构建 9/9 包通过。

---

## 1.1 行级/字段级权限执行接线

### 问题
PermissionService.check() 已算出 condition/fieldScope，但 PermissionGuard 丢弃返回值，RecordService 不消费。行级/字段级权限实际未生效。

### 修复方案

#### 新增文件
- **`apps/gateway/src/permission/condition-translator.ts`** — 权限条件 DSL → Prisma RecordWhereInput 翻译器
  - 支持 AND/OR 嵌套条件组
  - 支持 14 种操作符（eq/ne/gt/gte/lt/lte/contains/starts_with/ends_with/in/not_in/is_empty/is_not_empty/not_contains）
  - 支持 `${currentUser}` 动态变量替换
  - 复用 RecordService.buildCondition 的 JSONB path 查询模式

#### 修改文件
- **`apps/gateway/src/auth/authenticated-request.ts`**
  - 新增 `PermissionContext` 接口：`{ condition, fieldScope, currentUserId }`
  - 扩展 `AuthenticatedRequest` 添加 `permissionContext?` 字段

- **`apps/gateway/src/permission/permission.guard.ts`**
  - 捕获 `check()` 返回值，挂到 `request.permissionContext`
  - 成功时记审计日志 `PERMISSION_CHECK`，失败时记 `PERMISSION_DENIED`

- **`apps/gateway/src/record/record.controller.ts`**
  - query 路由补 `@RequirePermission('RECORD', 'VIEW', 'objectId')`
  - get 路由补 `@RequirePermission('RECORD', 'VIEW')`
  - 传递 `req.permissionContext` 给 Service

- **`apps/gateway/src/record/record.service.ts`**
  - `query()` 增加 `permissionContext` 参数：condition 注入 `where.AND`
  - `get()` 增加 `permissionContext` 参数
  - `toResult()` 增加 `fieldScope` 参数：仅保留白名单字段（字段级投影）

### 数据流
```
PermissionGuard.canActivate()
  → PermissionService.check(user, type, action, targetId)
  → 返回 { allowed, condition, fieldScope }
  → 挂到 request.permissionContext = { condition, fieldScope, currentUserId }
  → RecordController.query() 取 req.permissionContext
  → RecordService.query(tenantId, objectId, params, permissionContext)
  → translateCondition(condition, { currentUser: permissionContext.currentUserId })
  → 注入 Prisma where.AND
  → toResult(record, fieldScope) 投影字段
```

---

## 1.2 ChangeLog 全模块集成

### 问题
仅 ApplicationService.create() 调用 log()，Object/Page/Process 的 CRUD 均未记录变更，导致发布时变更清单为空。

### 修复方案

#### 新增文件
- **`apps/gateway/src/application/changelog.module.ts`** — 独立模块导出 ChangeLogService，避免循环依赖

#### 修改文件
| 文件 | 改动 |
|------|------|
| `application.module.ts` | 改为导入 ChangeLogModule（不再直接声明 ChangeLogService） |
| `page.module.ts` | 导入 ChangeLogModule |
| `object.module.ts` | 导入 ChangeLogModule |
| `process.module.ts` | 导入 ChangeLogModule |
| `page.service.ts` | 注入 ChangeLogService；create/update/delete 调 log()；update/delete 补查 appId |
| `object.service.ts` | 注入 ChangeLogService；对象 CRUD 调 log() |
| `process.service.ts` | 注入 ChangeLogService；create/update/delete 调 log() |
| `application.service.ts` | update/delete 补 log() |
| `page.controller.ts` | 传递 `req.user.id` |
| `object.controller.ts` | update/delete 传递 `req.user.id` |
| `process.controller.ts` | create/update/delete 传递 `req.user.id` |
| `application.controller.ts` | update/delete 传递 `req.user.id` |

### ChangeLog 调用签名
```ts
await this.changeLogService.log({
  tenantId,
  appId,
  module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION',
  entityType: string,
  entityId: string,
  entityName?: string,
  changeType: 'CREATE' | 'UPDATE' | 'DELETE',
  changedBy: string,
  changeDescription?: string,
});
```

### 模块依赖架构
```
ChangeLogModule（独立）
  ├── ApplicationModule imports
  ├── PageModule imports
  ├── ObjectModule imports
  └── ProcessModule imports
```
抽到独立模块避免 Page/Object/Process 反向依赖 ApplicationModule 导致循环依赖。

---

## 1.3 通知系统补全

### 问题
email/in_app 渠道返回 success=false，仅 webhook 可用。

### 修复方案

#### Prisma Schema 变更
新增 `InAppMessage` model：
```prisma
model InAppMessage {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  appId     String   @map("app_id")
  userId    String   @map("user_id")
  title     String
  body      String
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")
  readAt    DateTime? @map("read_at")
  // 索引: [tenantId], [userId], [userId, read]
}
```

#### 新增文件
| 文件 | 功能 |
|------|------|
| `notification/mail.service.ts` | nodemailer SMTP 封装（动态导入，未配置时优雅降级返回 false） |
| `notification/in-app-message.service.ts` | 站内信 CRUD + 未读数 + 标记已读 |
| `notification/in-app-message.controller.ts` | 4 个 API：GET /notifications、GET /notifications/unread-count、PUT /notifications/:id/read、PUT /notifications/read-all |
| `notification/notification.module.ts` | 模块注册，导出 MailService + InAppMessageService |

#### 修改文件
- `notification.executor.ts` — email case 调 `MailService.sendMail()`，in_app case 调 `InAppMessageService.create()`
- `process.module.ts` — 导入 NotificationModule
- `schema.prisma` — 新增 InAppMessage model + Tenant 关系

#### SMTP 配置
环境变量（未配置时邮件发送优雅降级）：
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@example.com
```

---

## 1.4 定时触发器实现

### 问题
TriggerType.SCHEDULE 枚举存在但 trigger.service.ts 注释"后续实现"。

### 修复方案

#### Prisma Schema 变更
ProcessDef 新增 `cron` 字段：
```prisma
cron String? // Cron 表达式（仅 triggerType=SCHEDULED 时使用）
```

#### 修改文件
- **`trigger.service.ts`**
  - 实现 `OnModuleInit` 接口
  - `onModuleInit()` 启动时扫描所有 `triggerType=SCHEDULED` 且 `status=PUBLISHED` 的流程
  - 为每个流程注册 BullMQ repeatable job（`repeat: { pattern: cron }`）
  - 注入 `PROCESS_QUEUE` 用于注册 repeatable job

- **`process.processor.ts`**
  - Worker 增加 scheduled-trigger job 处理分支
  - 收到 `{ processDefId, type: 'scheduled' }` 时调用 `ProcessEngine.startProcessByDefId()`

- **`process-engine.ts`**
  - 新增 `startProcessByDefId(processDefId, triggerContext)` 方法
  - 先加载流程定义获取 tenantId，再委托 `startProcess()`

### 定时触发流程
```
应用启动 → TriggerService.onModuleInit()
  → 扫描 SCHEDULED + PUBLISHED 流程定义
  → 为每个注册 BullMQ repeatable job (cron pattern)
  → BullMQ 按 cron 定时触发
  → ProcessProcessor 消费 job
  → ProcessEngine.startProcessByDefId(processDefId, { eventType: 'scheduled' })
  → 创建流程实例 + 入队执行
```

---

## 1.5 审计日志写入路径

### 问题
AuditLog 模型存在于 Prisma schema 但无任何写入代码。

### 修复方案

#### 新增文件
- **`apps/gateway/src/permission/audit-log.service.ts`**
  - `log(params)` 方法：写入 AuditLog 表
  - 非阻塞设计——写入失败仅记 error 日志，不抛异常
  - 参数：tenantId / userId / action / resource / resourceId / detail / ip

#### 修改文件
- **`permission.guard.ts`**
  - 注入 `AuditLogService`（`@Optional()` 装饰器，向后兼容）
  - `check()` 成功后记 `PERMISSION_CHECK` 审计日志
  - `check()` 抛异常时记 `PERMISSION_DENIED` 审计日志
  - 记录 IP 地址（`request.ip`）

- **`permission.module.ts`**
  - 注册 AuditLogService 为 provider 并 export

### 审计日志记录时机
```
每次 @RequirePermission 路由请求：
  → PermissionGuard.canActivate()
  → PermissionService.check() 成功
    → AuditLogService.log({ action: 'PERMISSION_CHECK', detail: { result: 'ALLOWED' } })
  → PermissionService.check() 抛 ForbiddenException
    → AuditLogService.log({ action: 'PERMISSION_DENIED', detail: { reason } })
    → 重新抛出异常
```

---

## 新增依赖
- `nodemailer` + `@types/nodemailer` — SMTP 邮件发送（gateway 包）

## Prisma Schema 变更
- 新增 `InAppMessage` model（需 `prisma migrate` 创建表）
- `ProcessDef` 新增 `cron` 字段（需 `prisma migrate` 添加列）

> ⚠️ 部署时需执行 `pnpm db:migrate` 应用 schema 变更。
