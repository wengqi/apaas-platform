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

## 平台定位与对标原则（2026-09-30 修订，见 ADR-0003 / ADR-0002）

**定位：企业内部真实使用的低代码平台；目标环境为非飞书的企业环境；使用者先开发者后业务。**
首要成功标准：能用平台完整交付并运行一个真实业务应用（表单 + 审批 + 报表）。

- **方向修订（2026-09-30，ADR-0003）**：产品论 = **受约束的 AI 应用生成底座**——元数据与治理轨道是产品本体；AI Agent 为第一公民用户（MCP/Schema 接口，仅出草稿），开发者第二，拖拽搭建降级为人工兜底；**治理闸门 = 全环境人审**；界面层统一 **amis 单方言**（一切界面皆页面：审批节点绑定页面、AI 生成页面、拖拽兜底，不设页面/表单之分，不引入 formily）；首个验收应用 = 采购合同类流程审批；自研瘦身至 ~50k 行。蓝图：`docs/design/DESIGN-refactor-blueprint-2026-09-30.md`
- 能力形态对标飞书 aPaaS（版本模型 / 权限语义 / 流程触发与节点语义 / 观测分类 / 编辑器信息架构），**对齐其能力语义而非逐个追齐组件矩阵**
- **飞书生态特有项移出对标范围**：官方连接器市场、飞书审批/飞书事件、飞书 AI 专区、行业模板市场（注：平台自研 AI 生成能力经 ADR-0003 已升为一等功能，与"不对标飞书 AI 专区"不冲突）
- 组织与身份经**可插拔对接层**接入目标企业环境（SSO + 目录同步），具体协议待定（见 ADR-0002 开放问题）
- 功能开发前查阅对标报告：`docs/research/RESEARCH-feishu-apaas-live-benchmark-2026-09-27.md`（36 项矩阵）+ 历史调研 `docs/research/RESEARCH-feishu-apaas-full.md`、`docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`
- PRD 以新 P0/P1 优先级为准（`docs/roadmap/ROADMAP.md` 重规划节 + 2026-09-30 方向修订节）；偏离时在 PR/commit 中说明理由

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
- **推送前 OCR 评审（工作约定，2026-10-01）**：功能分支推送前执行 `/ocr-review`（OCR 委托模式：
  preview → 逐文件审查 → High/Medium 修复复验 → 结构化报告）。评审与修复在同一推送内完成；
  体系性发现须同步知识库踩坑节。无 LLM 依赖（agent 自身执行），与「盯 CI」约定同级
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

## 当前阶段（2026-09-30 方向修订快照，基线为 2026-09-27 定位修订）

