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
6. **记录准确性红线（2026-10-06）**：对话中给出的"正式结论级"内容（矩阵/清单/数据/裁决/影响分析）必须与权威文档**同源**——在给出陈述的同一提交内写入对应权威文档，禁止"先说后补"造成陈述与文档双轨；未落档内容必须显式标注"草稿/提案"。文档是唯一事实源，聊天记录不是。陈述与文档不一致按欺骗同类处理。
7. **git 命令规范红线（2026-10-06，机械守卫已加固）**：① **禁止改写已推送历史**——`commit --amend` 仅限未推送的本地提交，已推送提交的修正一律**追加新提交**（守卫比对 origin/<branch> 自动拦截改写）；② **禁止一切强制推送**——`--force` / `-f` / `--force-with-lease` 全部拦截（个人分支也不行，修正用追加提交）；③ **push 前确认本地与远端关系**（`git status -sb` / `git log origin/<branch> -1`），分叉时 `git reset <远端分支>` 重做而非强推；④ `reset --hard` 等破坏性操作按第 5 条人工执行；⑤ **提交/推送前必须确认所在分支**（`git branch --show-current`）——测试/脚本内的 git 操作禁止改变仓库状态（切分支/删分支/reset），确需的必须恢复原分支并在脚本结尾断言（直推 main 事故根因）；⑥ **禁止无 pathspec 的宽范围暂存**（裸 `git add -A`/`-u`）——先 `git status` 审查，构建产物/截图/临时文件/**凭证与环境文件**不入库；⑦ **禁止 `push --all` / `--mirror`**（半成品分支一并推送，守卫拦截）；⑧ **禁止 `git clean -f`**（未跟踪区可能含用户文件与生成产物，守卫拦截）；⑨ **冲突解决必须理解双方语义后融合**，不得未读就选一边或整体丢弃。

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
- scope：`gateway/shared/db/studio/runtime-ui/meta-svc/process-svc/runtime-svc/auth/mcp/review/object/record/page/process/permission/tenant/application/notification/queue/infra/docs/config/deps/connector/dataset/cloud-function/e2e`
- pre-commit 钩子：lint-staged（eslint --fix + prettier --write 暂存文件）
- commit-msg 钩子：commitlint 格式校验（`commitlint.config.mjs`）
- **推送前 OCR 评审（工作约定，2026-10-01）**：功能分支推送前执行 `/ocr-review`（OCR 委托模式：
  preview → 逐文件审查 → High/Medium 修复复验 → 结构化报告）。评审与修复在同一推送内完成；
  体系性发现须同步知识库踩坑节。无 LLM 依赖（agent 自身执行），与「盯 CI」约定同级
- **推送前 QA 走查（工作约定，2026-10-06）**：功能分支推送前除 OCR 代码评审外，另执行一轮
  GUI 黑盒走查（web-gui-tester 方法论）：按 {草稿,已发布}×{画布创建,API创建} 矩阵覆盖受影响
  界面，验证截图后做全帧异常扫描（列出所有状态标签自问是否矛盾），产出走查报告（通过点/
  问题点/证据截图，gui-test-screenshots/ 留档）。与开发验证互补，减少对用户人工 QA 的依赖；
  推送前另跑 `pnpm test:e2e:smoke`（核心旅程冒烟，~16s，见 docs/knowledge-base/TEST-JOURNEY-MAP.md）
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

- 🔄 **AI 主线第四轮：权限工具面 + 反馈环 e2e（2026-10-06，本阶段）**：权限治理单元=角色规则集（快照=目标规则集，批准=全量替换 setPermissionRules 写内核，与 UI 编辑器同构）。工具面：list_permission_rules（读现状）+ submit_permission_rule_draft（G3 第五校验器 permission：五维/动作/效果枚举+condition 须 JsonLogic 对象+fieldScope 数组+上限 200；targetId 存在性对照活表校验）；治理轨道 ReviewModule 加 PERMISSION（拓扑序末位，快照 apiName=角色 code 同角色二次提交走收编）；方言指南 permission（deny-overrides/default-deny+最小必要授权+成员人工管理边界）。**实测闭环**：应用级角色+行级规则（RECORD VIEW 采购单 condition supplier_name==华东科技）人审批准后，终端用户 7 条采购单只见 3 条华东科技（JsonLogic 经条件翻译器下推）。**反馈环 e2e 清偿（e2e/22-feedback-loop 三断言）**：驳回→writeback 回写 rejected（轮询断言）/申请人站内信（notification 节点 {{record.created_by}}）/运行时 UI 台账中文标签"已驳回"。e2e 工程修：auth.setup 改 API 登录直写 storageState（zustand persist apaas:auth；UI 登录撞 auth 限流 10/min 间歇失败）+loginViaApi token 缓存；提交→建任务 BullMQ 异步须轮询；驳回路径绕过线性通知节点（rejectToNodeId 须指向通知节点）。gateway 746 全绿。实现记录 docs/knowledge-base/AI-MAINLINE-R4-PERMISSION-TOOLS-2026-10-06.md
- 🔄 **AI 主线第三轮：数据集工具面——跨对象报表腿打通（2026-10-06，本阶段）**：DSL 不发明新语言——复用 shared DataFlowConfig 结构化 JSON + G3 第四校验器（dataset：别名引用闭合/枚举值域/聚合字段禁点路径）。工具面：submit_dataset_draft + submit_app_drafts datasets 数组（单波）+ list_datasets + validate_schema/dialect_guide 扩 dataset。治理轨道：ReviewModule 加 DATASET（拓扑序 对象→数据集→页面→流程），批准落地解析 @ref:object: 令牌、落 ACTIVE 并立即 execute 物化；页面 @ref:dataset:<数据流apiName> 令牌落地解析为数据集 ID。实测：采购分析应用（供应商×采购单 join→分组求和→数据集→看板柱状图）全链路，3 组供应商金额/单数精确吻合、跨对象图表渲染验证通过；驳回→writeback 驳回值回写实测 ✓。**实测挖出并修复三个真 bug**：①治理基线未归一化——落地解析令牌后基线仍存令牌形态，同资源二次 AI 提交漂移必然误报（OBJECT/PAGE/PROCESS 同病）→ applyApproved 落地后重提活表回写基线；②dataflow-sql join 分支双重别名 PG 42601（G5 遗留，join 分支下推后从未真实执行）→ 引用 q_<alias>.data；③聚合行键与数据集列契约不一致（图表取数"未知"）→ runPipeline 聚合分支投影到 outputFields.alias。引擎字段键契约（join 左表裸键/右表 {rightAlias}_ 前缀，聚合禁点路径）已入方言指南与校验器。gateway 736 全绿。遗留：权限工具面、反馈环 e2e（Playwright）、自动通知默认链路。实现记录 docs/knowledge-base/AI-MAINLINE-R3-DATASET-TOOLS-2026-10-06.md
- 🔄 **AI 主线第二轮：报表腿打通（2026-10-05，本阶段）**：方法论=先实测后修缺。实测：MCP 现有工具面 2 次调用+1 次人审生成销售订单应用（对象/表单/台账/**仪表盘三图表**/审批回写），v0.1.0 发布后**柱/折线/饼三图表运行时全部正确渲染**——首要成功标准"表单+审批+报表"的报表腿闭环，AI 生成能力与人工搭建对齐。关键确认：@ref 令牌解析覆盖 api.data.sourceId 深层数据域（比已记录更广）；G3 对 chart schema 放行。修复：amis_page 方言指南补 chart 三连节（chart-data 载荷契约/柱折 adaptor 模板/饼图差异+grid 布局）+ workflow 指南补最小骨架示例 + runtime 申请内容过滤裸 id 行。摩擦点定性教训：WorkflowSchema edges 打回是"没先读对应指南"的流程失误非指南缺陷。备忘：REST POST records 为扁平契约（无 data 包裹）。遗留：数据集工具面（跨对象报表，下轮 spike 数据流 DSL 最小子集）、权限工具面、反馈环 e2e。实现记录 docs/knowledge-base/AI-MAINLINE-R2-DASHBOARD-2026-10-05.md
- ✅ **评审遗留缺陷清零第一轮（2026-10-05）**：方法论=先核实后修复——2026-10-04 双视角评审遗留清单逐项对照当前代码（发现记忆过时项：会签/或签已修，仅 SEQUENTIAL 引擎支持但 UI 从不暴露）+ API 实测（builder 审计 403 复现/admin 对照 200）+ 浏览器回归，确认属实才修。修复 8 项：①提交表单排除流程回写字段（collectWritebackFields+buildPageTemplate excludeFields，台账不过滤——台账正要展示审批状态）②依次审批选项暴露③审批页只读渲染（makeAmisPageReadonly：form static+清提交动作+crud 去新增，绑定页无需强制改详情页）④审计页显式 403 态（AuditLogs/AppAuditLogs，此前渲染成空表）⑤裸 cuid/UTC 全局收敛（useUserNameMap/formatDateTime，6 处 UTC 截断+5 处裸 ID）⑥流程配置面板 fixed→absolute 不再遮挡保存/发布按钮 ⑦应用级变更归 APPLICATION 模块（发布向导不再把"新建应用"归页面组——**AI 主线第二轮中已重启 gateway 后真实验证**）⑧审批弹窗任务 ID 入技术详情折叠区。全绿 gateway 723/studio 124/runtime-ui 20/db 55/shared 17。遗留：审批弹窗数据域映射 UX、logout 残留标准路径未复现（观察）。实现记录 docs/knowledge-base/REVIEW-FOLLOWUP-2026-10-05.md
- ✅ **运行态业务用户旅程 P0 反馈环补完（2026-10-04）**：方法论从"AI 生成应用"主线切到"业务用户使用应用"主线（C 申请人/D 审批人）。反馈环三断全修：①审批结果自动回写——UserTask 节点新增 writeback 配置（字段+通过值/驳回值，单选字段渲染选项下拉），引擎 completeTask 决约定论后经 RecordService 写内核回写触发记录（非记录触发跳过、失败留痕不阻断），节点摘要画布可见；②表单页成对生成台账页（默认勾选，单选列 amis mapping 中文标签）；③审批人体验——绑定表单渲染修复（UI 曾写 formKey 契约外字段名致绑定静默失效，改 pageId+回退）、流程变量折叠默认收起、申请内容创建人解析姓名。另：审批弹窗绑定的表单可再提交问题——**2026-10-05 已修（审批页统一只读渲染）**。gateway 722、studio 119、db 55 全绿；端到端实测：提交→审批→记录 status=approved→台账"已批准"中文标签。双视角评审（产品+技术）同期完成，修复其 8 项按钮级缺陷（分支 fix/interaction-review-2026-10-04 已并 main）。
- 🔄 **AI 第一公民主线打磨第一轮完成（2026-10-03，本阶段）**：方法论=主线纵深打磨（AI 用 MCP 从零生成完整应用走全生命周期，按阻塞度修摩擦点；模块"极致打磨"门槛=主线用到+真实走通）。主线八步全通：MCP 建应用→对象/页面/流程草稿→人审→发布→记录触发流程→审批→状态回写→通知。修复 6 项：MCP 必填参数守卫（静默空结果防线）/create_application 工具（AI 建应用第一阻塞）/list_pages 摘要投影（token 浪费）/submit hint 带 appId 依赖链/apiName 与 slug 统一输出/JWT refresh（派生密钥双向隔离 + 续期脚本 scripts/refresh-mcp-token.sh）。未修 7 项列知识库（最高价值=资源依赖链批量提交，AI 单波生成完整应用）。gateway 单测 698、studio 114、db 55、shared 17。实现记录 docs/knowledge-base/AI-FIRST-POLISH-2026-10-03.md
- ✅ **审批回调 webhook 落地（2026-10-04，本阶段）**：`REVIEW_CALLBACK_URL`/`REVIEW_CALLBACK_SECRET` 环境变量 + ReviewCallbackService，批/驳（单资源与批量四点）POST 事件到 agent 回调端点（HMAC-SHA256 签名 + safeFetch SSRF 防护 + 失败不阻塞主流程），替代 list_review_submissions 轮询——AI 全自主交付最后一块拼图。实测 mock 接收器验签通过。gateway 711。
- ✅ **AI 单波生成应用全链路闭环（2026-10-04，本阶段）**：`list_users`/`list_roles` 只读工具（AI 自主配审批人）+ 会议预定应用实测暴露并修复三缺陷——#18 页面 api.url `@ref:object:` 令牌落地解析（URL 子串形态）/ #20 运行时 fetcher 失败静默（补对称 toast）/ **#21 方言指南 api.url 契约错误**（教 AI 写 /api/v1 前缀致 /api/api 404，纠错+fetcher 兼容剥离）。终验：提交→AI 生成审批页绑定渲染→批准→实例 COMPLETED，AI 生成应用与人工搭建能力完全对齐。gateway 710。实现记录 docs/knowledge-base/BATCH-SUBMIT-2026-10-03.md
- ✅ **资源依赖链批量提交落地（2026-10-03，本阶段，AI-first backlog 第一优先项）**：MCP 工具 `submit_app_drafts`（对象/页面/流程单波进审，共享 batchId）+ 跨资源引用令牌协议（`@ref:object|page:<apiName>`）+ 批量批准拓扑序落地（对象→页面→流程，令牌自动解析接线）+ 审核中心批次条一键批准/级联驳回。治理不变量保持（AI 仅草稿/一次人审/漂移保护/批量审计）。实测「会议预定」应用：**2 次 MCP 调用 + 1 次人审**（此前 4+1 次调用 + 4 次人审 + 3 轮轮询），G3 首拦 options 缺 value 演示 agent 自修正闭环。Prisma 迁移 review_batch_id；gateway 707（+8 单测）。实现记录 docs/knowledge-base/BATCH-SUBMIT-2026-10-03.md
- 🔄 **零知识用户旅程（A/B 角色扮演）两轮完成（2026-10-03，本阶段）**：①A(纯新手,只可提问)在 studio UI 独立走通「建应用→对象→模板页面→发布→运行时提交/台账」闭环（修 5 项：表单静默无反馈/单选 UUID/发布人裸 ID/API 名拼音建议/按钮文案）；②流程画布补走——A 经 B 教学完成「审批流(条件分支+对象操作状态回写)+发布+运行时闭环」：builder 提交报修→角色任务→admin 任务中心批准→状态回写已完成、实例 COMPLETED。第二轮修 7 项：H1b 提交 toast(fetcher 层兜底)；**#10 对象操作契约断裂**(UI 写 fieldMapping、引擎读 inputsValues,serializer 四态转换+EventBridge extInfo 并入导出——配置丢失根因)；#11 FieldMapper 添加映射死循环；**#12 角色审批四连根因**(UI 角色编码→assignee 改 candidateGroups[角色ID] 下拉/引擎仅角色创建无主任务行/rolesApi 29 处 URL 缺 v1/角色列表 builder 403)；#13 已发布流程"转为草稿编辑"入口。第三轮（同日深夜）处置全部遗留并挖出 **#17 条件分支路由断裂**（edge label 契约——降级第一条出边让两轮'通过'验证碰巧全绿，驳回被误写已完成；serializer label=title 同源修复+驳回端到端复验）+allowReject 全链路强制+审批申请内容友好标签+加号常显+模式联动；gateway 701/studio 119。工程坑：flowgram extInfo 不进 toJSON、ApaasAdder 隐藏 Popover 残留 DOM、vite preview index.html 硬缓存、NestJS 类级 Guard 不能按方法豁免。gateway 699/studio 118 全绿。实现记录 docs/knowledge-base/ROLEPLAY-NEWBIE-JOURNEY-2026-10-03.md
- ✅ **P1 运维与治理补强完成（2026-10-02）**：观测事件四分类（FUNCTION_EXEC/SLOW_QUERY/PAGE_ERROR/OPEN_API_CALL，shared SSOT）+ **traceId 事件链路 ID 全链路**（pino genReqId/mixin + ALS + 错误响应 ApiError.traceId + 审计落库 + 观测事件，外部 X-Trace-Id 可串联）；云函数执行/慢查询（db 包 onSlowQuery hook，SLOW_QUERY_THRESHOLD_MS 默认 1000ms）/页面报错（ErrorBoundary 上报）/开放 API 调用四写入点；**流程效率分析**（ProcessInstance.timedOut 列 + GET /processes/analytics 完成率/平均耗时/超时数 + 监控页效率 Tab）；**权限查询调试工具**（PermissionService.explain 同语义不抛异常 + POST /permissions/debug 行级条件翻译 + 记录可见性真值验证 + studio 调试页）；审计日志对齐观测分类（AUDIT_ACTION_CATEGORIES 5 分类 SSOT + category 过滤 + 审计页分类列）；对象级搜索落地（records?keyword= 消费 searchable 标志，text 族+auto_number contains）。全局选项复用（选项集）未做、独立后排。gateway 单测 686、studio 109、db 55 全绿。实现记录 docs/knowledge-base/P1-OBSERVABILITY-GOVERNANCE-2026-10-02.md
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
