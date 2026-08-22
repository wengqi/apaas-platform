# aPaaS 低代码平台 — 项目指令

## 项目概述

飞书 aPaaS 级低代码平台 — 对象建模 / 页面搭建器 / 自研流程引擎(单模式) / 多租户权限。
pnpm monorepo + Turborepo，React+Vite 前端，NestJS+Prisma 后端，PostgreSQL+Redis+BullMQ。

## 目录结构

```
apps/gateway/          — NestJS API 网关（所有后端业务逻辑集中于此）
packages/shared/       — 跨服务类型契约（Branded types, DTOs）
packages/db/           — Prisma schema + 迁移 + 种子数据
packages/studio/       — 搭建器前端（React + Vite + AntD + flowgram.ai）
packages/runtime-ui/   — 运行时前端（React + Vite + AntD）
packages/meta-svc/     — 元数据微服务骨架（仅 health check，业务在 gateway）
packages/process-svc/  — 流程微服务骨架（仅 health check，业务在 gateway）
packages/runtime-svc/  — 运行时微服务骨架（仅 health check，业务在 gateway）
infra/                 — Docker Compose + Nginx + 启动脚本
docs/                  — 文档（PRD / DESIGN / RESEARCH / ROADMAP / knowledge-base）
```

## 开发命令

```bash
pnpm dev              # 并行启动所有服务
pnpm build            # 全量构建（9 个包）
pnpm db:migrate       # Prisma 迁移
pnpm db:generate      # Prisma Client 生成
pnpm db:seed          # 种子数据
pnpm infra:up         # 启动 PostgreSQL + Redis
```

## 关键架构决策

1. **单体优先**：三个微服务骨架保留但暂不拆分（TD-16），所有业务在 gateway
2. **JSONB 宽表**：记录存储用通用 records 表 + data JSONB，非每对象建表
3. **WorkflowSchema SSOT**：流程引擎直接消费 JSON Schema，单模式编辑器（flowgram.ai）零翻译
4. **类型契约先行**：packages/shared 定义所有跨层 DTO，前后端共享
5. **行级权限通过条件翻译器**：PermissionService 算出 condition → condition-translator 翻译为 Prisma where → RecordService 注入查询

## 飞书 aPaaS 对齐原则

**后续所有功能开发必须与飞书 aPaaS 对齐。** 对齐基准文档：`docs/knowledge-base/FEISHU-ALIGNMENT-BENCHMARK.md`

- 功能开发前查阅对齐基准文档，确认飞书实现方案
- PRD 编写时以飞书功能为基准，标注「对齐/增强/简化/偏离」
- UI 设计时参考飞书交互模式（三栏布局、异步进度、模板驱动等）
- 偏离时在 PR/commit 中说明理由
- 原始调研材料：`docs/research/RESEARCH-feishu-apaas-full.md`（功能体系全景）+ `docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`（应用生命周期深度调研）

## 知识库

工程实践知识持久化在 `docs/knowledge-base/`，包含：
- **飞书对齐基准**（功能体系 + 对齐度矩阵）
- 代码审计报告
- 阶段修复记录
- 功能完成度矩阵
- 路线图更新

详见 `docs/knowledge-base/README.md`。每次完成阶段性工作后及时更新。

## 分析排除目录

代码搜索/遍历时排除：`node_modules/`、`.git/`、`dist/`、`.turbo/`

## 编码规范

### 代码风格

- ESLint flat config 在 `eslint.config.mjs`，所有包 lint 脚本为 `eslint src --max-warnings 0`（0 warning 容忍）
- Prettier 配置在 `.prettierrc`，`.lintstagedrc.json` 在提交时自动格式化暂存文件
- 禁止 `any`（warn 级，逐步清理）；未使用变量必须删除或以 `_` 前缀豁免
- TypeScript strict 模式全开，`noUncheckedIndexedAccess` 已启用
- `.editorconfig` 统一跨编辑器基础风格（space 缩进、lf 换行、utf-8）

### 实时性与事件驱动（禁止定时器轮询）

