# Phase 5 连接器与集成 — 完成记录 2026-08-22

> 基于 ROADMAP-UPDATE-2026-08-06 Phase 5 计划，连接器对齐度从 5% 提升至 ~70%。

## 实现范围

### 对齐项（已实现）
- ✅ 连接器实体 + CRUD 管理（创建/配置/测试/调用）
- ✅ 内置连接器：HTTP 通用连接器（出站调用）
- ✅ 内置连接器：Webhook 接收器（入站触发）
- ✅ 凭证管理（Basic Auth / API Key / Bearer Token）
- ✅ 凭证加密存储（AES-256-GCM）
- ✅ 流程节点升级：http_request 节点支持引用连接器（向后兼容）
- ✅ 前端管理 UI（列表 + 配置向导 + 调试面板 + 凭证管理）
- ✅ 权限集成（CONNECTOR 权限类型，BUILDER 角色种子数据）

### 简化项（偏离飞书，理由说明）
- ⚠️ 数据库连接器暂不实现 — HTTP 连接器可覆盖大部分 REST API 场景
- ⚠️ OAuth2 暂不实现 — Basic Auth/API Key/Bearer Token 覆盖 80% 场景
- ⚠️ OpenAPI 导入暂不实现 — 连接器通过表单手动配置
- ⚠️ 自定义连接器市场暂不实现

## 数据模型

### Prisma 新增模型

**Connector** — 连接器实体
- id, tenantId, appId, apiName（应用内唯一）, name, description
- type（HTTP | WEBHOOK）, baseUrl, config（Json）, credentialId
- status（ACTIVE | INACTIVE）, webhookToken（Webhook 专用）
- 关联 Tenant, Application, ConnectorCredential

**ConnectorCredential** — 凭证实体
- id, tenantId, appId, name, type（BASIC | API_KEY | BEARER）
- data（Json，AES-256-GCM 加密存储）
- 可被多个连接器引用

### 迁移
- `20260822070811_add_connector_models` — 创建 connectors + connector_credentials 表

## 后端架构

### 模块结构（`apps/gateway/src/connector/`）
| 文件 | 职责 |
|------|------|
| crypto.util.ts | AES-256-GCM 加解密 |
| credential.service.ts | 凭证 CRUD + 加解密 |
| credential.controller.ts | 凭证 API（4 端点） |
| connector.service.ts | 连接器 CRUD + 测试 + 调用 |
| connector.controller.ts | 连接器 API（7 端点，PermissionGuard） |
| connector-call.service.ts | HTTP 执行引擎（URL 构建 + 凭证注入 + 模板插值 + 超时） |
| webhook.controller.ts | 公开 Webhook 接收端点（token 验证 + 流程触发） |
| connector.module.ts | 模块定义（forwardRef 解决循环依赖） |

### API 端点
- 连接器：GET/POST `/apps/:appId/connectors`、GET/PUT/DELETE `/connectors/:id`、POST `/connectors/:id/test`、POST `/connectors/:id/invoke`
- 凭证：GET/POST `/apps/:appId/credentials`、PUT/DELETE `/credentials/:id`
- Webhook：ANY `/webhooks/:token`（公开端点，token 验证）

### 流程节点升级
- http_request 执行器升级为双模式：connectorId 存在 → ConnectorCallService 调用；不存在 → 直连 fetch（向后兼容）

## 前端

### 新增文件
- `api/connectors.ts` — connectorsApi + credentialsApi（11 个方法）
- `pages/ConnectorList.tsx` — 连接器管理页（双 Tab）
- `components/connector/ConnectorFormModal.tsx` — 创建/编辑表单
- `components/connector/ConnectorTestPanel.tsx` — 调试面板
- `components/connector/CredentialFormModal.tsx` — 凭证创建/编辑

### 升级文件
- `router.tsx` + `StudioLayout.tsx` — 路由 + 侧边栏导航
- `HttpRequestConfigForm.tsx` — 连接器选择器
- `PermissionRuleEditor.tsx` — CONNECTOR 目标列表

## 环境变量
- `CONNECTOR_ENCRYPTION_KEY` — 32 字节 hex 密钥（Joi 校验必填）
- 已同步 .env.example、docker-compose.yml、CI

## 测试验证

### API 端到端测试（全部通过）
| 测试项 | 结果 |
|--------|------|
| 创建 HTTP 连接器（3 个操作定义） | ✅ |
| 调用 GET /posts（返回 100 篇文章） | ✅ |
| 路径参数替换 GET /posts/{id} | ✅ |
| POST 创建文章（返回 201, ID=101） | ✅ |
| 创建 Webhook 连接器（自动生成 token） | ✅ |
| Webhook 端点接收（正确返回） | ✅ |

### 浏览器 UI 测试
| 测试项 | 结果 |
|--------|------|
| 侧边栏导航 | ✅ |
| 连接器列表页（admin 可见 2 个连接器） | ✅ |
| 权限控制（builder 无权限时列表为空） | ✅ |
| 测试面板（操作选择器 + 调用按钮） | ✅ |
| 创建连接器弹窗 | ✅ |

### 工程验证
| 检查项 | 结果 |
|--------|------|
| typecheck | ✅ 11/11 |
| lint | ✅ 11/11（0 warnings） |
| test | ✅ 全部通过 |
| build | ✅ 9/9 |
| Docker build + deploy | ✅ 3 镜像 + 全部服务运行 |

## 对齐度更新

| 模块 | 更新前 | 更新后 |
|------|--------|--------|
| 连接器/集成 | 5% | 70% |
| 权限/多租户 | 85% | 86%（+CONNECTOR 权限目标列表） |
| 流程引擎 | 83% | 84%（+http_request 连接器模式） |

**整体飞书对齐度：~83% → ~85%**
