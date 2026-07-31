# PRD — 权限与多租户（Phase 4）

> 版本：v1.0 · 日期：2026-07-31 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 权限与多租户（五级权限 / 表列行人四粒度 / 角色与组织 / 租户隔离）
> 关联契约：`packages/shared/src/permission/index.ts` · `packages/db/prisma/schema.prisma`
> 关联调研：`docs/research/RESEARCH-feishu-apaas-full.md`（E 节权限与多租户）
> 验收闸门：Phase 4 产品闸门（ `ROADMAP.md` 任务 4.0 ）

---

## 1. 模块概述

### 1.1 定位

权限与多租户模块是 aPaaS 低代码平台的**安全底座**——平台核心模块。它为对象建模、页面搭建器、
流程引擎等所有业务模块提供统一的访问控制能力，精确控制不同角色和组织下的用户"能看到什么页面、
能操作哪些数据、能发起/参与哪些流程、能访问哪些字段"。

权限模块向下消费已有模块的元数据（对象/页面/流程定义），向上为各业务 API 提供权限守卫与
行级数据过滤：

```
对象建模(P1) ──对象/字段元数据──▶ 数据模型权限(对象+字段级)
页面搭建器(P2) ──页面元数据──────▶ 页面权限
流程引擎(P3) ──流程/任务定义────▶ 流程权限(触发/审批/任务分配)
权限模块(本模块) ──权限规则──────▶ 各业务 API 守卫 + 行级过滤
权限模块(本模块) ──组织架构──────▶ 用户/角色/部门管理
```

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 管理员 | 通过角色 + 组织可视化配置权限，无需写代码即可实现精细化的数据隔离与访问控制。 |
| 搭建者 | 在应用内定义应用级角色和权限规则，发布后自动生效，与搭建产物同源管理。 |
| 业务用户 | 只看到被授权的页面和数据，审批任务自动派发到本人，数据安全有保障。 |
| 平台 | 多租户行级隔离 + RBAC + ABAC 条件混合模型，满足企业级安全合规要求。 |

### 1.3 架构决策（与 ARCHITECTURE.md 对齐）

**采用 RBAC + ABAC 混合模型**。决策背景：纯 RBAC 无法表达行级条件（"只能看自己创建的记录"），
纯 ABAC 性能开销大且配置复杂。飞书 aPaaS 采用"角色 + 条件表达式"混合模型，本平台对齐此设计：

```
┌─────────────────────────────────────────────────────────────────┐
│ 权限配置层（Studio UI）                                          │
│  角色管理 · 权限规则配置 · 组织授权 · 用户-角色绑定              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ PermissionRule (JSON 规则集)
┌──────────────────────────▼──────────────────────────────────────┐
│ 权限引擎层（gateway · PermissionService）                        │
│  PermissionGuard 守卫 · 权限求值 · 行级条件注入 · 字段级裁剪      │
│  权限缓存（角色→规则集预编译）                                    │
└──────┬───────────────┬───────────────┬───────────────┬──────────┘
       │               │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│ 页面权限    │ │ 记录权限    │ │ 流程权限    │ │ 数据模型权限│
│ (页面可见性)│ │ (行级过滤)  │ │ (触发/审批) │ │ (对象/字段) │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**核心原则**：
1. **权限规则为 SSOT**：权限配置存为 `PermissionRule` 记录，权限引擎统一消费，不散落在各业务模块。
2. **守卫 + 过滤双模式**：粗粒度（页面/对象/流程）用 Guard 拦截；细粒度（记录行级/字段列级）用查询注入。
3. **角色优先，条件补充**：先按角色判定是否有权限（RBAC），再按条件表达式过滤可见数据（ABAC）。
4. **拒绝优先（Deny-overrides）**：同一资源多条规则冲突时，DENY 优先于 ALLOW，确保安全。
5. **租户隔离为底线**：所有查询自动注入 `tenant_id` 过滤，权限规则在此基础上做更细粒度控制。

---

## 2. 核心概念

| 概念 | 定义 | 类比 |
|---|---|---|
| **五级权限** | 页面级、记录级（行级）、流程级、数据模型级（对象+字段级）、连接器级——五种权限控制维度。 | 飞书 aPaaS 五级权限体系 |
| **四粒度** | 表级（对象整体）、列级（字段）、行级（记录）、人员级（动态针对特定人员）——数据权限的四个控制粒度。 | 飞书"表/列/行/人的动态权限" |
| **系统角色** | 平台内置的租户级角色（ADMIN/BUILDER/END_USER），不可删除，适用于所有应用。 | 飞书内置角色 |
| **应用角色** | 在应用内自定义的角色，仅对该应用生效，搭建者可创建和配置。 | 飞书应用级角色 |
| **权限规则 (PermissionRule)** | 一条权限配置：哪个角色对哪个资源有什么动作，是否附带行级条件。 | RBAC + ABAC 规则 |
| **行级条件** | 记录权限的过滤表达式，如 `created_by == ${currentUser}`，运行时注入查询 WHERE 子句。 | 飞书记录权限条件 |
| **组织授权扩散** | 上级可查看/管理下级组织的数据（如部门主管可见下属提交的审批），通过组织树向上传播。 | 飞书组织授权与扩散 |
| **权限效果 (Effect)** | ALLOW（允许）/ DENY（拒绝），冲突时 DENY 优先。 | IAM 策略效果 |

### 2.1 RBAC + ABAC 混合模型

本平台权限模型由两层叠加：

**第一层 — RBAC（角色基础访问控制）**：
- 用户通过 `UserRole` 绑定一个或多个角色。
- 每个角色关联一组 `PermissionRule`，定义"角色→资源→动作"的映射。
- 用户的权限 = 所有角色的规则并集（ALLOW 取并集，DENY 取并集，DENY 优先）。

**第二层 — ABAC（属性基础访问控制，仅记录级）**：
- 在 RBAC 判定用户有记录访问权限后，进一步用条件表达式过滤可见记录。
- 条件表达式引用用户属性（`${currentUser}`、`${user.departments}`）和记录字段。
- 运行时将条件编译为 Prisma WHERE 子句，注入记录查询。

```
用户请求 → JWT 认证（已有）
  → 租户隔离（tenant_id 过滤，已有）
    → RBAC 权限守卫（本模块：角色→资源→动作）
      → ABAC 行级过滤（本模块：条件表达式→WHERE 子句）
        → ABAC 列级裁剪（本模块：字段级权限→响应字段过滤）
          → 返回数据
```

### 2.2 权限求值流程

```
                    ┌──────────────────┐
  用户请求带 JWT ───▶│ 1. 认证（已有）   │── req.user = { sub, tenantId, email }
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 2. 加载用户角色   │── 查 UserRole → Role[]（含系统角色+应用角色）
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 3. 加载权限规则   │── 按 roleId[] 查 PermissionRule（带缓存）
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 4. RBAC 判定     │── 遍历规则：是否有匹配的 ALLOW？是否有 DENY？
                    │   (Deny-overrides)│   DENY 命中 → 403；无 ALLOW → 403
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 5. ABAC 行级过滤  │── 记录级权限：条件表达式 → Prisma WHERE
                    │   (仅记录权限)    │   注入到查询，返回过滤后的记录集
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 6. ABAC 列级裁剪  │── 字段级权限：无权查看的字段从响应中移除
                    │   (仅数据模型权限) │   无权编辑的字段标记 readOnly
                    └────────┬─────────┘
                             ▼
                       返回结果
