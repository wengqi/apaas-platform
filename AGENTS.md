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

## 当前阶段

- ✅ Phase 0-4 + Phase 9 核心功能已实现
- ✅ 第一阶段阻断性技术债修复已完成（2026-08-03）
- ⬜ 第二阶段前端功能补全（待开始）
- ⬜ Phase 5-8 新功能扩展（待开始）
