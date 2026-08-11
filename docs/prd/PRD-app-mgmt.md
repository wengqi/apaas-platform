# PRD — 应用管理与发布（Phase 9）

> 版本：v1.0 · 日期：2026-08-01 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 应用生命周期管理能力
> 关联契约：`packages/shared/src/application/index.ts` · `packages/db/prisma/schema.prisma`
> 调研基准：`docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`
> 验收闸门：Phase 9 产品闸门（ ROADMAP.md ）

---

## 1. 模块概述

### 1.1 定位

应用管理与发布是 aPaaS 平台的**交付闭环**。开发者通过构建器（Phase 1-4）搭建应用，
通过发布流程将开发态配置打包为不可变版本快照，同步到运行态供业务用户使用——
**没有发布，应用就无法交付**。

本模块是元数据驱动架构的最后一环：

```
对象建模(P1) → 页面搭建(P2) → 流程引擎(P3) → 权限(P4)
     ↓                                        ↓
     └─────── 开发态配置（实时编辑） ──────────┘
                     ↓
              检查(预检) → 发布 → 版本快照
                     ↓
              运行态（已发布版本，业务用户使用）
```

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 开发态随意修改不影响线上，发布前有预检保障质量，版本可回滚。 |
| 业务用户 | 只看到已发布版本，不受开发态变更影响，应用稳定可用。 |
| 管理员 | 发布历史可追溯，变更清单透明，支持审计和回滚。 |
| 平台 | 开发态/运行态分离，版本快照不可变，保障线上稳定性。 |

### 1.3 设计原则（与 ARCHITECTURE.md 对齐）

1. **开发态/运行态分离**：开发态 (Studio) 修改不直接生效到运行态 (Runtime)，必须经过发布流程。
2. **版本快照不可变**：每次发布生成完整 JSON 快照（页面+对象+流程+权限），写入 AppVersion，不可修改。
3. **预检前置**：发布前必须执行检查，有未修复问题则禁止发布。
4. **变更可追溯**：系统自动追踪开发态变更，发布时生成变更清单。

---

## 2. 核心概念

| 概念 | 定义 | 对标飞书 |
|---|---|---|
| **版本快照 (Snapshot)** | 发布时收集所有模块开发态配置生成的不可变 JSON，含对象/页面/流程/权限定义。 | publishedSnapshot |
| **版本号 (Version)** | 语义化版本号（如 0.1.0），每次发布递增，首次发布为 0.1.0。 | 版本号 |
| **预检 (Check)** | 发布前对应用配置完整性的自动检查，发现问题则阻止发布。 | 检查 |
| **变更清单 (ChangeSet)** | 自上次发布以来的所有开发态变更列表，按模块分类展示。 | 变更内容 |
| **变更追踪 (ChangeLog)** | 系统自动记录的每次开发态操作（创建/更新/删除），含操作人、时间、描述。 | 开发动态 |
| **发布历史 (Publish History)** | 所有发布版本记录，含版本号、说明、状态、发布人、时间，支持回滚。 | 发布历史 |
| **环境隔离** | 开发态数据 vs 生产态数据隔离，runtime-ui 只读已发布版本。 | develop lane / production |

### 2.1 应用状态流转

```
DRAFT ──发布──→ PUBLISHED ──归档──→ ARCHIVED
  ↑                  │
  │                  ├──修改──→ PUBLISHED（版本递增）
  │                  └──回滚──→ PUBLISHED（恢复到历史版本）
  └──新建──→ DRAFT
```

| 状态 | 含义 | 可执行操作 |
|---|---|---|
| `DRAFT` | 开发中，未发布过或已回滚到初始状态 | 编辑、检查、发布 |
| `PUBLISHED` | 已发布，运行态可用 | 编辑（开发态）、检查、发布新版本、回滚、归档 |
| `ARCHIVED` | 已归档，运行态不可用 | 仅查看 |

### 2.2 版本号规则

- 首次发布：`0.1.0`
- 后续发布：自动递增 patch 版本（`0.1.0` → `0.1.1` → `0.1.2`）
- 支持手动修改版本号（遵循 `x.y.z` 语义化格式）
- 版本号在应用内唯一

---

## 3. 功能清单（按优先级分级）

> **P0** = Phase 9 必须 · **P1** = Phase 9 尽量做 · **P2** = 后续迭代