- **禁止**使用定时器轮询（`setInterval`、`setTimeout` 递归自调用循环）作为状态同步、数据刷新或事件监听的实现方式
- **必须**使用事件驱动架构替代：框架原生事件 API（flowgram `onSelectionChanged` / `onNodeCreate` / `onNodeDispose` / `onExtInfoChange`）、Pub/Sub、WebSocket、React Query 事件订阅等
- 原因：定时器轮询存在持续 CPU 开销、轮询间隔内状态不一致窗口、调试困难、且违反事件驱动架构原则
- 前车之鉴：流程引擎条件分支 300ms `setInterval` 轮询（画布↔配置面板同步）→ 重构为 `EventBridge` 事件驱动，消除轮询间隔与全量扫描开销
- **允许的例外**：`setTimeout` 用于 debounce/defer（防抖导出、表单 reset 延迟等单次延迟调用）；React Query `refetchInterval` 需在 PR 中说明必要性
- ESLint 已用 `no-restricted-syntax` 拦截 `setInterval` 调用（`error` 级），详见 `docs/knowledge-base/CODING-PRINCIPLE-NO-POLLING-2026-08-16.md`

### 提交规范

- Commit message 必须符合 Conventional Commits：`type(scope): subject`
- type：`feat/fix/refactor/perf/docs/test/chore/style/ci/revert/breaking`
- scope：`gateway/shared/db/studio/runtime-ui/auth/object/record/page/process/permission/tenant/application/notification/queue/infra/docs/config/deps/connector/dataset/cloud-function`
- pre-commit 钩子：lint-staged（eslint --fix + prettier --write 暂存文件）
- commit-msg 钩子：commitlint 格式校验（`commitlint.config.mjs`）
- pre-push 钩子：`pnpm typecheck` + `pnpm test` 全量检查（紧急情况可 `git push --no-verify` 跳过）

### 测试规范

- 测试框架：Vitest（后端 + shared），配置在 `apps/gateway/vitest.config.ts`
- 测试文件命名：`*.spec.ts`，与源文件同目录
- 新增核心逻辑（流程引擎/权限翻译器/公式引擎/条件求值）**必须**附带单元测试
- 测试不依赖外部服务（Prisma/Redis/BullMQ 需 mock 或隔离为纯函数）
- `pnpm test` 必须通过才能 push

### 类型检查

- `pnpm typecheck` 独立于 build，覆盖所有源文件 + spec 文件
- 类型错误必须在提交前修复，不依赖 `as any` 绕过
- gateway 使用 `tsconfig.check.json`（含 spec 文件），构建用 `tsconfig.json`（排除 spec）

### API 规范

- 所有路由前缀 `/api/v1/`（URI 版本控制已启用）
- Controller 必须标注 `@ApiTags` + `@ApiBearerAuth`（Swagger 文档，访问 `/api/docs`）
- 请求体必须用 class-based DTO（`*.dto.ts`），配 `class-validator` 装饰器，使 ValidationPipe + Swagger 同时生效
- 响应格式统一 `{ ok: true as const, data: ... }` / `{ ok: false, error: { code, message } }`
  - `as const` 必须——让 TypeScript 将 `ok` 窄化为字面量 `true`，使前端可安全做类型守卫
  - Health 端点例外（返回 `{ status: 'ok' }` 是标准健康检查格式）
- Prisma 异常由全局 `PrismaExceptionFilter` 自动转译（P2002→409、P2025→404、P2003→400）

### 环境变量

- 所有环境变量必须在 `apps/gateway/src/config/env.validation.ts` 用 Joi 定义 schema
- 必填项缺失启动即 fail-fast
- `.env.example` 必须与 schema 同步维护

### CI/CD

- PR 推送后 GitHub Actions（`.github/workflows/ci.yml`）自动运行 lint + typecheck + test + build
- PR 必须通过 CI 才能合并
- 新增依赖必须更新 lockfile（`pnpm install`）
- PR 模板在 `.github/pull_request_template.md`，包含检查清单和飞书对齐标注

### 文件命名规范

- 后端文件：kebab-case（`record.service.ts`、`jwt-auth.guard.ts`、`cloud-function.runner.service.ts`）
- 前端 React 组件文件（`.tsx`）：PascalCase（`CloudFunctionEditor.tsx`、`RecordList.tsx`）
- 前端非 React 模块文件（`.ts`）：camelCase（`processEditor.ts`、`pageBuilder.ts`）
- 测试文件：与源文件同名 + `.spec.ts`（`record.service.spec.ts`）
- 类名：PascalCase（`CloudFunctionRunner`、`PermissionService`）
- 接口名：PascalCase，**不加 `I` 前缀**（`StoredField`、`RenderContext`，不是 `IStoredField`）
- 枚举名 + 成员：PascalCase（`AppStatus`、`FieldType`）

