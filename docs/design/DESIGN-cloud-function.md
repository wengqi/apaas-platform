# DESIGN — 云函数与扩展（Phase 8）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：架构师（主智能体）
> 对标：飞书 aPaaS 云函数与扩展
> 关联契约：`packages/shared/src/cloud-function/index.ts` · `apps/gateway/src/cloud-function/`
> 验收闸门：Phase 8 技术闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 架构设计

### 1.1 组件关系图

```
┌─────────────────────────────────────────────────────────┐
│                     Studio 前端                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ CloudFunctionFormModal                           │    │
│  │   ├─ 基本信息 Form                               │    │
│  │   ├─ CloudFunctionEditor (Monaco, vs-dark)      │    │
│  │   └─ 测试面板 (JSON input → 结果展示)            │    │
│  └─────────────────────────────────────────────────┘    │
│         cloudFunctionsApi (axios)                        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP /api/v1/
┌──────────────────────▼──────────────────────────────────┐
│                   Gateway (NestJS)                        │
│                                                          │
│  ┌─────────────────────────────────────────┐            │
│  │ CloudFunctionController                  │            │
│  │   (JwtAuthGuard)                         │            │
│  └────────────────┬────────────────────────┘            │
│                   │                                      │
│  ┌────────────────▼────────────────────────┐            │
│  │ CloudFunctionService                     │            │
│  │   CRUD + publish (version++) + invoke    │            │
│  │   ChangeLog 记录                          │            │
│  └────────────────┬────────────────────────┘            │
│                   │                                      │
│  ┌────────────────▼────────────────────────┐            │
│  │ CloudFunctionRunner (沙箱引擎)            │            │
│  │                                          │            │
│  │  ┌──────────────────────────────────┐   │            │
│  │  │   isolated-vm (V8 Isolate)       │   │            │
│  │  │                                  │   │            │
│  │  │  context = { tenantId, appId }  │   │            │
│  │  │  __logRef → 主进程 log()         │   │            │
│  │  │  input = { ... }                │   │            │
│  │  │  handler(input, context) → ret  │   │            │
│  │  │  __resolve(result)              │   │            │
│  │  │                                  │   │            │
│  │  │  memoryLimit: 128MB             │   │            │
│  │  │  timeout: 5000ms                │   │            │
│  │  └──────────────────────────────────┘   │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  ┌──────────────────────────────────────────┐           │
│  │ CloudFunctionExecutor (流程节点)           │           │
│  │   type = 'cloud_function'                │           │
│  │   inputMapping → invoke → resultVariable │           │
│  └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
              PostgreSQL (cloud_functions)
```

### 1.2 数据流

**手动测试**：前端 CloudFunctionFormModal → `POST /cloud-functions/:id/invoke` → CloudFunctionService.invoke（校验 PUBLISHED）→ CloudFunctionRunner.execute → 创建 V8 Isolate → 注入 context/input/log → 编译执行 wrappedCode → Promise.race（result vs timeout）→ 返回 `{ success, result, logs, durationMs }`

**流程节点调用**：ProcessExecutor → CloudFunctionExecutor.execute → 从 ctx.node.data 读取 cloudFunctionId + inputMapping → resolveVariable 构建输入 → CloudFunctionService.invoke → 结果写入 ctx.variables（resultVariable）→ 失败不阻断流程

---

## 2. 组件清单

### 2.1 后端（apps/gateway/src/cloud-function/）

| 组件 | 文件 | 职责 |
|------|------|------|
| CloudFunctionController | `cloud-function.controller.ts` | CRUD + publish + invoke 端点，JwtAuthGuard |
| CloudFunctionService | `cloud-function.service.ts` | 业务逻辑：CRUD + 发布（version++）+ 执行委托 + ChangeLog |
| CloudFunctionRunner | `cloud-function.runner.service.ts` | 沙箱执行引擎：isolated-vm V8 Isolate + 内存/超时限制 |
| CloudFunctionModule | `cloud-function.module.ts` | 模块注册 |

