# aPaaS 平台架构总览

本文档描述平台整体架构，供所有开发 agent 参考。详细分模块设计见各 PRD/DESIGN 文档。

## 核心设计原则

1. **元数据驱动 (Metadata-Driven)**：搭建器产出的是配置/元数据 JSON，运行时引擎读取元数据动态渲染——而非生成源代码。
2. **同源 WorkflowSchema (SSOT)**：流程建模器产出单一数据源 WorkflowSchema JSON，自研状态机引擎直接消费执行，零翻译层。
3. **类型契约先行**：`packages/shared` 定义所有跨服务 DTO/接口，作为前后端与各 agent 的对接边界。
4. **开发态/运行态分离 (Dev/Prod Isolation)**：对标飞书 aPaaS 架构理念，开发态 (Builder/Studio) 的修改不直接生效到运行态 (Runtime)，必须经过「检查→发布」流程生成不可变版本快照后，运行态才读取已发布版本。详见 `docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`。

## 系统分层

```
前端 (Studio 搭建器 + Runtime 运行时)
        │ REST + WebSocket
API 网关 (NestJS) — 认证 / 多租户路由 / 权限 / 限流
        ├── 元数据服务 meta-svc  (对象/字段/页面/流程定义)
        ├── 运行时服务 runtime-svc (记录CRUD/动态查询/表达式)
        └── 流程服务 process-svc  (自研执行引擎)
                │ BullMQ
        Redis (流程队列)
        PostgreSQL
```

## 四大核心模块

| 模块 | 内核 | 说明 |
|---|---|---|
| 对象/数据建模 | JSONB 宽表存储 | 通用 records 表，object_id + data JSONB + GIN 索引 |
| 页面搭建器 | 元数据 Schema + 视图模型 | 组件树 + 状态树 + 表达式绑定，运行时渲染器解析 |
| 流程引擎 | **自研**（状态机 + BullMQ） | TS全栈进程内集成；单模式 UI（flowgram.ai） |
| 权限多租户 | tenant_id 行级隔离 + RLS | RBAC 五级权限 |

## 流程引擎架构（重点）

**决策背景**：放弃 Camunda 8（Java 引擎 + 4 个独立服务 + 跨语言 gRPC + 翻译层脆弱点），
选择自研（类飞书思路），与 aPaaS 零摩擦集成。

- **层1 执行内核**：自研状态机引擎（NestJS + BullMQ），直接消费 WorkflowSchema JSON。
  - 基于 token 流模型，支持节点类型注册（NodeExecutor 模式）。
  - BullMQ 提供异步执行、重试、状态持久化。
- **层2 数据层**：编辑器直接产出 WorkflowSchema JSON（flowgram.ai Fixed Layout 原生格式），自研引擎原生消费，零翻译层。
- **层3 编辑器 UI**：基于 flowgram.ai Fixed Layout 的单模式可视化编辑器。

## 技术栈速查
见根 `package.json` 与各子包 `package.json`。核心：pnpm monorepo + Turborepo / React+Vite / NestJS+Prisma / PostgreSQL / Redis / BullMQ。

## 应用生命周期与发布流程（Phase 9 — 规划中）

> 调研基准: `docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`

对标飞书 aPaaS 的应用生命周期管理，核心实现「开发态/运行态分离 + 版本化发布」：

```
应用 (Application)
  ├── 开发环境 (develop lane)
  │   ├── 页面/对象/流程/权限/云函数 (可实时编辑)
  │   └── 变更追踪 (ChangeLog 自动记录)
  ├── 沙箱环境 (sandbox) — 测试验证
  └── 生产环境 (production)
      └── 已发布版本 (不可变快照)
          ├── v0.1.0 (AppVersion.snapshot JSON)
          └── v1.0.0 (可回滚)
```

### 发布流程

```
开发态修改 → 检查(预检) → 填写版本号+更新说明 → 生成变更清单 → 发布 → 生成快照 → 上架运行态
```

### 核心数据模型（待实现）

| 模型 | 用途 |
|------|------|
| `AppVersion` | 发布版本记录（版本号/更新说明/完整配置快照/状态/变更清单） |
| `ChangeLog` | 开发态变更追踪（模块/实体/变更类型/变更人/时间） |
| `AppCheck` | 预检记录（检查结果/问题列表/检查人/时间） |

### 环境隔离原则

- Studio (构建器) 操作开发态数据 — 实时编辑
- Runtime UI 只读取已发布版本 — 通过 getBySlug API 返回快照
- 发布操作 = 收集所有模块开发态配置 → 生成不可变 JSON 快照 → 写入 AppVersion
- 运行态用户看不到未发布的变更
