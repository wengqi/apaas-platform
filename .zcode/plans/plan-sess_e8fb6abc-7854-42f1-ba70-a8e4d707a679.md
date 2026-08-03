# 第一阶段：阻断性技术债修复 — 执行计划

## 1.1 行级/字段级权限执行接线

### 新增文件
- `apps/gateway/src/permission/condition-translator.ts` — 权限条件 DSL → Prisma WhereInput 翻译器（~100 行）

### 修改文件
- `apps/gateway/src/auth/authenticated-request.ts` — 新增 `PermissionContext` 接口，扩展 `AuthenticatedRequest`
- `apps/gateway/src/permission/permission.guard.ts` — 捕获 check() 返回值，挂到 `request.permissionContext`
- `apps/gateway/src/record/record.controller.ts` — query/get 路由补 `@RequirePermission`，传递 permissionContext
- `apps/gateway/src/record/record.service.ts` — query()/get() 接收 permissionContext，condition 注入 where，fieldScope 投影字段

## 1.2 ChangeLog 全模块集成

### 新增文件
- `apps/gateway/src/application/changelog.module.ts` — 独立模块导出 ChangeLogService

### 修改文件
- `apps/gateway/src/application/application.module.ts` — 改为导入 ChangeLogModule
- `apps/gateway/src/page/page.module.ts` — 导入 ChangeLogModule
- `apps/gateway/src/object/object.module.ts` — 导入 ChangeLogModule
- `apps/gateway/src/process/process.module.ts` — 导入 ChangeLogModule
- `apps/gateway/src/page/page.service.ts` — 注入+调用 log()
- `apps/gateway/src/object/object.service.ts` — 注入+调用 log()
- `apps/gateway/src/process/process.service.ts` — 注入+调用 log()
- `apps/gateway/src/application/application.service.ts` — 修正+补全 log()

## 1.3 通知系统补全

### 新增文件
- `apps/gateway/src/notification/mail.service.ts` — nodemailer SMTP 封装
- `apps/gateway/src/notification/in-app-message.service.ts` — 站内信 CRUD
- `apps/gateway/src/notification/in-app-message.controller.ts` — 站内信 API
- `apps/gateway/src/notification/notification.module.ts` — 模块注册

### 修改文件
- `packages/db/prisma/schema.prisma` — 新增 InAppMessage model
- `apps/gateway/src/process/node-executors/notification.executor.ts` — email/in_app 接入真实实现
- `apps/gateway/src/process/process.module.ts` — 导入 NotificationModule
- `infra/docker-compose.yml` — SMTP 环境变量

## 1.4 定时触发器实现

### 修改文件
- `apps/gateway/src/process/trigger.service.ts` — 实现 SCHEDULE 触发
- `apps/gateway/src/queue/process.processor.ts` — 处理定时触发

## 1.5 审计日志写入路径

### 新增文件
- `apps/gateway/src/permission/audit-log.service.ts` — 审计日志写入

### 修改文件
- `apps/gateway/src/permission/permission.guard.ts` — check 后写入审计日志
- `apps/gateway/src/permission/permission.module.ts` — 注册 AuditLogService

## 验证
- `pnpm build` 全量构建通过