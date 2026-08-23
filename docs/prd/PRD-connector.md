# PRD — 连接器与集成（Phase 5）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 连接器能力
> 关联契约：`packages/shared/src/connector/index.ts` · `apps/gateway/src/connector/`
> 验收闸门：Phase 5 产品闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 模块概述

### 1.1 定位

连接器是 aPaaS 平台与外部系统集成的桥梁。通过连接器，搭建者可以：
- 配置 HTTP API 调用（出站），在流程节点中引用连接器执行外部 API
- 接收 Webhook 回调（入站），触发流程或通知
- 安全管理第三方 API 凭证（Basic / API Key / Bearer Token，AES-256-GCM 加密存储）

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 在流程中调用外部 API（如发送短信、查询物流），无需写代码 |
| 管理员 | 统一管理 API 凭证，加密存储，权限控制 |
| 平台 | 标准化集成模式，未来可扩展数据库连接器/OAuth2 |

### 1.3 简化项（偏离飞书，已说明理由）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 数据库连接器 | 支持 | ❌ 不实现 | HTTP 覆盖 REST 场景，数据库直连需求低 |
| OAuth2 | 支持 | ❌ 不实现 | Basic/APIKey/Bearer 覆盖 80% 场景 |
| OpenAPI 导入 | 支持 | ❌ 不实现 | 表单手动配置已足够 |
| 连接器市场 | 支持 | ❌ 不实现 | MVP 阶段优先核心能力 |

---

## 2. 功能需求

### 2.1 连接器管理

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 5.1 | 连接器 CRUD | ✅ | 创建/查询/更新/删除连接器，含租户隔离 |
| 5.2 | 连接器配置 | ✅ | URL + 操作定义（method/path/headers/body 模板）|
| 5.3 | 连接器测试 | ✅ | 调试面板调用操作并展示结果 |
| 5.4 | 凭证管理 | ✅ | Basic/APIKey/Bearer 三种类型，AES-256-GCM 加密 |
| 5.5 | HTTP 出站调用 | ✅ | URL 构建 + 凭证注入 + 模板插值 + 超时控制 |
| 5.6 | Webhook 入站 | ✅ | Token 验证 + 触发流程/通知 |
| 5.7 | 流程节点升级 | ✅ | http_request 节点双模式：连接器引用 / 直连 fetch |
| 5.8 | 权限集成 | ✅ | CONNECTOR 权限类型 + PermissionGuard 挂载 |

### 2.2 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/v1/apps/:appId/connectors | 列出连接器 |
| POST | /api/v1/apps/:appId/connectors | 创建连接器 |
| GET | /api/v1/connectors/:id | 获取连接器详情 |
| PUT | /api/v1/connectors/:id | 更新连接器 |
| DELETE | /api/v1/connectors/:id | 删除连接器 |
| POST | /api/v1/connectors/:id/test | 测试连接器调用 |
| GET | /api/v1/apps/:appId/credentials | 列出凭证 |
| POST | /api/v1/apps/:appId/credentials | 创建凭证 |
| PUT | /api/v1/credentials/:id | 更新凭证 |
| DELETE | /api/v1/credentials/:id | 删除凭证 |
| POST | /api/v1/webhooks/:token | Webhook 入站接收 |

### 2.3 前端 UI

- 连接器列表页（双 Tab：连接器 + 凭证）
- 连接器创建/编辑表单（类型选择 + URL + 操作定义）
- 调试面板（操作选择器 + 调用按钮 + 结果展示）
- 凭证管理（创建/编辑/删除）
- http_request 节点配置表单升级（连接器选择器）

---

## 3. 数据模型

```
Connector: id, tenantId, appId, name, type(HTTP), baseUrl, config(JSON), credentialId?
ConnectorCredential: id, tenantId, appId, name, type(BASIC/API_KEY/BEARER), data(JSON, encrypted)
```

环境变量：`CONNECTOR_ENCRYPTION_KEY`（32 字节 hex，AES-256-GCM）

---

## 4. 验收标准

1. ✅ 创建 HTTP 连接器 → 在流程中调用 → 验证返回数据
2. ✅ Webhook 入站 → 触发流程
3. ✅ 凭证加密存储，明文不可见
4. ✅ 连接器权限隔离（非授权用户不可访问）

> **验收状态**: ✅ API 端到端测试 + 浏览器 UI 验证 + Docker 部署验证全部通过
