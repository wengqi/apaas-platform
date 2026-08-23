# DESIGN — 连接器与集成（Phase 5）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：架构师（主智能体）
> 对标：飞书 aPaaS 连接器能力
> 关联契约：`packages/shared/src/connector/index.ts` · `apps/gateway/src/connector/`
> 验收闸门：Phase 5 技术闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 架构设计

### 1.1 组件关系图

```
┌─────────────────────────────────────────────────────────┐
│                      Studio 前端                          │
│  ConnectorFormModal  ConnectorTestPanel  CredentialForm  │
│         connectorsApi / credentialsApi (axios)           │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP /api/v1/
┌──────────────────────▼──────────────────────────────────┐
│                   Gateway (NestJS)                        │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ ConnectorCtrl   │  │ CredentialCtrl   │              │
│  │ (PermissionGuard)│  │ (JwtAuthGuard)   │              │
│  └────────┬────────┘  └────────┬─────────┘              │
│           │                     │                        │
│  ┌────────▼────────┐  ┌────────▼─────────┐              │
│  │ ConnectorService│  │ CredentialService│              │
│  │  (CRUD + test)  │  │ (CRUD + decrypt) │              │
│  └────────┬────────┘  └────────┬─────────┘              │
│           │                     │                        │
│  ┌────────▼────────────────────▼─────────┐              │
│  │       ConnectorCallService             │              │
│  │  (URL构建 → 凭证注入 → 模板插值 → fetch)│              │
│  └────────┬───────────────────────────────┘              │
│           │                                               │
│  ┌────────▼────────┐    ┌──────────────────┐            │
│  │  WebhookCtrl    │───►│  ProcessService   │            │
│  │ (公开端点)       │    │ (启动流程实例)     │            │
│  └─────────────────┘    └──────────────────┘            │
│                                                          │
│  ┌─────────────────────────────────────────┐            │
│  │  crypto.util (AES-256-GCM)              │            │
│  └─────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
              PostgreSQL (connectors / connector_credentials)
```

### 1.2 数据流

**出站调用（HTTP）**：前端表单/流程节点 → ConnectorController → ConnectorService → ConnectorCallService.invoke() → 加载凭证（CredentialService.decrypt）→ 注入 Authorization/Header → fetch(外部API) → 返回 `{ statusCode, responseBody, responseHeaders, success }`

**入站接收（Webhook）**：外部系统 → WebhookController.receive(token) → ConnectorService.findByWebhookToken → 校验 allowedMethods → 查找已发布的 WEBHOOK 触发流程 → ProcessService.startInstance（注入 triggerContext）→ 返回启动结果

---

## 2. 组件清单

### 2.1 后端（apps/gateway/src/connector/）

| 组件 | 文件 | 职责 |
|------|------|------|
| ConnectorController | `connector.controller.ts` | 连接器 CRUD + test + invoke 端点，PermissionGuard 守卫 |
| ConnectorService | `connector.service.ts` | 连接器业务逻辑，ChangeLog 记录，委托 CallService 执行 |
| ConnectorCallService | `connector-call.service.ts` | HTTP 调用引擎：URL 构建 + 路径参数替换 + 凭证注入 + 模板插值 + 超时控制 |
| CredentialController | `credential.controller.ts` | 凭证 CRUD 端点，JwtAuthGuard 守卫 |
| CredentialService | `credential.service.ts` | 凭证 CRUD + 加解密 + 使用检查（被引用时禁止删除） |
| WebhookController | `webhook.controller.ts` | 公开端点 `ANY /api/webhooks/:token`，Token 验证 + 流程触发 |
| crypto.util | `crypto.util.ts` | AES-256-GCM 加解密工具（encryptJson / decryptJson） |
| ConnectorModule | `connector.module.ts` | 模块注册，forwardRef(ProcessModule) 解决循环依赖 |

### 2.2 前端（packages/studio/src/components/connector/）

| 组件 | 文件 | 职责 |
|------|------|------|
| ConnectorFormModal | `ConnectorFormModal.tsx` | 创建/编辑连接器，HTTP/Webhook 类型切换，操作定义 Form.List |
| ConnectorTestPanel | `ConnectorTestPanel.tsx` | 调试面板：操作选择 + 手动 method/path + body + 结果展示 |
| CredentialFormModal | `CredentialFormModal.tsx` | 凭证创建/编辑，BASIC/API_KEY/BEARER 动态字段 |

### 2.3 共享契约（packages/shared/src/connector/index.ts）

`ConnectorType` / `CredentialType` / `ConnectorStatus` 枚举 · `HttpConnectorConfig` / `WebhookConnectorConfig` 配置接口 · `Connector` / `ConnectorCredential` 实体接口 · `CreateConnectorRequest` / `UpdateConnectorRequest` / `InvokeConnectorRequest` / `ConnectorCallResult` DTO

---

## 3. 关键设计决策

### 3.1 凭证独立于连接器

凭证（ConnectorCredential）是独立实体，可被多个连接器引用。删除凭证时检查引用关系，被使用则拒绝删除。列表 API 只返回元信息（id/name/type），不返回加密数据。

### 3.2 AES-256-GCM 加密

凭证数据使用 AES-256-GCM 对称加密，密钥从环境变量 `CONNECTOR_ENCRYPTION_KEY`（32 字节 hex）读取。加密格式：`base64(iv):base64(authTag):base64(ciphertext)`，GCM 模式提供完整性校验。

### 3.3 凭证注入策略

在 ConnectorCallService.applyCredential 中按类型注入：
- BASIC → `Authorization: Basic base64(user:pass)`
- API_KEY → 自定义 header（如 `X-API-Key: xxx`）
- BEARER → `Authorization: Bearer xxx`

### 3.4 Webhook Token 验证

Webhook 类型连接器创建时自动生成 `randomBytes(16).toString('hex')` token，入站 URL 为 `/api/webhooks/{token}`。无需 JWT 认证，通过 token 唯一性保证安全。

### 3.5 超时控制

HTTP 调用使用 `AbortController` + `setTimeout` 实现超时，默认 10000ms，可通过 `HttpConnectorConfig.timeout` 自定义。超时抛出 `BadRequestException`。

### 3.6 模板插值

请求体使用 `renderTemplateDotted`（复用流程引擎工具）进行模板插值，路径参数使用 `{param}` 占位符替换（如 `/users/{id}` → `/users/123`）。

---

## 4. 简化项说明（偏离飞书）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 数据库连接器 | 支持 | ❌ 未实现 | HTTP 覆盖 REST 场景，DB 直连需求低 |
| OAuth2 | 支持 | ❌ 未实现 | BASIC/API_KEY/BEARER 覆盖 80% 场景 |
| OpenAPI 导入 | 支持 | ❌ 未实现 | 表单手动配置已足够 |
| 连接器市场 | 支持 | ❌ 未实现 | MVP 阶段优先核心能力 |
| Webhook 签名验证 | 支持 | ❌ 仅 Token | URL Token 随机性足够，简化部署 |
| 凭证轮换 | 支持 | ❌ 手动更新 | 未来可扩展自动轮换 |

> **验收状态**: ✅ 后端单元测试 + 前端 UI 验证 + Docker 部署验证全部通过