```

### 2.3 权限上下文变量

行级条件表达式中可引用的上下文变量：

| 变量 | 含义 | 示例用法 |
|---|---|---|
| `${currentUser}` | 当前用户 ID | `created_by == ${currentUser}` |
| `${currentUser.name}` | 当前用户姓名 | `owner_name == ${currentUser.name}` |
| `${user.departments}` | 当前用户所属部门 ID 列表 | `department in ${user.departments}` |
| `${user.roles}` | 当前用户角色编码列表 | `assignee_role in ${user.roles}` |
| `${user.orgPath}` | 当前用户组织树的完整路径（含上级） | `org_id in ${user.orgPath}`（组织扩散） |
| `${now}` | 当前时间 | `expire_date > ${now}` |

---

## 3. 功能清单（对齐飞书 aPaaS）

### 3.1 五级权限体系

| 权限维度 | 对标飞书 | 描述 | 控制粒度 | 优先级 |
|---|---|---|---|---|
| 页面权限 | E.1 页面权限 | 控制用户可访问哪些页面（可见性） | 页面级 | P0 |
| 记录权限 | E.1 记录权限（行级） | 行级数据访问控制，基于条件表达式过滤记录 | 行级（人员级） | P0 |
| 流程权限 | E.1 流程权限 | 控制谁可发起流程、参与审批、被分配任务 | 流程级 + 节点级 | P0 |
| 数据模型权限 | E.1 数据模型权限 | 对象整体访问 + 字段级（列级）访问控制 | 表级 + 列级 | P0 |
| 连接器权限 | E.1 函数权限 | 控制自定义函数/连接器的调用访问 | 连接器级 | P2 |

### 3.2 权限粒度

| 粒度 | 对标飞书 | 描述 | 适用权限维度 | 优先级 |
|---|---|---|---|---|
| 表级 | E.2 表级权限 | 控制对整个对象的访问（CRUD） | 数据模型权限 | P0 |
| 列级 | E.2 列级权限 | 控制对特定字段的访问（可见/可编辑/隐藏） | 数据模型权限 | P0 |
| 行级 | E.2 行级权限 | 基于条件表达式控制记录可见性 | 记录权限 | P0 |
| 人员级 | E.2 人员级权限 | 针对特定人员的动态权限（如"创建人可见"） | 记录权限 | P0 |

### 3.3 角色与组织

| 功能 | 对标飞书 | 描述 | 优先级 |
|---|---|---|---|
| 系统角色 | E.3 内置角色 | 内置 ADMIN / BUILDER / END_USER，不可删除，租户级 | P0 |
| 应用角色 | E.3 角色定义 | 应用内自定义角色，仅对该应用生效 | P0 |
| 角色成员管理 | E.3 角色成员 | 为角色分配/移除用户 | P0 |
| 角色权限配置 | E.3 角色权限 | 为角色配置五级权限规则 | P0 |
| 组织架构管理 | E.3 组织架构同步 | 树形组织结构（部门/团队/岗位），手动管理（不依赖飞书同步） | P0 |
| 组织授权 | E.3 组织授权 | 将角色授权给组织节点，节点下所有成员继承角色 | P1 |
| 组织授权扩散 | E.3 组织授权扩散 | 上级自动继承下级的数据访问权限（组织树向上传播） | P1 |

### 3.4 多租户

| 功能 | 对标飞书 | 描述 | 优先级 |
|---|---|---|---|
| 租户隔离 | E.4 租户隔离 | tenant_id 行级隔离，所有查询自动注入租户过滤 | P0 |
| 应用级隔离 | E.4 应用级隔离 | 应用间数据隔离，角色按应用维度隔离 | P0 |
| 行级安全 | E.4 行级安全 | PostgreSQL RLS（生产期叠加，开发期用应用层过滤） | P2 |
| 审计日志 | E.4 行为追踪 | 权限校验/授权变更行为追踪，所有鉴权有迹可循 | P1 |

### 3.5 用户管理

| 功能 | 描述 | 优先级 |
|---|---|---|
| 用户 CRUD | 创建/查询/更新/禁用用户 | P0 |
| 用户-角色绑定 | 为用户分配一个或多个角色 | P0 |
| 用户-部门绑定 | 将用户加入一个或多个组织节点 | P0 |
| 用户列表查询 | 按部门/角色/状态筛选分页查询 | P0 |
| 批量导入用户 | CSV 批量导入用户（P1） | P1 |

---

## 4. 用户故事

### 4.1 管理员故事

**US-1：配置系统角色权限**
> 作为租户管理员，我希望能为系统角色（如 END_USER）配置基础权限，以便终端用户登录后能看到工作台但无法修改应用配置。

**US-2：管理组织架构**
> 作为租户管理员，我希望能在组织管理页面以树形结构创建部门、子部门、团队和岗位，以便按组织维度管理用户和分配权限。

**US-3：组织授权扩散**
> 作为租户管理员，我希望配置"部门主管可见下属数据"的权限规则，以便审批场景中主管能查看和处理下属提交的申请。

**US-4：审计权限变更**
> 作为租户管理员，我希望查看权限变更日志（谁在何时修改了哪个角色的权限），以便追踪安全事件和满足合规要求。

### 4.2 搭建者故事

**US-5：创建应用角色**
> 作为应用搭建者，我希望在应用内创建自定义角色（如"销售专员"、"销售主管"），以便为不同业务角色配置差异化权限。

**US-6：配置页面权限**
> 作为应用搭建者，我希望为角色配置页面可见性（如"销售专员"只能看到客户列表和客户详情页，看不到设置页），以便控制用户可见的功能入口。

**US-7：配置记录级条件权限**
> 作为应用搭建者，我希望配置行级数据权限规则（如"销售专员只能查看自己负责的客户记录"），以便实现数据行级隔离。

**US-8：配置字段级权限**
> 作为应用搭建者，我希望配置字段级权限（如"销售专员看不到客户的'成本价'字段"），以便保护敏感字段。

**US-9：配置流程权限**
> 作为应用搭建者，我希望配置流程权限（如"仅'销售主管'角色可发起合同审批流程"，"审批人限定为'销售总监'角色"），以便控制流程的发起和参与。

**US-10：权限预览**
> 作为应用搭建者，我希望在权限配置面板中选择一个角色，预览该角色能看到哪些页面和数据，以便验证权限配置是否正确。

### 4.3 终端用户故事

**US-11：仅见授权内容**
> 作为终端用户，我希望登录后只看到被授权的页面和菜单，看不到无权限的功能入口，以免误操作。

**US-12：仅见授权数据**
> 作为终端用户，我希望在列表页只能看到我有权查看的记录（如只看到自己部门的客户），以便数据安全。

**US-13：流程任务自动派发**
> 作为终端用户，我希望审批任务根据流程权限规则自动派发给我（如"我的部门提交的采购申请由我审批"），以便及时处理待办。

### 4.4 多租户故事

**US-14：租户数据隔离**
> 作为 A 租户的用户，我希望我的数据对 B 租户完全不可见，以便多租户环境下的数据安全。

**US-15：独立角色体系**
> 作为 A 租户的管理员，我希望本租户的角色和权限配置独立于 B 租户，以便各租户有独立的权限策略。

---

## 5. 五级权限模型详细设计

### 5.1 第一级：页面权限（Page Permission）

**定位**：控制用户可访问哪些页面，决定菜单/导航中可见的页面入口。

**控制粒度**：页面级（PageMeta）。

**权限动作**：

| 动作 | 含义 |
|---|---|
| `VIEW` | 可查看/访问该页面 |
| `MANAGE` | 可编辑该页面的 Schema（搭建权限） |

**规则配置**：
- 为角色配置"可访问页面"列表，勾选该角色能看到的页面。
- 未配置任何页面权限的角色 → 默认不可见任何应用页面（安全默认）。
- 系统角色 `ADMIN` → 默认可见所有页面（超级权限）。

**执行机制**：
- 前端：加载导航/菜单时，调用 `/permissions/me/pages` 获取可见页面 ID 列表，过滤菜单。
- 后端：访问页面 Schema API 时，`PermissionGuard` 校验 `PAGE:VIEW` 权限。
- 运行时渲染：运行时页面加载前校验权限，无权限则显示 403 页面。

**配置示例**：
```jsonc
{
  "roleId": "role_sales",
  "type": "PAGE",
  "action": "VIEW",
  "targetId": "page_customer_list",     // 客户列表页
  "effect": "ALLOW"
}
```

### 5.2 第二级：记录权限（Record Permission / 行级）

**定位**：行级数据访问控制，基于条件表达式过滤用户可见的记录。这是飞书 aPaaS 权限体系中最核心、
最常用的能力——实现"每个人只能看到自己负责的数据"。

**控制粒度**：行级（记录级）/ 人员级。

**权限动作**：

| 动作 | 含义 |
|---|---|
| `VIEW` | 可查看满足条件的记录 |
| `CREATE` | 可创建记录 |
| `EDIT` | 可编辑满足条件的记录 |
| `DELETE` | 可删除满足条件的记录 |

**规则配置**：
- 为角色配置某对象的记录权限规则，每条规则包含：对象 ID + 动作 + 行级条件表达式。
- 行级条件为空 → 对该对象所有记录有该动作权限。
- 多条规则取并集（ALLOW）或交集（DENY 优先）。

**行级条件表达式**：

条件表达式采用与对象视图筛选相同的操作符体系（复用 Phase 1 的 FilterOperator），支持 AND/OR
嵌套条件组，并支持权限上下文变量：

```jsonc
// 示例1：销售专员只能查看自己负责的客户
{
  "type": "RECORD",
  "action": "VIEW",
  "targetId": "obj_customer",        // 客户对象
  "condition": {
    "field": "owner",
    "operator": "eq",
    "value": "${currentUser}"         // 动态变量：当前用户 ID
  },
  "effect": "ALLOW"
}

