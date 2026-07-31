# aPaaS 平台架构总览

本文档描述平台整体架构，供所有开发 agent 参考。详细分模块设计见各 PRD/DESIGN 文档。

## 核心设计原则

1. **元数据驱动 (Metadata-Driven)**：搭建器产出的是配置/元数据 JSON，运行时引擎读取元数据动态渲染——而非生成源代码。
2. **同源 WorkflowSchema (SSOT)**：双模式流程建模器共用单一数据源 WorkflowSchema JSON，自研状态机引擎直接消费执行；BPMN 2.0 XML 仅供标准模式互操作（导入/导出/查看）。
3. **类型契约先行**：`packages/shared` 定义所有跨服务 DTO/接口，作为前后端与各 agent 的对接边界。

## 系统分层

```
前端 (Studio 搭建器 + Runtime 运行时)
        │ REST + WebSocket
API 网关 (NestJS) — 认证 / 多租户路由 / 权限 / 限流
        ├── 元数据服务 meta-svc  (对象/字段/页面/流程定义)
        ├── 运行时服务 runtime-svc (记录CRUD/动态查询/表达式)
        └── 流程服务 process-svc  (自研执行引擎 + BPMN互转器)
                │ BullMQ
        Redis (流程队列)
        PostgreSQL
```

## 四大核心模块

| 模块 | 内核 | 说明 |
|---|---|---|
| 对象/数据建模 | JSONB 宽表存储 | 通用 records 表，object_id + data JSONB + GIN 索引 |
| 页面搭建器 | 元数据 Schema + 视图模型 | 组件树 + 状态树 + 表达式绑定，运行时渲染器解析 |
| 流程引擎 | **自研**（状态机 + BullMQ） | TS全栈进程内集成；双模式 UI 同源互转 |
| 权限多租户 | tenant_id 行级隔离 + RLS | RBAC 五级权限 |

## 流程引擎架构（重点）

**决策背景**：放弃 Camunda 8（Java 引擎 + 4 个独立服务 + 跨语言 gRPC + 翻译层脆弱点），
选择自研（类飞书思路），与 aPaaS 零摩擦集成。

- **层1 执行内核**：自研状态机引擎（NestJS + BullMQ），直接消费 WorkflowSchema JSON。
  - 基于 token 流模型，支持节点类型注册（NodeExecutor 模式）。
  - 节点执行器可逐步补全 BPMN 2.0 全集元素。
  - BullMQ 提供异步执行、重试、状态持久化。
- **层2 同源中介**：
  - 简化模式：直接产出 WorkflowSchema（零翻译，flowgram fork 原生格式）。
  - 标准模式：bpmn-js 产出 BPMN XML → `bpmn-to-workflow` 转为 WorkflowSchema 执行。
  - WorkflowSchema → `workflow-to-bpmn` 转 BPMN XML（标准模式查看/编辑）。
- **层3 双模式 UI**：简化(flowgram.ai fork Fixed Layout) + 标准(bpmn-js)。

## 技术栈速查
见根 `package.json` 与各子包 `package.json`。核心：pnpm monorepo + Turborepo / React+Vite / NestJS+Prisma / PostgreSQL / Redis / BullMQ。
