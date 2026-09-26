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

> 决策详情以 `docs/adr/` 为准（ADR-0001 登记上述决策）。新增或推翻重大架构决策必须新建 ADR，本节只保留摘要。

## AI 工作红线（不可协商）

1. **禁止修改或删除测试让失败的用例变绿**。测试失败先查产品逻辑与测试意图；确认测试本身有误时，须在提交说明中写明理由。
2. **禁止 `git push --no-verify` / `git push --force`**（AI 侧已被 workspace hooks 拦截）；紧急情况由人执行。
3. **新增依赖必须说明理由**、同步更新 lockfile、并在 PR 中标注用途；禁止顺手升级无关依赖。
4. **Prisma 迁移历史不可回改**（详见「数据库变更规范」）。
5. **破坏性命令**（rm -rf 危险路径 / 删库删卷 / DROP DDL 等）由 `.zcode/config.json` PreToolUse 守卫自动拦截——被拦截说明该操作需要人工执行。

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
- scope：`gateway/shared/db/studio/runtime-ui/meta-svc/process-svc/runtime-svc/auth/object/record/page/process/permission/tenant/application/notification/queue/infra/docs/config/deps/connector/dataset/cloud-function/e2e`
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

- 远端：GitHub 私有仓库。PR 推送后 GitHub Actions（`.github/workflows/ci.yml`）并行运行 static（doc-sync + lint + typecheck）/ test（单测 + 覆盖率阈值 58/72/72/58 强制）/ build，三者全绿后运行 e2e（Playwright）
- PR 必须通过全部 CI job 才能合并；远端推送后启用分支保护：required checks 覆盖全部 CI job，禁止直推 main
- 仓库内 AI 会话闸门：`.zcode/config.json` hooks（PostToolUse 即时格式化 / Stop typecheck 收口 / PreToolUse 危险命令拦截），hook 脚本在 `scripts/zcode-hooks/`
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

### 文档同步规范（强制执行）

> **重要**：文档同步不是可选步骤。每次完成功能开发或阶段性工作后，**必须**在同一次提交中同步更新文档。
> 自动化检查脚本 `scripts/check-doc-sync.sh` 已集成到 pre-push 钩子，不同步将**阻断推送**。

#### 每次提交后必须执行的检查清单

1. **ROADMAP.md** — 对应 Phase 的任务状态和完成度已更新
2. **STATUS-MATRIX** — 对应模块的进度百分比和缺口列表已更新
3. **AGENTS.md "当前阶段"** — 整体完成度、Phase 状态、风险项已同步
4. **.env.example** — 新增环境变量已同步添加（可选变量用 `#` 注释前缀）
5. **commitlint.config.mjs** — 新增模块 scope 已添加到 scope-enum
6. **AGENTS.md scope 列表** — 新增模块 scope 已同步添加（与 commitlint 一致）

#### 自动化保障机制

- **pre-push 钩子**：`bash scripts/check-doc-sync.sh` 检查 .env.example ↔ env.validation.ts 和 commitlint ↔ AGENTS.md scope 一致性
- **CI 流水线**：PR 合并前运行文档同步检查
- **PR 模板**：feat/fix 类型 PR 必填文档同步检查项

#### 阶段性工作

- 每个阶段完成后新建 `STATUS-MATRIX-YYYY-MM-DD.md` 状态矩阵
- 知识库文档（`docs/knowledge-base/`）记录实现细节和设计决策

## 当前阶段（2026-09-26 整改后快照）

> 历史明细归档：`docs/knowledge-base/STATUS-2026-09-25.md`；本轮整改详见
> `docs/knowledge-base/REMEDIATION-2026-09-26.md`（含评审→修复→验证对照）。

- 代码工程完成度 ~92%；飞书功能对齐度 ~68%（口径未变）
- ✅ Phase 0-10 完成；✅ 独立评审（2026-09-26）"上线前必须"清单已整改完毕
  - 安全：默认凭证链 / 登录防爆破（限流桶 + 账号锁定）/ 出站 SSRF /
    租户挂起即时失效 / Swagger 生产关闭 / 云函数代码锁定与并发预算 /
    webhook 签名与日志脱敏 / 业务动作级审计
  - 引擎：批量更新字段级 merge / Redis 分布式锁 / 取消后不可复活 /
    数据集刷新租约 / BullMQ 重试与清理 / 应用发布触发器注册
  - 产品：手动流程 UI 启动入口 / 触发器配置界面 / 单选值稳定编码
    （审批后状态流转与通知闭环）/ 记录表单系统字段隐藏 / 页面搭建器
    脏状态与加载失败显式化 / 全局 ErrorBoundary
  - 质量：新增真实 UI 路径 e2e（e2e/11-ui-user-paths.spec.ts）；
    本地 e2e 50/50、单测 492/492 通过
- ⬜ 残留（下迭代）：流程配置侧栏刷新后交互冻结（BUG-05，未定位根因）；
  records JSONB 的 GIN 索引与查询算子错配；可空列唯一约束；流程节点写库
  未复用 RecordService；单文件 400 行拆分；React Query key 治理
- 🟡 风险：多副本部署需确认 Redis 锁可用（已内置降级为进程内互斥）；
  水平扩展前建议压测 BullMQ 与 Redis 连接数