// 示例2：部门主管可见本部门所有客户（组织扩散）
{
  "type": "RECORD",
  "action": "VIEW",
  "targetId": "obj_customer",
  "condition": {
    "field": "department",
    "operator": "in",
    "value": "${user.departments}"   // 动态变量：当前用户部门列表
  },
  "effect": "ALLOW"
}

// 示例3：销售总监可见全部客户（无条件）
{
  "type": "RECORD",
  "action": "VIEW",
  "targetId": "obj_customer",
  "condition": null,                  // null = 全部记录
  "effect": "ALLOW"
}

// 示例4：禁止删除已审核的记录
{
  "type": "RECORD",
  "action": "DELETE",
  "targetId": "obj_customer",
  "condition": {
    "field": "status",
    "operator": "eq",
    "value": "APPROVED"
  },
  "effect": "DENY"                    // DENY 优先
}
```

**支持的操作符**（复用对象筛选体系）：

`eq` `ne` `contains` `not_contains` `starts_with` `ends_with` `gt` `gte` `lt` `lte`
`is_empty` `is_not_empty` `in` `not_in` `relative_date`

**嵌套条件组**：

```jsonc
// (部门属于本部门) AND (状态为"进行中" OR 状态为"待审核")
{
  "and": [
    { "field": "department", "operator": "in", "value": "${user.departments}" },
    {
      "or": [
        { "field": "status", "operator": "eq", "value": "IN_PROGRESS" },
        { "field": "status", "operator": "eq", "value": "PENDING_REVIEW" }
      ]
    }
  ]
}
```

**执行机制**：
- **查询过滤**：记录列表/查询 API（runtime-svc）执行前，权限引擎将条件表达式编译为 Prisma
  `WHERE` 子句，注入到查询中。用户只能查到满足条件的记录。
- **单条校验**：按 ID 查询/更新/删除单条记录时，先加载记录，校验是否满足当前用户的行级条件。
- **创建校验**：创建记录时，校验用户是否有该对象的 `RECORD:CREATE` 权限（无需行级条件）。

**条件编译为 Prisma WHERE 示例**：
```ts
// 条件: { field: "owner", operator: "eq", value: "${currentUser}" }
// 编译为:
{ data: { path: ["owner"], equals: currentUser.id } }

// 条件: { and: [{ field: "status", operator: "eq", value: "ACTIVE" }] }
// 编译为:
{ AND: [{ data: { path: ["status"], equals: "ACTIVE" } }] }
```

### 5.3 第三级：流程权限（Process Permission）

**定位**：控制用户可发起哪些流程、可参与哪些审批节点、可被分配哪些任务。与 Phase 3 流程引擎对接。

**控制粒度**：流程级 + 节点级。

**权限动作**：

| 动作 | 含义 | 适用目标 |
|---|---|---|
| `EXECUTE` | 可发起/触发该流程 | 流程定义（ProcessDef） |
| `APPROVE` | 可审批该流程的人工任务节点 | 流程节点（UserTask nodeId） |
| `VIEW` | 可查看该流程的实例/执行记录 | 流程定义（ProcessDef） |
| `MANAGE` | 可编辑/发布/删除该流程定义 | 流程定义（ProcessDef） |

**规则配置**：

```jsonc
// 仅"销售主管"可发起合同审批流程
{
  "roleId": "role_sales_manager",
  "type": "PROCESS",
  "action": "EXECUTE",
  "targetId": "pd_contract_approval",  // 流程定义 ID
  "effect": "ALLOW"
}

// 仅"财务总监"可审批合同审批流程的"财务审核"节点
{
  "roleId": "role_finance_director",
  "type": "PROCESS",
  "action": "APPROVE",
  "targetId": "pd_contract_approval",           // 流程定义 ID
  "targetNodeId": "node_finance_review",        // 审批节点 ID
  "effect": "ALLOW"
}
```

**与流程引擎的集成**：
- **流程发起**：调用 `POST /processes/:processKey/start` 时，校验 `PROCESS:EXECUTE` 权限。
- **审批节点受理人**：UserTask 节点的 `assigneeType` 已支持 `ROLE`，Phase 4 补充权限规则匹配——
  用户拥有该节点 `PROCESS:APPROVE` 权限才能出现在候选审批人列表中。
- **任务分配**：`candidateGroups`（角色编码列表）的用户 + 拥有 `APPROVE` 权限的用户取交集，
  生成实际候选审批人。
- **流程监控**：查看流程实例列表时，仅返回用户有 `PROCESS:VIEW` 权限的流程的实例。

> **与 Phase 3 的关系**：Phase 3 的 UserTask 节点已支持 `assigneeType: ROLE` 和
> `candidateGroups`，Phase 4 在此基础上增加权限规则校验。流程节点级的 `APPROVE` 权限是
> 候选审批人的补充过滤条件，二者取交集。

### 5.4 第四级：数据模型权限（Data Model Permission / 对象 + 字段级）

**定位**：对象整体访问控制（表级）+ 字段级访问控制（列级）。决定用户能操作哪些对象、能看到/编辑哪些字段。

**控制粒度**：表级（对象）+ 列级（字段）。

**权限动作**：

| 动作 | 含义 | 适用粒度 |
|---|---|---|
| `VIEW` | 可查看该对象 / 该字段 | 表级 + 列级 |
| `CREATE` | 可在该对象创建记录 | 表级 |
| `EDIT` | 可编辑该对象记录 / 该字段 | 表级 + 列级 |
| `DELETE` | 可删除该对象记录 | 表级 |
| `MANAGE` | 可管理该对象 Schema（增删字段/视图） | 表级 |

**表级规则**：
```jsonc
// "销售专员"可查看和创建客户记录
{
  "roleId": "role_sales",
  "type": "DATA_MODEL",
  "action": "VIEW",
  "targetId": "obj_customer",        // 对象 ID
  "fieldScope": null,                 // null = 全部字段可见
  "effect": "ALLOW"
}
```

**字段级规则**（列级）：
```jsonc
// "销售专员"看不到客户的"成本价"字段
{
  "roleId": "role_sales",
  "type": "DATA_MODEL",
  "action": "VIEW",
  "targetId": "obj_customer",
  "fieldScope": ["name", "phone", "email", "address"],  // 仅可见这些字段
  "effect": "ALLOW"
}

