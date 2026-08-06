# aPaaS 低代码平台 — 项目指令

## 项目概述

飞书 aPaaS 级低代码平台 — 对象建模 / 页面搭建器 / 自研流程引擎(双模式同源) / 多租户权限。
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
3. **WorkflowSchema SSOT**：流程引擎直接消费 JSON Schema，BPMN XML 仅互操作
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

### 提交规范

- Commit message 必须符合 Conventional Commits：`type(scope): subject`
- type：`feat/fix/refactor/perf/docs/test/chore/style/ci/revert/breaking`
- scope：`gateway/shared/db/studio/runtime-ui/auth/object/record/page/process/permission/tenant/application/notification/queue/infra/docs/config/deps`
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
- 响应格式统一 `{ ok: true, data: ... }` / `{ ok: false, error: { code, message } }`
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

## 当前阶段

- ✅ Phase 0-4 + Phase 9 核心功能已实现
- ✅ 第一阶段阻断性技术债修复已完成（2026-08-03）
- ⬜ 第二阶段前端功能补全（待开始）
- ⬜ Phase 5-8 新功能扩展（待开始）