### 3.1 应用发布流程

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| 9.1 | **发布快照生成** | 收集应用下所有对象(ObjectMeta+字段)、页面(PageMeta+schema)、流程(ProcessDef+workflowSchema)、权限规则(Role+PermissionRule)的开发态配置，序列化为完整 JSON 快照 | P0 |
| 9.2 | **版本管理** | 每次发布创建 AppVersion 记录（版本号/说明/快照/变更清单/状态），Application.version 递增，status 置为 PUBLISHED | P0 |
| 9.3 | **预检机制** | 发布前自动检查：页面是否绑定了不存在的对象、流程节点是否引用了不存在的变量、必填字段是否配置完整等。有问题则阻止发布 | P0 |
| 9.4 | **发布向导 UI** | 三步向导：① 填写版本号+更新说明 ② 查看自动生成的变更清单 ③ 确认发布。底部「下一步」按钮在必填项完成前 disabled | P0 |
| 9.5 | **预检面板 UI** | 构建器顶部「检查」按钮 → 打开检查面板 → 「立即检查」按钮触发异步检查 → 显示进度 → 展示问题列表或「暂无问题」 | P0 |
| 9.6 | **发布历史页面** | 表格展示：版本号/描述/状态/发布人/申请时间/发布时间/操作（回滚/查看详情） | P0 |
| 9.7 | **版本回滚** | 选择历史版本，将 publishedSnapshot 恢复为该版本快照，创建新的 AppVersion 记录（状态标记为 ROLLED_BACK 的源版本 + 新的 PUBLISHED 版本） | P0 |
| 9.8 | **变更清单生成** | 对比当前开发态配置与上次发布快照，自动生成变更列表（新增/更新/删除），按模块分类 | P1 |
| 9.9 | **变更追踪记录** | 在开发态操作（创建/更新/删除对象/页面/流程/权限）时自动写入 ChangeLog 记录 | P1 |
| 9.10 | **发布后状态同步** | 发布后 Application.status → PUBLISHED，Application.publishedAt 更新，runtime-ui 可访问 | P0 |

### 3.2 环境隔离

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| 9.11 | **runtime-ui 只读已发布版本** | 页面 getBySlug API 返回 publishedSnapshot 中的页面 schema，而非开发态 PageMeta.schema | P0 |
| 9.12 | **运行态数据隔离** | 开发态操作记录不影响生产态数据；生产态数据由运行态用户通过 runtime-ui 操作 | P1 |
| 9.13 | **预览模式** | 开发者在 Studio 预览模式下查看开发态效果（已有，无需新增） | ✅ 已有 |

### 3.3 应用创建流程完善

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| 9.14 | **命名空间自动生成** | 创建应用时自动生成 `package_xxxxxx__c` 格式的 apiName，用户可修改 | P0 |
| 9.15 | **应用图标选择** | 创建表单提供预设图标选择器 + 颜色选择 | P1 |
| 9.16 | **预置系统对象** | 创建应用后自动创建「用户」和「部门」系统对象（含系统字段） | P1 |
| 9.17 | **预置角色** | 创建应用后自动创建「全部权限角色」和「全局只读角色」 | P1 |
| 9.18 | **异步创建反馈** | 创建应用后显示进度反馈（可选「后台运行」），完成后自动进入构建器 | P2 |

### 3.4 应用管理后台

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| 9.19 | **应用概览页** | 展示应用基本信息（名称/状态/命名空间/描述/所有者/创建时间）+ 运营数据（对象数/页面数/流程数） | P1 |
| 9.20 | **环境信息页** | 展示开发环境/生产环境信息（版本号、最后发布时间、当前状态） | P2 |
| 9.21 | **审计日志页** | 展示应用级操作审计日志（发布/回滚/权限变更等） | P2 |

---

## 4. 详细规格

### 4.1 发布快照结构 (publishedSnapshot)

发布时生成的 JSON 快照结构：

```typescript
interface AppSnapshot {
  /** 快照元信息 */
  meta: {
    appId: string;
    appName: string;
    apiName: string;
    version: string;       // 如 "0.1.0"
    publishedAt: string;   // ISO timestamp
    publishedBy: string;   // userId
  };
  /** 对象定义（含字段） */
  objects: Array<{
    id: string;
    apiName: string;
    name: string;
    fields: Array<{
      id: string;
      apiName: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      isRequired: boolean;
      isUnique: boolean;
      isSystem: boolean;
    }>;
    views: Array<{
      id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
    }>;
  }>;
  /** 页面定义（含 schema） */
  pages: Array<{
    id: string;
    apiName: string;
    name: string;
    type: string;
    schema: Record<string, unknown>;
    objectId?: string;
  }>;
  /** 流程定义（含 workflowSchema） */
  processes: Array<{
    id: string;
    apiName: string;
    name: string;
    workflowSchema: Record<string, unknown>;
    triggerType: string;
  }>;
  /** 权限定义 */
  permissions: {
    roles: Array<{
      id: string;
      name: string;
      apiName: string;
      rules: Array<{
        id: string;
        permissionType: string;
        action: string;
        conditions?: Record<string, unknown>;
        fieldScope?: string[];
      }>;
    }>;
  };
}
```

