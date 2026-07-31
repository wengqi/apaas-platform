# aPaaS 低代码平台 — 项目路线图 (ROADMAP)

> 项目经理（主智能体）维护，记录各阶段进度与验收结果。

## 总体目标
复刻飞书 aPaaS 四大核心能力，流程引擎自研（类飞书思路：状态机 + BullMQ），
WorkflowSchema JSON 为单一数据源(SSOT)，BPMN 2.0 XML 仅供标准模式互操作。
流程建模双模式（bpmn-js 标准 + flowgram.ai 简化），同源 WorkflowSchema 双向互转。
TypeScript 全栈，独立 Web 应用。

## 协调模型
单一主控：主智能体兼任项目经理 + 技术负责人，唯一总调度。
每个模块走全闸门：产品经理 agent(PRD) → UI/UE agent(设计规范) → 开发 agents 并行 → QA → 验收。

---

## Phase 0 — 基础设施（✅ 已完成）
| # | 任务 | 状态 |
|---|------|------|
| 0.1 | pnpm monorepo + Turborepo + shared 类型契约 | ✅ 完成 |
| 0.2 | infra/docker-compose.yml (PG + Redis) | ✅ 完成 |
| 0.3 | Prisma schema + NestJS 骨架 (gateway + meta/runtime/process) | ✅ 完成 |
| 0.4 | 前端 Vite+React 骨架 (Studio + Runtime UI) | ✅ 完成 |
| 0.5 | Fork flowgram.ai 到 simplified 目录 (npm依赖+自建物料) | ✅ 完成 |
| 0.6 | JWT 认证+登录联调 (前后端登录链路验证) | ✅ 完成 |
| 0.7 | 验收：登录 / Docker 健康 / 流程引擎自检 / flowgram 启动 | ✅ 完成 |

**验收标准**：能登录；`docker compose up` 全组件健康(PG+Redis)；自研流程引擎状态机自检通过；flowgram fork 可本地启动。

---

## Phase 1 — 对象/数据建模（全闸门）
产品 → 设计 → 开发(后端元数据CRUD+JSONB存储+记录API / 前端对象设计器) → QA
**验收标准**：创建对象、加字段、录入查询记录。

## Phase 2 — 可视化页面搭建器（全闸门）
**验收标准**：拖拽搭建 CRUD 三件套（列表/详情/表单）并运行。

## Phase 3 — 流程引擎（全闸门，重点）⭐
产品 → 设计 → 后端(自研执行引擎+BPMN互转器) → 前端(标准bpmn-js + 简化flowgram) → QA
**验收标准**：
- 自研引擎执行基本流程(触发→节点→分支→结束)
- 简化模式画"创建记录触发通知"并执行
- 标准模式画 BPMN 流程并执行(通过 bpmn-to-workflow 转换)
- 双模式同源互转(简化↔标准切换)
- 流程监控仪表盘 + 人工任务处理

## Phase 4 — 权限与多租户（全闸门）
**验收标准**：不同角色见不同页面/数据/任务。

## Phase 5 — 打磨与集成
**验收标准**：从零搭建含对象/页面/BPMN审批流程/权限的完整应用。

---

## 变更记录
- 2026-07-31：项目启动，Phase 0 开始。
- 2026-07-31：架构决策变更——放弃 Camunda 8(Zeebe)，改为自研流程引擎(状态机+BullMQ，类飞书思路)。WorkflowSchema 为 SSOT，BPMN XML 仅供标准模式互操作。Phase 0.2 基础设施相应精简为 PG+Redis。
- 2026-07-31：Phase 0.5 策略调整——从"全量 fork Rush monorepo"改为"npm 依赖 flowgram.ai 核心包 + 自建 aPaaS 业务节点物料"，避免工具链冲突。
- 2026-07-31：Phase 0 全部完成。数据库迁移+种子用户+JWT 登录端到端验证通过。