### 2.2 流程节点执行器（apps/gateway/src/process/node-executors/）

| 组件 | 文件 | 职责 |
|------|------|------|
| CloudFunctionExecutor | `cloud-function.executor.ts` | 流程节点 `cloud_function` 类型执行器，输入映射 + 结果变量写入 |

### 2.3 前端（packages/studio/src/components/cloud-function/）

| 组件 | 文件 | 职责 |
|------|------|------|
| CloudFunctionFormModal | `CloudFunctionFormModal.tsx` | 创建/编辑弹窗：基本信息 + 代码编辑 + 测试面板 |
| CloudFunctionEditor | `CloudFunctionEditor.tsx` | Monaco Editor 封装，vs-dark 主题，Ctrl+S 保存 |

### 2.4 共享契约（packages/shared/src/cloud-function/index.ts）

`CloudFunctionStatus` / `CloudFunctionLanguage` 枚举 · `CloudFunctionCode` / `CloudFunctionInputParam` 接口 · `CloudFunction` 实体接口 · `CreateCloudFunctionRequest` / `UpdateCloudFunctionRequest` / `InvokeCloudFunctionRequest` / `CloudFunctionCallResult` DTO

---

## 3. 关键设计决策

### 3.1 isolated-vm V8 Isolate 沙箱

使用 `isolated-vm` 库创建独立 V8 Isolate，而非 `vm` 模块或 `new Function`。优势：
- **内存隔离**：独立堆，无法访问主进程内存
- **资源限制**：memoryLimit（128MB）+ timeout（5000ms）硬限制
- **无全局访问**：无 require/process/全局对象，仅注入受限 context

### 3.2 异步结果传递机制

Isolate 内代码可能返回 Promise。通过注入 `__resolve` / `__reject` 回调函数，在 wrappedCode 中将 handler 返回值（同步或异步）传递回主进程。主进程使用 `Promise.race([resultPromise, timeoutPromise])` 等待结果，超时自动 reject。

### 3.3 日志收集

通过 `ivm.Reference` 包装主进程的 log 函数，注入为 `__logRef`。Isolate 内 `context.log()` 通过 `__logRef.applySync()` 转发到主进程，收集到 `logs[]` 数组。日志在执行结果中返回，不持久化。

### 3.4 发布门控

仅 PUBLISHED 状态的云函数可执行。发布操作将 status 从 DRAFT 改为 PUBLISHED 并 version++。未发布函数调用时抛出 `BadRequestException`。

### 3.5 流程节点失败不阻断

CloudFunctionExecutor 中，云函数执行失败时返回 `{ output: { success: false, error, ... } }` 而非抛出异常。流程继续执行，错误信息可通过 output 访问。设计理由：云函数是扩展逻辑，不应阻断主流程。

### 3.6 输入参数映射

流程节点通过 `inputMapping`（`{ paramName: varPath }`）将流程变量映射到云函数输入。支持 `global.fieldName` / `nodeId.output.field` 路径解析。无 inputMapping 时传入整个 variables 作为 input。

---

## 4. 简化项说明（偏离飞书）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 多语言 | JS + Python | ❌ 仅 JavaScript | V8 Isolate 原生支持，无需额外运行时 |
| npm 模块 | 支持 | ❌ 不实现 | 沙箱安全优先，无 require 访问 |
| HTTP 触发 | 支持 | ❌ 仅流程节点 | 入站 HTTP 由 Webhook 连接器覆盖 |
| 定时触发 | 支持 | ❌ 不实现 | 定时调度待后续 |
| 版本回滚 | 支持 | ❌ 仅版本号记录 | 简化发布模型 |
| 日志持久化 | 支持 | ❌ 仅返回执行日志 | 持久化日志待后续 |
| 调试器 | 断点调试 | ❌ 仅日志输出 | isolated-vm 不支持断点 |

> **验收状态**: ✅ CloudFunctionService 单元测试 + Monaco 编辑器验证 + 沙箱隔离验证 + 流程节点集成验证全部通过