### 4.2 预检规则

| 检查项 | 规则 | 严重级别 |
|--------|------|---------|
| 页面绑定对象存在性 | 页面配置的 objectId 在对象列表中存在 | ERROR（阻止发布） |
| 流程触发器配置完整性 | 流程的 triggerType 不为空，触发节点配置完整 | ERROR |
| 流程节点引用有效性 | 条件分支/赋值节点引用的变量/字段存在 | ERROR |
| 对象字段配置完整性 | 必填字段有默认值，关联对象字段的目标对象存在 | ERROR |
| 角色权限规则完整性 | 权限规则的目标资源存在 | WARNING |
| 页面组件事件配置 | 事件动作引用的对象/流程存在 | WARNING |
| 未发布资源检查 | 是否存在已创建但未配置完成的资源 | INFO |

预检结果结构：

```typescript
interface CheckResult {
  status: 'PASS' | 'FAIL';
  issues: Array<{
    level: 'ERROR' | 'WARNING' | 'INFO';
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION';
    entityId: string;
    entityName: string;
    message: string;
    suggestion?: string;
  }>;
  checkedAt: string;  // ISO timestamp
  checkedBy: string;  // userId
}
```

### 4.3 变更清单结构

```typescript
interface ChangeSet {
  /** 自上次发布的变更，按模块分组 */
  modules: Array<{
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION' | 'FUNCTION';
    changes: Array<{
      entityId: string;
      entityName: string;
      changeType: 'CREATE' | 'UPDATE' | 'DELETE';
      changedBy: string;
      changedAt: string;
      description: string;
    }>;
  }>;
  /** 与上次发布的版本对比 */
  baselineVersion: string | null;  // null = 首次发布
}
```

### 4.4 发布向导交互流程

```
点击「发布」按钮
  ↓
弹出提示：「发布并上架」+ 两个选项
  ├── 「查看变更」→ 打开变更清单对话框（可选）
  └── 「去发布」→ 进入发布向导
        ↓
  ┌─── 发布向导 ───────────────────────────┐
  │                                         │
  │  左侧导航          右侧主区域            │
  │  ├─ 版本信息       ├─ 版本号输入框       │
  │  │  ├─ 版本号      │  (预填 x.y.z)       │
  │  │  ├─ 更新说明    ├─ 更新说明文本框     │
  │  │  └─ 变更内容    │  (必填, 500字符)    │
  │  │    ├─ 云函数    ├─ 变更内容（自动）   │
  │  │    ├─ 记录权限  │  按模块分类表格     │
  │  │    └─ 角色      │                     │
  │  └─                └─ [下一步] 按钮      │
  │                      (必填项完成前禁用)  │
  └─────────────────────────────────────────┘
        ↓ 点击「下一步」
  确认发布 → 执行发布 → 显示成功 → 返回构建器
```

### 4.5 发布历史页面

```
┌──────────────────────────────────────────────────────────────┐
│  发布历史                                                     │
├──────────┬──────────┬──────────┬────────┬────────┬──────────┤
│ 版本号    │ 描述      │ 状态      │ 发布人  │ 发布时间 │ 操作     │
├──────────┼──────────┼──────────┼────────┼────────┼──────────┤
│ 0.2.0    │ 修复bug   │ 已发布    │ admin  │ 08-02  │ 回滚 详情│
│ 0.1.0    │ 首次发布   │ 已回滚    │ admin  │ 08-01  │ 详情     │
└──────────┴──────────┴──────────┴────────┴────────┴──────────┘
```

---

## 5. API 契约

### 5.1 发布相关 API

```
POST   /api/apps/:appId/check
  → 触发预检，返回 CheckResult

GET    /api/apps/:appId/checks
  → 获取预检记录列表

GET    /api/apps/:appId/changes
  → 获取未发布的变更清单 (ChangeSet)

POST   /api/apps/:appId/publish
  Body: { version: string, description: string }
  → 执行发布，返回 AppVersion

GET    /api/apps/:appId/versions
  → 获取发布版本列表

GET    /api/apps/:appId/versions/:versionId
  → 获取版本详情（含快照）

POST   /api/apps/:appId/versions/:versionId/rollback
  → 回滚到指定版本
```

### 5.2 应用创建完善

```
POST   /api/apps
  Body: { name: string, description?: string, icon?: string, color?: string }
  → apiName 自动生成，无需前端传入
  → 返回 Application（含自动生成的 apiName）
```

### 5.3 运行态隔离

```
GET    /api/apps/:appId/pages/slug/:slug
  → 修改：返回 publishedSnapshot 中的页面 schema（而非 PageMeta.schema）
  → 若应用未发布（无 publishedSnapshot），返回 404
```

---

## 6. 数据模型变更

### 6.1 新增模型