### 常量管理规范

- 所有超时、限制、阈值等数值必须是命名常量或环境变量，禁止内联魔法数字
- 文件内常量：大写 + 下划线（`const BATCH_SIZE = 500`、`const DEFAULT_HTTP_TIMEOUT_MS = 10000`）
- 跨模块常量：放在 `@apaas/shared` 或 `config/` 目录
- 可配置值：通过环境变量 + Joi schema 暴露（如 `CLOUD_FUNCTION_TIMEOUT_MS`）

### 错误处理规范

- 禁止空 catch 块。如果是有意忽略，必须加注释说明原因：`catch { /* 非 JSON 响应，保持文本 */ }`
- `void` 异步调用（如 `triggerService.onRecordEvent`）必须有 `.catch()` 或确保被调用方有顶层 try/catch：
  ```typescript
  void this.triggerService.onRecordEvent(...).catch(err =>
    this.logger.error(`触发器执行失败: ${err.message}`)
  );
  ```
- 后端错误使用 NestJS HttpException 子类（`NotFoundException` / `BadRequestException` / `ForbiddenException`），携带明确的错误消息

### Service 方法签名规范

- 方法签名约定：`(tenantId, ...resourceIds, ...params)` — 租户上下文始终在前
- 所有查询操作必须包含 `tenantId` 在 `where` 中
- 所有写操作必须包含 `tenantId` 在 `data` 中
- 返回 DTO 而非 Prisma 原始实体（通过 `toDto()` 方法转换）

### 前端组件规范

- 单文件最大 400 行（含注释），超过必须按职责拆分
- React 组件职责单一：一个文件一个主组件（可含私有子组件）
- 复杂逻辑提取为 custom hook（`useXxx`），与 UI 分离
- 大型表单按 Section 拆分为子组件

### 数据库变更规范

- Schema 变更必须通过 `prisma migrate dev --name xxx` 生成迁移文件
- 迁移文件一旦提交不可修改（追加新迁移修正，不回改旧的）
- 新增模型必须包含：`tenantId` + `@@index([tenantId])` + `Tenant` 关系 + 级联删除
- 新增模型必须在 `Tenant` 和 `Application` 模型上添加反向关系字段
- JSON 字段必须标注 `@default("{}")` 避免空值

### 文档同步规范

- 每次完成功能开发后，同步更新 `ROADMAP.md` 中对应 Phase 的状态
- `commitlint` scope-enum 新增模块时，同步更新本文件的 scope 列表
- 每个阶段完成后新建 `STATUS-MATRIX-YYYY-MM-DD.md` 状态矩阵
- `.env.example` 必须与 `env.validation.ts` 的 Joi schema 保持同步

## 当前阶段

- ✅ Phase 0-5 + Phase 9 核心功能已实现（整体飞书对齐度 ~88%）
- ✅ 第一阶段阻断性技术债修复已完成（2026-08-03）
- ✅ 第二阶段前端功能补全已完成（2026-08-22：事件配置 UI + 任务中心 + 租户管理 + 应用编辑入口 + 站内信 UI + 权限规则编辑器增强 + 图表组件骨架）
- ✅ 工程化治理已完成（2026-08-06：测试基础设施 + Swagger + ESLint + 环境变量校验 + API 版本控制 + 全局错误处理 + 约束链 + 前端状态管理统一）
- ✅ Phase 5 连接器与集成已完成（2026-08-22：连接器实体 + HTTP 出站 + Webhook 入站 + 凭证加密 + 前端管理 UI）
- 🔄 Phase 6 数据集与数据流进行中（~70%：数据流引擎 + 物化存储 + 异步刷新 + 前端管理 UI 已完成，可视化画布待实现）
- 🔄 Phase 7 仪表盘与报表进行中（~40%：图表骨架 + 数据源绑定 + 仪表盘页面模板已完成，后端聚合引擎 + 完整布局待实现）
- ⬜ Phase 8 云函数与扩展（待开始）
- ⬜ Phase 10 打磨与集成（待开始：数据导入导出 / 批量操作 / 安全中间件 / E2E 测试）
- 🔴 当前最大风险：测试覆盖率 ~15%，核心 Service/Controller 零覆盖（P0 优先解决）