// "销售专员"不可编辑"客户等级"字段（标记 readOnly）
{
  "roleId": "role_sales",
  "type": "DATA_MODEL",
  "action": "EDIT",
  "targetId": "obj_customer",
  "fieldScope": ["name", "phone", "email", "address"],  // 仅可编辑这些字段
  "effect": "ALLOW"
}
```

**字段级权限的两种模式**：

| 模式 | 配置方式 | 说明 |
|---|---|---|
| 白名单模式 | `fieldScope: ["field_a", "field_b"]` | 仅列出的字段可见/可编辑，其余隐藏 |
| 黑名单模式 | 通过 `DENY` 规则指定隐藏字段 | 显式拒绝某些字段，其余可见 |

**执行机制**：
- **表级**：访问对象记录 API 前，`PermissionGuard` 校验 `DATA_MODEL:VIEW/CREATE/EDIT/DELETE`。
- **列级（查询）**：记录查询返回后，按 `fieldScope` 白名单裁剪响应 JSON，移除无权查看的字段。
- **列级（表单）**：表单页加载对象字段定义时，无 `EDIT` 权限的字段标记 `readOnly`，无 `VIEW`
  权限的字段不渲染。
- **列级（写入）**：创建/更新记录时，校验写入字段是否在可编辑白名单内，无权编辑的字段忽略或报错。

**字段级权限与记录级权限的组合**：
- 先按记录级条件过滤行（哪些记录可见），再按字段级权限裁剪列（哪些字段可见）。
- 二者叠加：用户只能看到"满足行级条件的记录"中的"有列级权限的字段"。

### 5.5 第五级：连接器权限（Connector Permission）

**定位**：控制自定义函数/连接器的调用访问。Phase 5 连接器模块的前置权限定义，Phase 4 仅实现类型
契约和基础校验框架，实际连接器管理在 Phase 5。

**控制粒度**：连接器级。

**权限动作**：

| 动作 | 含义 |
|---|---|
| `EXECUTE` | 可调用该连接器/函数 |
| `MANAGE` | 可管理该连接器配置 |

**规则配置**：
```jsonc
{
  "roleId": "role_integration",
  "type": "CONNECTOR",
  "action": "EXECUTE",
  "targetId": "conn_erp_sync",       // 连接器 ID（Phase 5 产出）
  "effect": "ALLOW"
}
```

**执行机制**：
- 流程引擎 HTTP 请求节点调用连接器时，校验当前流程发起人是否有 `CONNECTOR:EXECUTE` 权限。
- Phase 4 仅预留类型定义和权限守卫骨架，连接器实体在 Phase 5 实现后接入。

### 5.6 五级权限总览

| 级别 | 权限类型 | 控制对象 | 动作 | 执行方式 | 优先级 |
|---|---|---|---|---|---|
| 第一级 | 页面权限 | PageMeta | VIEW / MANAGE | Guard 拦截 + 菜单过滤 | P0 |
| 第二级 | 记录权限 | Record（行级） | VIEW / CREATE / EDIT / DELETE | 条件编译为 WHERE 注入查询 | P0 |
| 第三级 | 流程权限 | ProcessDef / UserTask 节点 | EXECUTE / APPROVE / VIEW / MANAGE | Guard 拦截 + 候选人过滤 | P0 |
| 第四级 | 数据模型权限 | ObjectMeta（表级）+ Field（列级） | VIEW / CREATE / EDIT / DELETE / MANAGE | Guard 拦截 + 响应字段裁剪 | P0 |
| 第五级 | 连接器权限 | Connector（Phase 5） | EXECUTE / MANAGE | Guard 拦截（骨架） | P2 |

---

## 6. 角色管理设计

### 6.1 角色类型

| 类型 | scope | appId | 说明 | 示例 |
|---|---|---|---|---|
| 系统角色（内置） | 租户级 | `null` | 平台内置，不可删除，适用于所有应用 | ADMIN / BUILDER / END_USER |
| 租户级角色 | 租户级 | `null` | 管理员自定义的租户级角色，适用于所有应用 | 全公司审计员 |
| 应用级角色 | 应用级 | 非空 | 搭建者在应用内自定义的角色，仅对该应用生效 | 销售专员 / 销售主管 |

### 6.2 内置系统角色

| 角色 | code | 权限说明 |
|---|---|---|
| 系统管理员 | `ADMIN` | 拥有全部权限（超级角色），可管理租户、用户、所有应用。权限规则不可修改，自动拥有所有 ALLOW。 |
| 应用搭建者 | `BUILDER` | 可创建/管理应用、对象、页面、流程。拥有所有应用的 MANAGE 权限。不可管理租户级用户/组织。 |
| 终端用户 | `END_USER` | 默认基础角色。可访问被授权的页面和数据，不可搭建应用。新用户默认分配此角色。 |

> **内置角色规则**：`ADMIN` 角色的权限不通过 `PermissionRule` 配置，而是权限引擎硬编码——
> 拥有 `ADMIN` 角色的用户自动通过所有权限校验。`BUILDER` 角色自动拥有所有应用的
> `PAGE:MANAGE` / `DATA_MODEL:MANAGE` / `PROCESS:MANAGE` 权限。

### 6.3 角色属性

```ts
interface Role {
  id: RoleId;
  tenantId: TenantId;
  appId?: AppId;          // null = 租户级角色；非空 = 应用级角色
  name: string;           // 显示名，如"销售专员"
  code: string;           // 编码，如 SALES_SPECIALIST，租户内唯一
  description?: string;
  isBuiltIn: boolean;     // 内置角色不可删除
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

### 6.4 角色与用户的关系

- **多对多**：一个用户可拥有多个角色，一个角色可分配给多个用户。
- **权限合并**：用户拥有多个角色时，权限取所有角色的并集（ALLOW 并集），但 DENY 优先于所有 ALLOW。
- **角色优先级**：系统角色 > 租户级角色 > 应用级角色（仅用于理解，不涉及继承链）。

> **不做角色继承链**：飞书 aPaaS 的"角色继承"在实际实现中体现为"用户多角色 + 权限并集"，
> 而非角色间父子继承链。本平台采用多角色并集模型，更简单且表达力等价。

### 6.5 角色与组织的关系

| 关联方式 | 说明 |
|---|---|
| 用户-角色直接绑定 | `UserRole` 直接将用户与角色关联（已有）。 |
| 组织-角色授权（OrgRoleGrant） | 将角色授权给组织节点，节点下所有成员自动获得该角色（Phase 4 新增）。 |

组织授权的效果等价于：对组织节点下所有成员批量执行 `UserRole` 绑定，但通过 `OrgRoleGrant`
记录关联关系，成员变动时自动生效（加入部门即获得角色，离开即失去）。

---

## 7. 组织架构设计

### 7.1 组织树模型

组织架构为树形结构，复用已有的 `OrgNode` 模型：

```ts
interface OrgNode {
  id: string;
  tenantId: TenantId;
  parentId?: string;        // 父节点 ID，null = 根节点
  name: string;             // 节点名称，如"销售部"
  code: string;             // 节点编码，如 SALES_DEPT
  nodeType: 'department' | 'team' | 'position';  // 节点类型
  sortOrder: number;        // 排序
  children?: OrgNode[];     // 子节点（树形展开）
}
```

### 7.2 节点类型

| 类型 | 说明 | 示例 |
|---|---|---|
| `department` 部门 | 组织树的主体节点，可嵌套子部门 | 销售部 / 研发部 / 财务部 |
| `team` 团队 | 跨部门的虚拟团队 | 重点项目组 |
| `position` 岗位 | 组织叶节点，标识岗位 | 销售专员 / 销售主管 |

### 7.3 用户与组织的关系

- **多对多**：一个用户可属于多个组织节点（如同时属于"销售部"和"华东大区组"）。
- 通过 `OrgMember` 关联表绑定（已有）。
- 用户的 `${user.departments}` 变量 = 用户所有 `OrgMember` 关联的 `orgId` 列表。

### 7.4 组织授权扩散

**扩散规则**：上级可查看/管理下级组织的数据。实现方式是通过 `${user.orgPath}` 变量展开：

- 用户的 `orgPath` = 用户直接所属节点 + 所有子节点（向下扩散）。
- 行级条件 `department in ${user.orgPath}` 使上级能看到下属部门的记录。

**扩散示例**：
```
组织树:
  华东大区 (org_east)
    ├── 销售一部 (org_sales_1)
    │     ├── 张三 (user)
    │     └── 李四 (user)
    └── 销售二部 (org_sales_2)
          └── 王五 (user)

张三的 orgPath = [org_sales_1]  (仅本部门)
华东大区主管的 orgPath = [org_east, org_sales_1, org_sales_2]  (本部门 + 所有子部门)

→ 主管配置行级条件: department in ${user.orgPath}
→ 主管可见销售一部 + 销售二部的全部记录，张三仅见销售一部的记录
```

> **扩散方向**：向下扩散（上级可见下级数据）。不支持向上扩散（下级不可见上级数据），这是安全默认。

### 7.5 组织角色授权（OrgRoleGrant）

将角色授权给组织节点，节点下所有成员自动获得该角色：

```ts
interface OrgRoleGrant {
  id: string;
  tenantId: TenantId;
  orgId: string;            // 组织节点 ID
  roleId: string;           // 角色 ID
  appId?: AppId;            // 应用级角色需指定应用
  createdAt: ISODateString;
}
```

**生效逻辑**：
- 用户的有效角色 = `UserRole` 直接绑定的角色 + 用户所属组织节点的 `OrgRoleGrant` 授权角色。
- 权限引擎加载用户角色时，合并两个来源。
- 组织成员变动（加入/离开部门）时，角色自动生效/失效，无需手动调整。

---

## 8. 多租户设计

### 8.1 租户隔离模型

| 隔离层 | 机制 | 状态 |
|---|---|---|
| 行级隔离（应用层） | 所有 Prisma 查询自动注入 `tenant_id` 过滤 | ✅ 已有（Phase 0） |
| JWT 租户绑定 | JWT payload 含 `tenantId`，从 token 提取 | ✅ 已有（Phase 0） |
| 应用级隔离 | 角色/权限规则按 `appId` 隔离，应用间互不可见 | Phase 4 实现 |
| 行级安全（数据库层） | PostgreSQL RLS 策略 | P2（生产期叠加） |

### 8.2 租户管理

| 功能 | 描述 | 优先级 |
|---|---|---|
| 创建租户 | 创建新租户（平台运营级操作） | P1 |
| 租户列表 | 查询所有租户（平台运营级） | P1 |
| 租户状态管理 | 启用/停用/归档租户 | P1 |
| 租户配置 | 租户名称、slug、状态 | P0（已有） |

> 租户管理为平台运营级功能，非租户内功能。Phase 4 MVP 聚焦租户内的权限管理，
> 租户 CRUD 优先级为 P1。

### 8.3 审计日志

| 审计事件 | 记录内容 | 优先级 |
|---|---|---|
| 权限规则变更 | 谁/何时/修改了哪个角色的哪条权限规则 | P1 |
| 角色分配变更 | 谁/何时/为谁分配/移除了哪个角色 | P1 |
| 组织授权变更 | 谁/何时/为哪个组织授权/撤销了哪个角色 | P1 |
| 权限拒绝事件 | 谁/何时/请求了什么资源被拒绝（403） | P2 |

审计日志存储为独立的 `AuditLog` 表，记录操作人、时间、操作类型、变更前后数据。

---

## 9. 权限引擎设计

### 9.1 权限引擎架构

```
┌─────────────────────────────────────────────────────────────────┐
│ NestJS Guard 层                                                  │
│  PermissionGuard ── 路由级拦截，校验粗粒度权限                    │
│  @RequirePermissions('PAGE:VIEW', 'page_xxx') 装饰器            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ PermissionService（核心服务）                                    │
│  check(user, type, action, targetId) → boolean                  │
│  getRecordFilter(user, objectId) → PrismaWhere                  │
│  getFieldScope(user, objectId, action) → string[] | null        │
│  getVisiblePages(user, appId) → PageId[]                        │
└──────────┬──────────────┬──────────────┬──────────────┬────────┘
           │              │              │              │
┌──────────▼────┐ ┌───────▼─────┐ ┌──────▼──────┐ ┌────▼─────┐
│ 规则加载器     │ │ 条件编译器   │ │ 角色解析器   │ │ 权限缓存  │
│ PermissionRule│ │ Condition   │ │ RoleResolver│ │ Cache    │
│ → 内存规则集   │ │ → PrismaWhere│ │ → 有效角色   │ │ (TTL 60s)│
└───────────────┘ └─────────────┘ └─────────────┘ └──────────┘
```

### 9.2 PermissionGuard（守卫）

NestJS 守卫，在路由处理前拦截，校验粗粒度权限（页面/对象表级/流程级）：

```ts
// 装饰器用法
@RequirePermissions({ type: 'PAGE', action: 'VIEW', targetIdParam: 'pageId' })
@UseGuards(JwtAuthGuard, PermissionGuard)
@Get('/pages/:pageId')
getPage(@Param('pageId') pageId: string) { ... }

// 装饰器用法（对象级）
@RequirePermissions({ type: 'DATA_MODEL', action: 'VIEW', targetIdParam: 'objectId' })
@UseGuards(JwtAuthGuard, PermissionGuard)
@Get('/objects/:objectId/records')
listRecords(@Param('objectId') objectId: string) { ... }
```

**守卫执行流程**：
1. 从 `req.user`（JWT）获取 `userId` / `tenantId`。
2. 解析装饰器声明的权限要求（type + action + targetId 来源）。
3. 调用 `PermissionService.check()` 校验。
4. 校验失败 → 抛 `ForbiddenException`（403）。
5. 校验通过 → 放行，将权限上下文附加到 `req.permissionContext`。

### 9.3 PermissionService（核心服务）

```ts
interface PermissionService {
  /** 校验用户是否有指定权限（粗粒度：页面/对象表级/流程级） */
  check(params: {
    userId: string;
    tenantId: string;
    appId?: string;
    type: PermissionType;
    action: PermissionAction;
    targetId: string;
    targetNodeId?: string;  // 流程节点级
  }): Promise<boolean>;

  /** 获取用户的记录级行级过滤条件（编译为 Prisma WHERE） */
  getRecordFilter(params: {
    userId: string;
    tenantId: string;
    objectId: string;
    action: 'VIEW' | 'EDIT' | 'DELETE';
  }): Promise<PrismaWhereClause>;

  /** 获取用户的字段级权限范围（白名单字段列表，null = 全部可见） */
  getFieldScope(params: {
    userId: string;
    tenantId: string;
    objectId: string;
    action: 'VIEW' | 'EDIT';
  }): Promise<string[] | null>;

  /** 获取用户可见页面 ID 列表 */
  getVisiblePages(params: {
    userId: string;
    tenantId: string;
    appId: string;
  }): Promise<string[]>;

  /** 获取用户有效角色列表（直接绑定 + 组织授权） */
  getUserRoles(userId: string, tenantId: string): Promise<Role[]>;
}
```

### 9.4 条件编译器（ConditionCompiler）

将行级条件表达式（JSON）编译为 Prisma `WHERE` 子句：

```ts
class ConditionCompiler {
  /** 编译条件表达式为 Prisma WHERE */
  compile(condition: ConditionExpr, context: PermissionContext): PrismaWhere {
    if (!condition) return {};  // null = 无限制

    // 解析上下文变量
    const resolved = this.resolveVariables(condition, context);

    // 递归编译
    return this.buildWhere(resolved);
  }

  /** 解析 ${currentUser} 等变量 */
  private resolveVariables(condition: ConditionExpr, ctx: PermissionContext): ConditionExpr {
    // 深度遍历，替换 value 中的 ${...} 变量
  }

  /** 构建 Prisma WHERE（JSONB data 路径查询） */
  private buildWhere(condition: ConditionExpr): PrismaWhere {
    if ('and' in condition) {
      return { AND: condition.and.map(c => this.buildWhere(c)) };
    }
    if ('or' in condition) {
      return { OR: condition.or.map(c => this.buildWhere(c)) };
    }
    // 叶子条件: { field, operator, value }
    return this.buildLeaf(condition);
  }
}
```

**JSONB 查询映射**：记录数据存储在 `Record.data` JSONB 列，条件编译为 Prisma 的 JSONB 路径过滤：
```ts
// 条件: { field: "owner", operator: "eq", value: "user_xxx" }
// Prisma WHERE:
{ data: { path: ["owner"], equals: "user_xxx" } }

// 条件: { field: "status", operator: "in", value: ["A", "B"] }
// Prisma WHERE:
{ data: { path: ["status"], array_contains: ["A", "B"] } }
```

### 9.5 权限缓存

为避免每次请求都查询数据库加载权限规则，采用缓存策略：

| 缓存项 | 缓存键 | TTL | 失效时机 |
|---|---|---|---|
| 用户角色列表 | `perm:roles:{userId}` | 60s | 角色分配变更时主动失效 |
| 角色→规则集 | `perm:rules:{roleId}` | 60s | 权限规则变更时主动失效 |
| 用户可见页面 | `perm:pages:{userId}:{appId}` | 60s | 页面权限变更时主动失效 |

- 缓存使用内存 Map（MVP）或 Redis（生产，复用已有 Redis 实例）。
- 权限配置变更时，通过事件通知缓存失效（`PermissionCacheInvalidator`）。
- 缓存未命中时回源查询，查询结果写回缓存。

### 9.6 权限规则求值算法

```ts
function evaluatePermission(
  rules: PermissionRule[],
  type: PermissionType,
  action: PermissionAction,
  targetId: string,
  targetNodeId?: string
): { allowed: boolean; conditions: ConditionExpr[] } {

  // 1. 过滤匹配的规则
  const matched = rules.filter(r =>
    r.type === type &&
    r.action === action &&
    r.targetId === targetId &&
    (!targetNodeId || r.targetNodeId === targetNodeId)
  );

  // 2. 检查 DENY（拒绝优先）
  const hasDeny = matched.some(r => r.effect === 'DENY');
  if (hasDeny) {
    return { allowed: false, conditions: [] };
  }

  // 3. 检查 ALLOW
  const allowRules = matched.filter(r => r.effect === 'ALLOW');
  if (allowRules.length === 0) {
    return { allowed: false, conditions: [] };
  }

  // 4. 收集 ALLOW 规则的行级条件（仅记录权限）
  const conditions = allowRules
    .filter(r => r.condition)
    .map(r => r.condition);

  // 5. 有 ALLOW 且无条件 → 完全允许；有条件 → 允许但需过滤
  return { allowed: true, conditions };
}
```

**求值规则**：
- DENY 优先：任何一条 DENY 规则匹配 → 拒绝。
- ALLOW 并集：多条 ALLOW 规则的条件取 OR（满足任一即允许）。
- 无条件 ALLOW：`condition: null` 的 ALLOW 规则表示完全允许（无行级限制）。
- ADMIN 短路：用户拥有 `ADMIN` 角色时，跳过规则求值，直接返回 `allowed: true, conditions: []`。

---

## 10. 数据模型设计

### 10.1 现有模型复用

`schema.prisma` 已定义以下模型（Phase 0 基础层），Phase 4 直接复用：

| 模型 | 状态 | 说明 |
|---|---|---|
| `Tenant` | ✅ 已有 | 租户，`tenant_id` 行级隔离基础 |
| `User` | ✅ 已有 | 用户，已有 `userRoles` 和 `orgMemberships` 关系 |
| `Role` | ✅ 已有 | 角色，已有 `appId`（应用级/租户级）、`code`、`isBuiltIn` |
| `UserRole` | ✅ 已有 | 用户-角色多对多关联 |
| `OrgNode` | ✅ 已有 | 组织节点（树形，已有 `parentId` 自关联） |
| `OrgMember` | ✅ 已有 | 用户-组织节点多对多关联 |

### 10.2 Phase 4 需新增的 Prisma 模型

#### 10.2.1 PermissionRule（权限规则）⭐ 核心

```prisma
/// 权限规则 — 五级权限的核心配置实体。
/// 每条规则声明：某角色对某资源有何动作权限，是否附带行级条件。
model PermissionRule {
  id            String   @id @default(cuid())
  tenantId      String   @map("tenant_id")
  appId         String?  @map("app_id")              // 空=租户级规则；非空=应用级规则
  roleId        String   @map("role_id")             // 关联角色
  // 权限维度（五级）
  type          String   @map("type")                // PAGE | RECORD | PROCESS | DATA_MODEL | CONNECTOR
  // 权限动作
  action        String   @map("action")              // VIEW | CREATE | EDIT | DELETE | EXECUTE | APPROVE | MANAGE
  // 作用目标
  targetId      String   @map("target_id")           // 页面ID / 对象ID / 流程定义ID / 连接器ID
  targetNodeId  String?  @map("target_node_id")      // 流程节点ID（仅 PROCESS:APPROVE 用）
  // 行级条件（仅 RECORD 类型用，JSON 条件表达式）
  condition     Json?    @map("condition")           // 条件表达式 JSON，null=无条件
  // 字段级范围（仅 DATA_MODEL 类型用）
  fieldScope    Json?    @map("field_scope")          // string[] 白名单字段，null=全部字段
  // 权限效果
  effect        String   @default("ALLOW") @map("effect")  // ALLOW | DENY
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  role          Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([roleId])
  @@index([tenantId, type, targetId])
  @@index([appId, type, targetId])
  @@map("permission_rules")
}
```

> 需在 `Role` 模型增加反向关系：`permissionRules PermissionRule[]`（当前 schema 中被注释，Phase 4 取消注释）。
> 需在 `Tenant` 模型增加反向关系：`permissionRules PermissionRule[]`。

#### 10.2.2 OrgRoleGrant（组织角色授权）⭐ 新增

```prisma
/// 组织角色授权 — 将角色授权给组织节点，节点下所有成员自动获得该角色。
model OrgRoleGrant {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  orgId     String   @map("org_id")                  // 组织节点 ID
  roleId    String   @map("role_id")                 // 角色 ID
  appId     String?  @map("app_id")                  // 应用级角色需指定应用
  createdAt DateTime @default(now()) @map("created_at")

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orgNode   OrgNode  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([orgId, roleId, appId])
  @@index([tenantId])
  @@index([orgId])
  @@map("org_role_grants")
}
```

> 需在 `OrgNode` 模型增加反向关系：`roleGrants OrgRoleGrant[]`。
> 需在 `Role` 模型增加反向关系：`orgRoleGrants OrgRoleGrant[]`。
> 需在 `Tenant` 模型增加反向关系：`orgRoleGrants OrgRoleGrant[]`。

#### 10.2.3 AuditLog（审计日志）⭐ 新增

```prisma
/// 审计日志 — 记录权限相关的变更和访问行为。
model AuditLog {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  actorId     String   @map("actor_id")              // 操作人 ID
  action      String   @map("action")                // PERMISSION_RULE_CHANGED | ROLE_ASSIGNED | ORG_GRANT_CHANGED | ACCESS_DENIED
  targetType  String   @map("target_type")           // ROLE | PERMISSION_RULE | ORG_GRANT | RESOURCE
  targetId    String?  @map("target_id")             // 被操作对象 ID
  // 变更详情 JSON：{ before, after }
  detail      Json     @default("{}")                // 变更前后数据快照
  ip          String?                                 // 请求 IP
  createdAt   DateTime @default(now()) @map("created_at")

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([actorId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
```

> 需在 `Tenant` 模型增加反向关系：`auditLogs AuditLog[]`。

### 10.3 Role 模型补充

现有 `Role` 模型已有基础字段，Phase 4 取消注释权限规则反向关系并确保完整：

```prisma
model Role {
  // ... 现有字段保持不变
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  appId       String?  @map("app_id")
  name        String
  code        String
  description String?
  isBuiltIn   Boolean  @default(false) @map("is_built_in")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application Application? @relation(fields: [appId], references: [id], onDelete: Cascade)
  userRoles   UserRole[]

  // ★ Phase 4 新增反向关系
  permissionRules PermissionRule[]
  orgRoleGrants  OrgRoleGrant[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([appId])
  @@map("roles")
}
```

### 10.4 OrgNode 模型补充

现有 `OrgNode` 已有 `nodeType`（shared 类型中为 `department | team | position`），但 Prisma schema
中未体现。Phase 4 需确认对齐：

```prisma
model OrgNode {
  // ... 现有字段
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  parentId  String?  @map("parent_id")
  name      String
  code      String
  // ★ Phase 4 新增：节点类型（shared 类型已有 nodeType，Prisma 需对齐）
  nodeType  String   @default("department") @map("node_type")  // department | team | position
  sort      Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant      Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent      OrgNode?   @relation("OrgTree", fields: [parentId], references: [id], onDelete: SetNull)
  children    OrgNode[]  @relation("OrgTree")
  memberships OrgMember[]

  // ★ Phase 4 新增反向关系
  roleGrants OrgRoleGrant[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([parentId])
  @@map("org_nodes")
}
```

### 10.5 shared 类型契约对齐

`packages/shared/src/permission/index.ts` 需扩展，与 Prisma 模型和本 PRD 对齐：

```ts
// 需新增/修改的类型

/** 权限效果 */
export enum PermissionEffect {
  Allow = 'ALLOW',
  Deny = 'DENY',
}

/** 权限规则（扩展，与 Prisma PermissionRule 对齐） */
export interface PermissionRule {
  id: string;
  tenantId: TenantId;
  appId?: AppId;
  roleId: RoleId;
  type: PermissionType;
  action: PermissionAction;
  targetId: string;
  targetNodeId?: string;        // 流程节点级
  condition?: ConditionExpr;    // 行级条件（JSON 表达式）
  fieldScope?: string[];        // 字段白名单（列级）
  effect: PermissionEffect;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 条件表达式（行级权限） */
export type ConditionExpr =
  | ConditionLeaf
  | { and: ConditionExpr[] }
  | { or: ConditionExpr[] };

export interface ConditionLeaf {
  field: string;
  operator: FilterOperator;     // 复用对象筛选操作符
  value: unknown;               // 支持 ${变量} 动态变量
}

/** 组织角色授权 */
export interface OrgRoleGrant {
  id: string;
  tenantId: TenantId;
  orgId: string;
  roleId: RoleId;
  appId?: AppId;
  createdAt: ISODateString;
}

/** 审计日志 */
export interface AuditLog {
  id: string;
  tenantId: TenantId;
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  detail: Record<string, unknown>;
  ip?: string;
  createdAt: ISODateString;
}

export enum AuditAction {
  PermissionRuleChanged = 'PERMISSION_RULE_CHANGED',
  RoleAssigned = 'ROLE_ASSIGNED',
  RoleRevoked = 'ROLE_REVOKED',
  OrgGrantChanged = 'ORG_GRANT_CHANGED',
  AccessDenied = 'ACCESS_DENIED',
}
```

> ⚠️ **命名对齐**：当前 `shared/src/permission/index.ts` 的 `PermissionType` 枚举值为小写
> （`page`/`record`/`process`/`data_model`/`connector`），`PermissionAction` 也为小写
> （`view`/`create`/`edit`/`delete`/`execute`/`manage`）。Phase 4 统一为大写枚举值
> （`PAGE`/`RECORD`/`PROCESS`/`DATA_MODEL`/`CONNECTOR`，`VIEW`/`CREATE`/`EDIT`/`DELETE`/
> `EXECUTE`/`APPROVE`/`MANAGE`），与 Prisma 存储和表单元数据一致。补充 `APPROVE` 动作（流程审批）。

---

## 11. API 设计

> 约定：所有路由经 gateway，JWT 保护，`tenantId` 从 token 提取。
> 响应统一 `{ ok: true, data }` / `{ ok: false, error }`。
> 权限管理 API 路由到 **gateway**（权限服务内嵌于 gateway，作为 NestJS 模块）。

### 11.1 角色管理

| 方法 | 路径 | 说明 | 权限要求 | 优先级 |
|---|---|---|---|---|
| GET | `/roles` | 角色列表（按应用/类型筛选分页） | ADMIN | P0 |
| GET | `/roles/:roleId` | 获取角色详情（含权限规则） | ADMIN | P0 |
| POST | `/roles` | 创建角色（租户级或应用级） | ADMIN | P0 |
| PUT | `/roles/:roleId` | 更新角色（名称/描述） | ADMIN | P0 |
| DELETE | `/roles/:roleId` | 删除角色（内置角色不可删，有用户绑定时阻止） | ADMIN | P0 |
| GET | `/roles/:roleId/users` | 获取角色下的用户列表 | ADMIN | P0 |
| POST | `/roles/:roleId/users` | 为角色批量分配用户 | ADMIN | P0 |
| DELETE | `/roles/:roleId/users/:userId` | 移除用户的角色 | ADMIN | P0 |
| GET | `/roles/:roleId/permissions` | 获取角色的权限规则列表 | ADMIN/BUILDER | P0 |
| PUT | `/roles/:roleId/permissions` | 批量更新角色的权限规则（全量覆盖） | ADMIN/BUILDER | P0 |

**创建角色请求体**：
```jsonc
{
  "appId": "app_xxx",          // 可选，null=租户级角色
  "name": "销售专员",
  "code": "SALES_SPECIALIST",  // 大写蛇形，租户内唯一
  "description": "负责客户跟进和订单录入"
}
```

**批量更新权限规则请求体**：
```jsonc
{
  "rules": [
    {
      "type": "PAGE",
      "action": "VIEW",
      "targetId": "page_customer_list",
      "effect": "ALLOW"
    },
    {
      "type": "DATA_MODEL",
      "action": "VIEW",
      "targetId": "obj_customer",
      "fieldScope": ["name", "phone", "email"],
      "effect": "ALLOW"
    },
    {
      "type": "RECORD",
      "action": "VIEW",
      "targetId": "obj_customer",
      "condition": {
        "field": "owner",
        "operator": "eq",
        "value": "${currentUser}"
      },
      "effect": "ALLOW"
    }
  ]
}
```

### 11.2 组织架构管理

| 方法 | 路径 | 说明 | 权限要求 | 优先级 |
|---|---|---|---|---|
| GET | `/orgs/tree` | 获取组织树（完整树形结构） | ADMIN | P0 |
| GET | `/orgs` | 组织节点列表（扁平，分页） | ADMIN | P0 |
| GET | `/orgs/:orgId` | 获取组织节点详情 | ADMIN | P0 |
| POST | `/orgs` | 创建组织节点 | ADMIN | P0 |
| PUT | `/orgs/:orgId` | 更新组织节点（名称/编码/排序） | ADMIN | P0 |
| DELETE | `/orgs/:orgId` | 删除组织节点（有子节点/成员时阻止） | ADMIN | P0 |
| GET | `/orgs/:orgId/members` | 获取组织节点下的成员列表 | ADMIN | P0 |
| POST | `/orgs/:orgId/members` | 批量添加成员到组织节点 | ADMIN | P0 |
| DELETE | `/orgs/:orgId/members/:userId` | 从组织节点移除成员 | ADMIN | P0 |
| GET | `/orgs/:orgId/roles` | 获取组织节点授权的角色列表 | ADMIN | P1 |
| POST | `/orgs/:orgId/roles` | 为组织节点授权角色 | ADMIN | P1 |
| DELETE | `/orgs/:orgId/roles/:roleId` | 撤销组织节点的角色授权 | ADMIN | P1 |

**创建组织节点请求体**：
```jsonc
{
  "parentId": "org_sales",       // 可选，null=根节点
  "name": "销售一部",
  "code": "SALES_TEAM_1",
  "nodeType": "department",      // department | team | position
  "sortOrder": 1
}
```

### 11.3 用户管理

| 方法 | 路径 | 说明 | 权限要求 | 优先级 |
|---|---|---|---|---|
| GET | `/users` | 用户列表（按部门/角色/状态筛选分页） | ADMIN | P0 |
| GET | `/users/:userId` | 获取用户详情（含角色+组织） | ADMIN | P0 |
| POST | `/users` | 创建用户 | ADMIN | P0 |
| PUT | `/users/:userId` | 更新用户（姓名/头像/状态） | ADMIN | P0 |
| DELETE | `/users/:userId` | 禁用用户（软删除，status→DISABLED） | ADMIN | P0 |
| GET | `/users/:userId/roles` | 获取用户的角色列表 | ADMIN | P0 |
| POST | `/users/:userId/roles` | 为用户分配角色（批量） | ADMIN | P0 |
| DELETE | `/users/:userId/roles/:roleId` | 移除用户的某个角色 | ADMIN | P0 |
| GET | `/users/:userId/orgs` | 获取用户的组织节点列表 | ADMIN | P0 |

**创建用户请求体**：
```jsonc
{
  "email": "zhangsan@company.com",
  "name": "张三",
  "password": "initial123",       // 初始密码
  "roleIds": ["role_sales"],      // 初始角色
  "orgIds": ["org_sales_1"]       // 初始部门
}
```

### 11.4 权限查询（当前用户）

| 方法 | 路径 | 说明 | 权限要求 | 优先级 |
|---|---|---|---|---|
| GET | `/permissions/me/roles` | 获取当前用户的有效角色列表 | 登录 | P0 |
| GET | `/permissions/me/pages?appId=xxx` | 获取当前用户可见的页面 ID 列表 | 登录 | P0 |
| GET | `/permissions/me/check` | 校验当前用户是否有指定权限 | 登录 | P0 |
| GET | `/permissions/me/record-filter?objectId=xxx&action=VIEW` | 获取当前用户的行级过滤条件（调试用） | 登录 | P1 |

**权限校验请求**：
```
GET /permissions/me/check?type=PAGE&action=VIEW&targetId=page_xxx
```

**响应**：
```jsonc
{
  "ok": true,
  "data": { "allowed": true }
}
```

### 11.5 审计日志

| 方法 | 路径 | 说明 | 权限要求 | 优先级 |
|---|---|---|---|---|
| GET | `/audit-logs` | 审计日志列表（按操作类型/时间/操作人筛选分页） | ADMIN | P1 |
| GET | `/audit-logs/:logId` | 获取审计日志详情 | ADMIN | P1 |

### 11.6 内部权限引擎 API（服务间调用）

以下 API 供 gateway 内其他模块（Object/Record/Page/Process 模块）调用，非前端直接调用：

| 方法 | 路径 | 说明 | 调用方 | 优先级 |
|---|---|---|---|---|
| — | `PermissionService.check()` | 校验权限（Guard 内调用） | PermissionGuard | P0 |
| — | `PermissionService.getRecordFilter()` | 获取行级过滤 WHERE | RecordModule | P0 |
| — | `PermissionService.getFieldScope()` | 获取字段白名单 | RecordModule / ObjectModule | P0 |
| — | `PermissionService.getVisiblePages()` | 获取可见页面 | PageModule | P0 |
| — | `PermissionService.getUserRoles()` | 获取有效角色（含组织授权） | 所有模块 | P0 |

### 11.7 错误约定

| 场景 | HTTP 状态码 | 错误码 | 说明 |
|---|---|---|---|
| 无权限访问 | 403 | `FORBIDDEN` | 权限守卫拦截 |
| 角色编码冲突 | 409 | `VALIDATION_ERROR` | 同租户内 code 重复 |
| 删除内置角色 | 409 | `VALIDATION_ERROR` | 内置角色不可删除 |
| 删除有用户的角色 | 409 | `VALIDATION_ERROR` | 需先移除用户绑定 |
| 删除有子节点的组织 | 409 | `VALIDATION_ERROR` | 需先删除子节点 |
| 条件表达式格式错误 | 400 | `INVALID_CONDITION` | 行级条件 JSON 格式不合法 |

---

## 12. 验收标准（Phase 4 完成闸门）

> 对齐 ROADMAP.md Phase 4 验收标准：不同角色见不同页面/数据/任务；记录级条件权限生效；组织授权扩散正确。

### 功能验收（可验证）

1. **角色管理**：能创建租户级角色和应用级角色；能为角色分配/移除用户；内置角色（ADMIN/BUILDER/END_USER）不可删除。

2. **页面权限**：为角色配置页面可见性后，该角色用户登录后菜单仅显示被授权的页面；无权限页面访问返回 403。

3. **记录级条件权限**：配置"销售专员只能查看自己创建的记录"规则后，该角色用户查询记录列表时仅返回 `created_by == 当前用户` 的记录；尝试按 ID 访问他人记录返回 403。

4. **字段级权限**：配置"销售专员看不到成本价字段"规则后，该角色用户查询记录时响应中不包含 `cost_price` 字段；表单页该字段标记 readOnly。

5. **流程权限**：配置"仅销售主管可发起合同审批"规则后，非主管角色调用流程启动 API 返回 403；配置审批节点权限后，仅授权角色出现在候选审批人列表。

6. **组织架构**：能创建树形组织结构（部门/团队/岗位）；能为组织节点添加/移除成员；组织树可展开查看。

7. **组织授权扩散**：配置"部门主管可见下属数据"（`department in ${user.orgPath}`）规则后，上级用户能查询到下级部门成员的记录，下级用户不可见上级部门的记录。

8. **组织角色授权**：将角色授权给组织节点后，节点下所有成员自动获得该角色权限；成员离开节点后权限自动失效。

9. **多租户隔离**：A 租户的角色/权限规则/用户/组织对 B 租户完全不可见；A 租户用户无法访问 B 租户的数据。

10. **权限拒绝优先**：同一资源配置了 ALLOW + DENY 两条规则时，DENY 优先，用户被拒绝访问。

11. **ADMIN 超级权限**：拥有 ADMIN 角色的用户无需配置任何权限规则即可访问所有资源。

12. **审计日志**：权限规则变更、角色分配、组织授权变更均记录审计日志；管理员可查询审计日志列表。

### 技术验收

13. `packages/shared/src/permission/index.ts` 类型扩展完成（`PermissionRule`/`ConditionExpr`/`OrgRoleGrant`/`AuditLog`/`PermissionEffect`），枚举值统一为大写，无 `any` 逃逸。

14. Prisma schema 完成迁移：新增 `PermissionRule` / `OrgRoleGrant` / `AuditLog` 模型；`Role` 增加 `permissionRules` + `orgRoleGrants` 反向关系；`OrgNode` 增加 `nodeType` 列 + `roleGrants` 反向关系。

15. `PermissionGuard` 守卫 + `@RequirePermissions` 装饰器可用，已接入 Page/Object/Record/Process 路由。

16. `PermissionService` 实现 `check()` / `getRecordFilter()` / `getFieldScope()` / `getVisiblePages()` / `getUserRoles()` 全部方法。

17. `ConditionCompiler` 能将行级条件表达式编译为 Prisma WHERE 子句，支持 AND/OR 嵌套 + 上下文变量（`${currentUser}` / `${user.departments}` / `${user.orgPath}`）。

18. 权限缓存生效（用户角色 + 规则集缓存），权限变更时缓存自动失效。

19. 种子数据补充 END_USER 内置角色（当前仅有 ADMIN/BUILDER）。

---

## 13. 非目标（Phase 4 不做）

| 非目标 | 说明 | 归属阶段 |
|---|---|---|
| PostgreSQL RLS | 数据库层行级安全策略，开发期用应用层过滤替代，生产期叠加。 | P2 / 生产部署 |
| 字段级加密 | 字段值加密存储，Phase 4 仅做字段级权限控制（可见性），不做加密存储。 | 后续 |
| 飞书组织架构同步 | 自动同步飞书组织架构和人员信息，本平台为独立系统不依赖飞书。 | 不做 |
| SSO / OAuth 集成 | 单点登录和第三方身份认证，Phase 4 仅用已有 JWT 认证。 | 后续 |
| 动态权限策略引擎 | 复杂的策略评估引擎（如 OPA/Cedar），Phase 4 用内置规则求值。 | 后续 |
| 权限模板 / 权限继承链 | 角色间父子继承链，Phase 4 用多角色并集替代。 | 不做 |
| 数据级权限的数据掩码 | 无权查看的字段显示为 `***` 而非隐藏，Phase 4 直接隐藏字段。 | 后续 |
| 权限审批流 | 权限申请需审批的流程，Phase 4 由管理员直接配置。 | 后续 |
| 连接器权限完整实现 | 连接器实体在 Phase 5 实现，Phase 4 仅预留类型和守卫骨架。 | Phase 5 |
| 细粒度 API Token 权限 | 外部 API 调用的 Token 级权限控制。 | 后续 |
| 用户批量导入 | CSV 批量导入用户，Phase 4 仅支持单用户创建。 | P1 / Phase 10 |
| 数据权限的子表关联扩散 | 行级权限沿 Lookup 关联关系扩散（如"可见客户则可见其订单"），Phase 4 仅做单对象行级过滤。 | 后续 |

---

## 14. 交付清单

### P0（必须实现）

- 角色 CRUD + 用户-角色绑定
- 组织架构 CRUD + 用户-部门绑定
- 权限规则 CRUD（五级权限配置）
- PermissionGuard + PermissionService 权限引擎
- 页面权限（可见性控制 + 菜单过滤）
- 记录级条件权限（行级 WHERE 注入）
- 字段级权限（列级响应裁剪）
- 流程权限（发起 + 审批候选人过滤）
- 数据模型权限（对象表级 + 字段列级）
- 内置角色 END_USER 补充
- 条件编译器（上下文变量 + AND/OR 嵌套）
- 权限缓存
- 当前用户权限查询 API

### P1（尽量实现）

- 组织角色授权（OrgRoleGrant）
- 组织授权扩散（orgPath 向下展开）
- 审计日志
- 权限预览（角色视角查看可见资源）
- 租户管理 CRUD（平台运营级）

### P2（后续迭代）

- 连接器权限（Phase 5 接入）
- PostgreSQL RLS（生产部署）
- 数据掩码
- 子表关联权限扩散

---

## 附录 A：五级权限与四粒度对照矩阵

| | 表级（对象） | 列级（字段） | 行级（记录） | 人员级（动态） |
|---|---|---|---|---|
| **页面权限** | — | — | — | — （页面级，非数据粒度） |
| **记录权限** | — | — | ✅ 条件过滤 | ✅ `${currentUser}` |
| **流程权限** | — | — | — | ✅ 角色限定 |
| **数据模型权限** | ✅ 对象 CRUD | ✅ 字段白名单 | — | — |
| **连接器权限** | — | — | — | ✅ 角色限定 |

> 四粒度（表/列/行/人）是数据权限的控制维度，五级权限是权限的业务维度。二者交叉：
> 数据模型权限覆盖表级 + 列级；记录权限覆盖行级 + 人员级。

## 附录 B：行级条件表达式语法速查

### 叶子条件

```jsonc
{ "field": "<字段apiName>", "operator": "<操作符>", "value": <值或变量> }
```

### 逻辑组合

```jsonc
// AND
{ "and": [<条件1>, <条件2>, ...] }

// OR
{ "or": [<条件1>, <条件2>, ...] }

// 嵌套
{ "and": [<条件1>, { "or": [<条件2>, <条件3>] }] }
```

### 上下文变量

| 变量 | 类型 | 说明 |
|---|---|---|
| `${currentUser}` | string | 当前用户 ID |
| `${user.departments}` | string[] | 当前用户部门 ID 列表 |
| `${user.roles}` | string[] | 当前用户角色编码列表 |
| `${user.orgPath}` | string[] | 当前用户组织树路径（含子节点，用于扩散） |
| `${now}` | string | 当前时间 ISO 8601 |

### 操作符（复用对象筛选）

| 操作符 | 说明 | 值类型 |
|---|---|---|
| `eq` | 等于 | 任意 |
| `ne` | 不等于 | 任意 |
| `in` | 包含于 | 数组 |
| `not_in` | 不包含于 | 数组 |
| `contains` | 包含 | string |
| `gt` / `gte` / `lt` / `lte` | 大于/大于等于/小于/小于等于 | number / 日期 |
| `is_empty` / `is_not_empty` | 为空/不为空 | 无 |
| `relative_date` | 相对日期 | string（如 `-7d`） |