```prisma
/// 应用发布版本 — 每次发布生成一条不可变记录。
model AppVersion {
  id            String   @id @default(cuid())
  tenantId      String   @map("tenant_id")
  appId         String   @map("app_id")
  versionNumber String   // 如 "0.1.0"
  description   String   // 更新说明
  snapshot      Json     // 完整应用配置快照 (AppSnapshot JSON)
  changeSet     Json?    // 变更清单 (ChangeSet JSON)
  status        AppVersionStatus @default(PUBLISHED)
  publishedBy   String   @map("published_by")
  publishedAt   DateTime @default(now()) @map("published_at")

  tenant        Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application   Application @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([appId])
  @@unique([appId, versionNumber])
  @@map("app_versions")
}

enum AppVersionStatus {
  PUBLISHED
  ROLLED_BACK
}

/// 开发态变更追踪 — 记录每次开发态操作。
model ChangeLog {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  appId             String   @map("app_id")
  module            String   // PAGE | OBJECT | PROCESS | PERMISSION | FUNCTION
  entityType        String   // ObjectMeta | PageMeta | ProcessDef | Role
  entityId          String   @map("entity_id")
  entityName        String?  @map("entity_name")
  changeType        String   // CREATE | UPDATE | DELETE
  changedBy         String   @map("changed_by")
  changeDescription String?  @map("change_description")
  changedAt         DateTime @default(now()) @map("changed_at")

  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application       Application @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([appId])
  @@index([appId, module])
  @@map("change_logs")
}

/// 应用预检记录 — 记录每次预检的结果。
model AppCheck {
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  appId        String   @map("app_id")
  result       String   // PASS | FAIL
  issues       Json?    // 问题列表 JSON
  checkedBy    String   @map("checked_by")
  checkedAt    DateTime @default(now()) @map("checked_at")

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application  Application @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([appId])
  @@map("app_checks")
}
```

### 6.2 修改现有模型

```prisma
model Application {
  // ... 已有字段 ...
  // 新增关联
  versions    AppVersion[]
  changeLogs  ChangeLog[]
  checks      AppCheck[]
}

model Tenant {
  // ... 已有字段 ...
  // 新增关联
  appVersions AppVersion[]
  changeLogs  ChangeLog[]
  appChecks   AppCheck[]
}

model AuditLog {
  // 新增 appId 字段，支持应用级审计
  appId       String?  @map("app_id")
}
```

---

## 7. 验收标准

### 7.1 核心验收场景

```
1. 创建应用 → 系统自动生成 apiName（package_xxxxxx 格式）
2. 在构建器中创建对象、页面、流程（开发态编辑）
3. 点击「检查」→ 预检通过（暂无问题）
4. 点击「发布」→ 进入发布向导
5. 填写版本号（0.1.0）和更新说明 → 查看变更清单 → 点击「下一步」
6. 发布成功 → 应用状态变为 PUBLISHED
7. 在 runtime-ui 中访问应用 → 页面正常渲染（读取已发布快照）
8. 在 Studio 中修改页面（开发态）→ runtime-ui 中的页面不变（未发布）
9. 再次发布（0.2.0）→ runtime-ui 更新为新版本
10. 在发布历史中回滚到 0.1.0 → runtime-ui 恢复为旧版本
```

### 7.2 预检验收

```
1. 创建页面绑定不存在的对象 → 预检报告 ERROR
2. 创建流程节点引用不存在的变量 → 预检报告 ERROR
3. 预检有 ERROR 时 → 「发布」按钮禁用或提示需修复
4. 修复后重新检查 → 通过
```

### 7.3 环境隔离验收

```
1. 应用未发布 → runtime-ui 访问返回 404
2. 应用已发布 → runtime-ui 正常渲染
3. 发布后修改开发态 → runtime-ui 不受影响
4. 回滚到旧版本 → runtime-ui 恢复旧版本内容
```

---

## 8. 不做（Out of Scope）

以下功能在 Phase 9 中**不实现**，留待后续阶段：

| 功能 | 原因 | 后续阶段 |
|---|---|---|
| 沙箱环境 (sandbox) | 当前只有开发态/生产态，沙箱为第三环境 | Phase 10+ |
| 应用安装包导出 | 类似飞书的「生成安装包链接」 | Phase 10+ |
| 自定义域名 | 运营级功能 | Phase 10+ |
| 运营报表（活跃用户数/存储空间） | 需要数据采集基础 | Phase 7 |
| MCP 服务 / Open API 开放 | 依赖连接器模块 | Phase 5 |
| 应用模板市场 | 依赖方案中心 | Phase 10+ |
| 多语言支持 | 非核心闭环 | Phase 10 |
| 审批发布流程（需上级审批） | 当前为直接发布 | Phase 10+ |