- ✅ **P1 运维与治理补强完成（2026-10-02，本阶段）**：观测事件四分类（FUNCTION_EXEC/SLOW_QUERY/PAGE_ERROR/OPEN_API_CALL，shared SSOT）+ **traceId 事件链路 ID 全链路**（pino genReqId/mixin + ALS + 错误响应 ApiError.traceId + 审计落库 + 观测事件，外部 X-Trace-Id 可串联）；云函数执行/慢查询（db 包 onSlowQuery hook，SLOW_QUERY_THRESHOLD_MS 默认 1000ms）/页面报错（ErrorBoundary 上报）/开放 API 调用四写入点；**流程效率分析**（ProcessInstance.timedOut 列 + GET /processes/analytics 完成率/平均耗时/超时数 + 监控页效率 Tab）；**权限查询调试工具**（PermissionService.explain 同语义不抛异常 + POST /permissions/debug 行级条件翻译 + 记录可见性真值验证 + studio 调试页）；审计日志对齐观测分类（AUDIT_ACTION_CATEGORIES 5 分类 SSOT + category 过滤 + 审计页分类列）；对象级搜索落地（records?keyword= 消费 searchable 标志，text 族+auto_number contains）。全局选项复用（选项集）未做、独立后排。gateway 单测 686、studio 109、db 55 全绿。实现记录 docs/knowledge-base/P1-OBSERVABILITY-GOVERNANCE-2026-10-02.md
- 🔄 **产品方向修订（ADR-0003，2026-09-30）**：产品论 = 受约束的 AI 应用生成底座；AI 生成/MCP 排除条款撤销（R1.S / R1.6 AI 生成接口 / R1.7 页面层 amis 迁移）；治理闸门 = 全环境人审；界面层 = amis 单方言（**一切界面皆页面**，不设页面/表单之分）；底座自建瘦身 ~50k 行。蓝图 docs/design/DESIGN-refactor-blueprint-2026-09-30.md
- ✅ **R1.7 页面层 amis 迁移完成（2026-10-02，本阶段，删旧优先三批次）**：① v1 运行时轨物理下线 + R1.4 旧快照/活表兜底腿退役（环境二分语义：已部署 bundle 唯一/未部署搭建期活表）+ `Application.publishedSnapshot` 列删除 + seed 走 AppVersion+环境指针原生路径（PR #14）；② 搭建器画布切换 amis-editor + v1 模板退役 + create 补 G3（PR #15）；③ v1 搭建器 + shared 渲染残骸 + isAmisPage 方言合同物理删除（-18.7k 行，自研 ~79.6k→61.5k），G3 单路径——**页面层唯一方言 amis / 唯一搭建器 amis-editor / 唯一渲染器 AmisRenderer / 唯一校验 G3 amis_page**。实现记录 docs/knowledge-base/DROP-LEGACY-RUNTIME / AMIS-EDITOR-CANVAS-R17B / DROP-V1-BUILDER-R17C-2026-10-02.md
- ✅ **R1.7 第一轮完成（2026-10-02，PR #13）**：runtime isAmisPage 分流（AmisRenderer 整页渲染）+ seed 存量 9 页全量迁 amis（crud/form/grid+chart）+ 搭建器 CodeTab amis 编辑兜底 + page.service.update 补 G3 硬闸。实现记录 docs/knowledge-base/AMIS-MIGRATION-R17-2026-10-02.md
- ✅ **R1.5 验收刷新通过（2026-10-02，本阶段）**：e2e/20 在采购合同应用上走通 P1 全链路协同（MCP 出稿→审核中心人批→publish 挂 prod 指针→runtime 环境读取→G4 变量闸→开放 API 触发真实审批流→状态回写→钉版本稳定性）；发现并修复 seed 审批页 pageId 绑定存 apiName 的运行时缺陷、MCP 枚举缺 API；e2e 88/88。验收矩阵 docs/knowledge-base/STATUS-MATRIX-2026-10-02.md
- ✅ **G6 纯流程 API 落地（2026-10-01，本阶段，P1 收官）**：X-API-Key 服务身份（sha256 存储明文一次性/吊销即时失效/open 限流桶）+ /open/* 触发端点（inputs 展开/发现端点/PROCESS_API_START 脱敏审计）+ 流程版本稳定性承诺（apiName+major 冻结快照、新 major diff 半自动、旧 major DEPRECATED 仍可调、引擎 schemaOverride 直通）；e2e 19 号 7 用例（v1 钉版本稳定性验证）、全量 83/83、gateway 单测 656。实现记录 docs/knowledge-base/OPEN-API-2026-10-01.md。**ADR-0003 蓝图 P1 全部完成**
- ✅ **G5 数据下沉落地（2026-10-01，本阶段）**：数据流 pipeline 全量下推 PostgreSQL（每源 LIMIT 子查询 + COALESCE join + JsonLogic 可翻译子集 WHERE + GROUP BY regex 守卫聚合 + ROUND(2)）；不可下推 filter 非聚合分支内存兜底/聚合分支显式报错；物化事务与 refresh 租约语义保留；e2e 07 零改动全绿（真实 PG 验证）。实现记录 docs/knowledge-base/DATASET-SQL-2026-10-01.md
- ✅ **R1.4 多环境落地（2026-10-01，本阶段）**：完整 M3——AppEnvironment 指针/Deployment 历史/应用环境变量（G3 敏感值加密+G4 发布硬闸）；records/instances/executions/序列按 environmentId 隔离（ALS 双维注入，缺省 prod）；运行时读路径（页面/审批页/对象/流程）bundle 唯一路径（初版降级链已于 2026-10-02 随删旧优先退役）；触发器随环境启停（jobId=scheduled:<env>:<defId>，顺带修复 pattern 清理互踩 bug）；实例冻结 schema；studio 环境管理页 + runtime-ui 环境切换。gateway 单测 627、e2e 77/77。实现记录 docs/knowledge-base/MULTI-ENV-2026-10-01.md
- ✅ **G1/R1.2 版本模型 + diff 快审落地（2026-10-01，本阶段）**：资源级三态（对象/页面/流程统一）+ 提交快照链（ResourceVersion：PENDING/APPROVED/REJECTED/SUPERSEDED + 版本谱系钩子）；**治理策略=仅 AI 提交需人审**（MCP submit_* 改造为 PENDING 不落活表，批准才落地；人工提交即时 APPROVED 基线）；验收项 diff 快审 UX=审核中心（结构化 schema diff + 一键批/驳 + 驳回意见回传 agent + 漂移保护 + 撤销未提交）；MCP 新增 list_review_submissions。单测 gateway 610 / e2e 72/72（新增 17 号治理闭环）。状态矩阵 docs/knowledge-base/STATUS-MATRIX-2026-10-01.md，实现记录 docs/knowledge-base/REVIEW-VERSION-MODEL-2026-10-01.md
- ✅ **P0 全量落地（2026-09-30）**：R1.S spike 双通过 GO；S2 amis 接入 runtime-ui（审批页面渲染链路）；S3 R1.3 审批语义（会签/或签/依次聚合+锁内并发封窗+加签/撤回+页面绑定+出入参）；S4/S5 采购合同验收应用全链路 e2e 验证——**R1.3 ✅ R1.5 ✅（e2e 68/68、单测 834）**；G3 Schema 校验合同 ✅（自建三校验器，25 单测）。状态矩阵：docs/knowledge-base/STATUS-MATRIX-2026-09-30.md。**P1 待推进：G4 MCP（前置就绪）→ R1.2 → R1.4 → G5 → G6**
- ✅ 整改 PR #1 已合并 main（2026-09-27，CI 四 job 全绿）
- ✅ 实地对标调研完成：docs/research/RESEARCH-feishu-apaas-live-benchmark-2026-09-27.md（36 项矩阵，实测对齐度 ~53%）
- ✅ **定位修订（ADR-0002）**：企业内部真实使用 / 非飞书环境 / 先开发者后业务；新 P0 = 身份与组织对接层、草稿→提交版本模型、流程表单与审批语义、多环境化、端到端真实应用交付（见 ROADMAP 重规划节）

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
    单测 gateway 517/517、studio 108/108，e2e 58/58 通过
- ✅ CI e2e 全红已闭环（2026-09-27）：根因为 e2e job 全局 NODE_ENV=test 污染
  Vite 构建模式（打进 React dev 版本致流程画布不渲染节点）+ HistoryBridge
  setState 死循环 + newQbId 碰撞（RAQB 伪 UUID）+ e2e appId 副作用级联；
  详见 docs/knowledge-base/REMEDIATION-2026-09-26.md 第五节之八
- ✅ BUG-05 已闭环：流程配置侧栏改为在应用 root 内渲染（原 body portal 事件
  委托不可靠），新增 e2e/12-process-sidebar.spec.ts 守护（含负向对照）
- ✅ Phase 2.12 表单页面设计器飞书对齐重构（2026-09-27）：实测飞书 aPaaS v3
  搭建器后重构——表单生成器（对象字段表格勾选/标题/组件映射/必填/拖拽排序 →
  一键生成表单 + vm.record + onSubmit=create_record 接线）/ 字段级属性面板
  （内容/校验/交互/12 栅格，面包屑 + 单列分组）/ 左栏组件+大纲树页签 /
  画布内拖拽排序与蓝胶囊工具条 / 飞书式顶栏（页面设置/撤销重做/刷新页面）与
  物料分组；Schema 向后兼容零迁移，studio 119 单测全绿，E2E 56 全绿；
  设计文档 docs/design/DESIGN-page-builder-feishu-parity-2026-09-27.md
- ✅ 数据层高严重度项已闭环：可空列 partial unique index（users/org_role_grants）、
  records JSONB 等值过滤改 `@>` 命中 GIN、业务字段排序按类型 cast（A-H1/A-H2）
- ✅ 流程写库已复用记录写内核（P1-5）：对象/批量操作节点走 RecordService
  （校验 + AutoNumber/Formula/Rollup + 记录事件触发），新增 e2e/14 回归
- ✅ React Query key 治理（P2-1）：删除零引用注册表、建立与事实键一致的
  `qk` 构造器并全量迁移读写点、发布/回滚统一失效，附静态守卫测试与负向对照
- ✅ 应用级审计 UI（ROADMAP 9.9）：audit_logs 增加 appId 维度 + 应用内审计页与
  侧边栏入口 + 按 appId 过滤查询（e2e/15 覆盖）
- ✅ 单文件 400 行规范达标：20 个超限文件按职责拆分完毕（仅搬移 + re-export，
  调用点零改动；前端源码已无 > 400 行文件），详见整改记录第五节之七
- ⬜ 残留（技术边界 / 设计取舍）：LIKE/范围类条件无法用 GIN（需大表压测后评估）；
  流程 query 节点未接入发起人 ABAC 条件
- 🟡 风险：多副本部署需确认 Redis 锁可用（已内置降级为进程内互斥）；
  水平扩展前建议压测 BullMQ 与 Redis 连接数
