# PRD — 云函数与扩展（Phase 8）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 云函数与扩展
> 关联契约：`packages/shared/src/cloud-function/index.ts` · `apps/gateway/src/cloud-function/`
> 验收闸门：Phase 8 产品闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 模块概述

### 1.1 定位

云函数是 aPaaS 平台的代码扩展层。当可视化配置（流程节点/公式/连接器）无法满足复杂业务逻辑时，搭建者可编写 JavaScript 云函数，在 V8 Isolate 沙箱中安全执行。

- **代码编辑**：Monaco Editor，JavaScript 语法高亮 + 智能提示，Ctrl+S 保存
- **沙箱执行**：isolated-vm 创建独立 V8 Isolate，内存隔离 + 超时控制 + 无 require/process 访问
- **流程集成**：cloud_function 流程节点，支持输入参数映射 + 结果变量写入
- **发布管理**：DRAFT → PUBLISHED 状态流转，版本号自增

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 编写自定义逻辑（计算/转换/校验），突破可视化配置限制 |
| 管理员 | 沙箱隔离保证安全，超时/内存限制防止资源滥用 |
| 平台 | 标准化扩展模式，流程节点统一调用 |

### 1.3 简化项（偏离飞书，已说明理由）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 多语言 | JS + Python | ❌ 仅 JavaScript | V8 Isolate 原生支持，无需额外运行时 |
| npm 模块 | 支持 | ❌ 不实现 | 沙箱安全优先，无 require 访问 |
| HTTP 触发 | 支持 | ❌ 仅流程节点 | 入站 HTTP 由 Webhook 连接器覆盖 |
| 定时触发 | 支持 | ❌ 不实现 | 定时调度待后续 |
| 版本回滚 | 支持 | ❌ 仅版本号记录 | 简化发布模型 |
| 日志持久化 | 支持 | ❌ 仅返回执行日志 | 持久化日志待后续 |

---

## 2. 功能需求

### 2.1 云函数管理

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 8.1 | 云函数 CRUD | ✅ | 创建/查询/更新/删除，含租户隔离 |
| 8.2 | 代码编辑 | ✅ | Monaco Editor，JavaScript 语法高亮 |
| 8.3 | 输入参数定义 | ✅ | inputSchema（name/type/required/defaultValue）|
| 8.4 | 发布管理 | ✅ | DRAFT → PUBLISHED，版本号自增 |
| 8.5 | 在线测试 | ✅ | JSON 输入 → 执行 → 展示结果/日志/耗时 |
| 8.6 | 沙箱执行 | ✅ | isolated-vm V8 Isolate，128MB 内存，5s 超时 |
| 8.7 | 流程节点集成 | ✅ | cloud_function 节点，输入映射 + 结果变量写入 |

### 2.2 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/v1/apps/:appId/cloud-functions | 列出云函数 |
| POST | /api/v1/apps/:appId/cloud-functions | 创建云函数 |
| GET | /api/v1/cloud-functions/:id | 获取云函数详情（含代码）|
| PUT | /api/v1/cloud-functions/:id | 更新云函数 |
| DELETE | /api/v1/cloud-functions/:id | 删除云函数 |
| POST | /api/v1/cloud-functions/:id/publish | 发布云函数 |
| POST | /api/v1/cloud-functions/:id/invoke | 执行云函数 |

### 2.3 前端 UI

- 云函数列表页（名称/状态/版本）
- 创建/编辑弹窗（基本信息 + Monaco 代码编辑器 + 测试面板）
- 代码编辑器（vs-dark 主题，Ctrl+S 保存，自动布局）
- 测试面板（JSON 输入框 + 执行按钮 + 结果/日志展示）
- 流程节点配置（cloud_function 节点：函数选择 + 输入映射 + 结果变量）

### 2.4 函数签名

```javascript
async function handler(input, context) {
  context.log('Hello from cloud function!');
  return { message: 'success', input };
}
```

- `input`：调用方传入的参数对象（键值对）
- `context`：`{ log(msg), tenantId, appId }`，只读租户/应用信息

---

## 3. 数据模型

```
CloudFunction: id, tenantId, appId, apiName, name, description?, code(JSON),
               inputSchema(JSON?), status(DRAFT|PUBLISHED|DISABLED), version(Int),
               createdById
```

CloudFunctionCode JSON 结构：
```json
{ "source": "async function handler(input, context) { ... }", "language": "javascript" }
```

环境变量：
- `CLOUD_FUNCTION_MEMORY_LIMIT_MB`（默认 128）
- `CLOUD_FUNCTION_TIMEOUT_MS`（默认 5000）

---

## 4. 验收标准

1. ✅ 创建云函数 → 编辑代码 → 保存 → 测试执行 → 验证返回结果和日志
2. ✅ 发布云函数 → 版本号自增 → 仅 PUBLISHED 状态可执行
3. ✅ 沙箱隔离：无 require/process/全局对象访问
4. ✅ 超时控制：超过 5s 自动终止
5. ✅ 流程节点调用云函数 → 输入映射 → 结果写入流程变量
6. ✅ 云函数执行失败不阻断流程（错误信息写入输出）

> **验收状态**: ✅ 后端单元测试（CloudFunctionService.spec.ts）+ 前端 Monaco 编辑器验证 + 流程节点集成验证全部通过
