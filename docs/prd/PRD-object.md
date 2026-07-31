# PRD — 对象 / 数据建模（Phase 1）

> 版本：v1.0 · 日期：2026-07-31 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 对象建模能力
> 关联契约：`packages/shared/src/object/index.ts` · `packages/db/prisma/schema.prisma`
> 验收闸门：Phase 1 产品闸门（ ROADMAP.md ）

---

## 1. 模块概述

### 1.1 定位

对象 / 数据建模是 aPaaS 低代码平台的**数据基石**。一切页面、流程、权限均建立在对象之上：
搭建者通过"对象设计器"声明业务实体（如客户、订单、资产），配置字段与关联关系，
平台基于元数据动态提供记录的增删改查与查询能力——**而非生成源代码**。

本模块是元数据驱动架构（Metadata-Driven）的第一块拼图：

```
对象建模（本模块） → 页面搭建器（Phase 2 绑定对象） → 流程引擎（Phase 3 触发对象记录） → 权限（Phase 4 行级控制）
```

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 像建 Excel 一样定义业务表结构，无需写 SQL/DDL，所见即所得。 |
| 业务用户 | 通过视图直接录入、筛选、导出数据，无需开发介入。 |
| 开发者 | 元数据即契约，对象一经定义，CRUD API、查询、校验自动可用。 |
| 平台 | JSONB 宽表统一存储，新增对象/字段零 DDL，支持多租户隔离。 |

### 1.3 设计原则（与 ARCHITECTURE.md 对齐）

1. **元数据驱动**：对象/字段/视图均为元数据 JSON，运行时引擎读取渲染。
2. **JSONB 宽表存储**：所有对象的业务记录统一存 `records` 表，`object_id + data JSONB + GIN` 索引，新增字段无需 DDL。
3. **类型契约先行**：`packages/shared/src/object/index.ts` 为前后端对接边界（SSOT）。
4. **多租户隔离**：`tenant_id` 行级隔离（生产期叠加 PostgreSQL RLS）。

---

## 2. 核心概念

| 概念 | 定义 | 类比 |
|---|---|---|
| **对象 (Object)** | 一个业务实体的元数据定义，由字段集合 + 配置组成。如"客户""订单"。对应 `ObjectMeta`。 | 数据库表 / 飞书多维表格的"数据表" |
| **字段 (Field)** | 对象上的一个数据列定义，含类型、配置、属性。如"客户名称""电话"。字段是元数据，决定值的校验与查询行为。 | 数据库列 |
| **视图 (View)** | 对象数据的呈现方式配置（筛选/排序/分组/字段显隐）。一个对象可有多个视图。对应 `View`。 | 飞书多维表格的"视图" |
| **记录 (Record)** | 对象的一条运行时数据实例，字段值存于 `data` JSONB。对应 `RecordData`。 | 表的一行 |

### 2.1 系统字段（内置，不可删除）

每个对象创建时自动生成以下系统字段（`isSystem = true`），供审计、关联、展示使用：

| apiName | 含义 | 类型 |
|---|---|---|
| `id` | 记录主键（cuid） | 文本（只读） |
| `name` | 记录标题（由主显示字段 `nameFieldId` 决定，默认取首个文本字段） | 文本 |
| `created_at` | 创建时间 | 日期时间 |
| `updated_at` | 更新时间 | 日期时间 |
| `created_by` | 创建人 | 人员 |
| `updated_by` | 更新人 | 人员 |

> 说明：系统字段存储在 `Record` 表的独立列（`created_by`/`updated_by`/`created_at`/`updated_at`）与 `data` JSONB 中的 `name`，不重复占用业务字段位。`id` 为表主键。

### 2.2 关键标识约定

- **API 名称 (apiName)**：开发者标识，小写下划线（snake_case），应用内唯一（对象）/对象内唯一（字段）。一旦创建，**不可修改**（避免破坏已存记录与 API 契约）。
- **显示名称 (label)**：面向终端用户的中文/任意名称，可随时修改。
- **主显示字段 (nameFieldId)**：决定记录在列表/关联选择器中的标题展示，通常指向一个文本字段。

---

## 3. 功能清单（按优先级分级）

> **P0** = MVP 必须 · **P1** = Phase 1 尽量做 · **P2** = 后续迭代

### 3.1 对象管理

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| O-1 | 创建对象 | 填写显示名称、API 名称（自动从显示名生成 snake_case，可编辑）、图标、描述 | P0 |
| O-2 | 编辑对象 | 修改显示名称、图标、描述、主显示字段；API 名称不可改 | P0 |
| O-3 | 删除对象 | 删除前校验：存在记录 / 被其他对象关联 / 被页面引用时阻止，需先清空 | P0 |
| O-4 | 对象列表 | 按应用列出全部对象，显示名称/记录数/字段数/更新时间 | P0 |
| O-5 | 对象详情 | 展示字段列表、视图列表、记录入口 | P0 |
| O-6 | 复制对象（结构） | 复制字段定义到新对象（不复制数据），API 名称加后缀 | P2 |
| O-7 | 导出对象定义 | 导出对象 + 字段 + 视图为 JSON，供跨环境迁移 | P2 |
| O-8 | 对象图标库 | 提供内置图标集（线性图标），按分类选择 | P1 |

**对象配置项**（对应 `ObjectMeta`）：

| 字段 | 说明 | 约束 |
|---|---|---|
| `apiName` | API 名称 | snake_case，`^[a-z][a-z0-9_]{1,62}$`，应用内唯一 |
| `label` | 显示名称 | 1–40 字符 |
| `labelPlural` | 复数显示名（列表标题） | 可选，缺省取 `label` |
| `icon` | 图标标识 | 可选，内置图标 key |
| `description` | 描述 | 可选，≤200 字符 |
| `nameFieldId` | 主显示字段 | 指向一个文本类字段，缺省为首个文本字段 |
| `isSystem` | 是否系统对象 | 系统对象不可删除（如 User/Org 内置对象） |

### 3.2 字段类型（完整清单）

字段类型体系对标飞书 aPaaS，与 `FieldType` 枚举一致。运行时值以 JSONB 存储，类型决定校验与查询行为。

#### 文本类

| 类型 | FieldType | 配置项 | 说明 | 优先级 |
|---|---|---|---|---|
| 单行文本 | `Text` | `maxLength?`（最大长度，默认 255） | 短文本，如名称、电话 | P0 |
| 多行文本 | `LongText` | `maxLength?`（默认 2000） | 长文本，如备注、描述 | P0 |
| 富文本 | `RichText` | `maxLength?` | HTML 富文本（P1 接入编辑器） | P1 |

#### 数值类

| 类型 | FieldType | 配置项 | 说明 | 优先级 |
|---|---|---|---|---|
| 数字 | `Number` | `number.precision`（小数位数 0–6） | 整数/小数 | P0 |
| 金额 | `Currency` | `number.precision` + `currency.code`（货币代码，如 CNY/USD） | 带货币符号展示 | P1 |
| 百分比 | `Percent` | `number.precision` | 按百分比展示与输入 | P1 |
| 自动编号 | `AutoNumber` | `autoNumber.format`（如 `ORD-{seq:0000}`） | 系统按规则自动生成，不可编辑 | P1 |

#### 选择类

| 类型 | FieldType | 配置项 | 说明 | 优先级 |
|---|---|---|---|---|
| 单选 | `SingleSelect` | `options: SelectOption[]`（id/label/color/isDefault） | 选项互斥，可设默认项 | P0 |
| 多选 | `MultiSelect` | `options: SelectOption[]` | 可多选，值存为 `string[]` | P0 |

> `SelectOption`：`{ id, label, color?, isDefault? }`。选项支持新增、改名、调色、排序、删除（删除时已存记录的值置空或保留为失效值）。

#### 日期时间类

| 类型 | FieldType | 配置项 | 说明 | 优先级 |
|---|---|---|---|---|
| 日期 | `Date` | `format?`（展示格式，如 `YYYY-MM-DD`） | 仅日期，无时间 | P0 |
| 日期时间 | `DateTime` | `format?` | 日期 + 时间，存 ISO 8601 | P1 |

#### 其他基础类型

| 类型 | FieldType | 配置项 | 说明 | 优先级 |
|---|---|---|---|---|
| 复选框 | `Checkbox` | 无 | 布尔值，存 `true/false` | P0 |
| 附件 | `Attachment` | 无（文件存对象引用数组） | 文件上传，值存文件元信息数组 | P1 |
| 人员 | `User` | `multi?`（是否多选） | 引用系统用户，值存 `userId` 或 `userId[]` | P1 |

#### 关联与计算类

| 类型 | FieldType | 配置项 | 说明 | 优先级 |
|---|---|---|---|---|
| 关联 | `Lookup` | `lookup.targetObjectId` / `lookup.relationType` / `lookup.inverseFieldName?` | 关联其他对象，值为目标记录 ID（多对一） | P0 |
| 子表 | `SubForm` | `subForm.childObjectId` / `subForm.parentFieldId` | 主从一对多，值为子记录数组 | P1 |
| 公式 | `Formula` | `formula.expression` / `formula.returnType` | 表达式计算，只读 | P2 |
| 汇总 | `Rollup` | `rollup.targetFieldId` / `rollup.aggregate`（sum/avg/count/min/max） | 聚合关联对象字段 | P2 |

### 3.3 字段属性

适用于大部分字段（关联/子表/公式等特化类型部分属性不适用）：

| 属性 | 字段 | 说明 | 优先级 |
|---|---|---|---|
| 必填 | `required` | 记录保存时校验非空 | P0 |
| 唯一 | `unique` | 全对象内值唯一，保存时校验（基于 JSONB 查询 + 应用层校验） | P1 |
| 可搜索 | `searchable` | 标记参与全局/列表搜索的字段，影响 GIN 索引与查询 | P1 |
| 默认值 | `defaultValue` | 字面量或表达式 `{ __expr: string }`（如 `{ __expr: 'NOW()' }`） | P1 |
| 描述 | `description` | 字段说明，表单中作为提示 | P0 |
| API 名称 | `apiName` | snake_case，对象内唯一，创建后不可改 | P0 |
| 显示名称 | `label` | 可改 | P0 |
| 系统字段标记 | `isSystem` | 系统字段不可删除/改类型 | P0 |

### 3.4 关联关系

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| R-1 | 一对多（Lookup） | 在"多"方对象添加 Lookup 字段指向"一"方，值为目标记录 ID。对应 `RelationType.OneToMany`。 | P0 |
| R-2 | 反向关联字段 | 创建 Lookup 时可选在目标对象自动生成反向字段（显示关联记录列表），命名由 `inverseFieldName` 指定。 | P1 |
| R-3 | 多对多 | 通过中间对象（junction object）实现，两端各建 Lookup 指向中间对象。对应 `RelationType.ManyToMany`。 | P2 |
| R-4 | 级联删除 | 删除"一"方记录时，"多"方记录的 Lookup 值置空（默认）或级联删除（可选）。 | P2 |
| R-5 | 关联记录选择器 | 录入时弹出目标对象的列表视图供选择，按主显示字段展示。 | P1 |

**关联字段配置**（`LookupConfig`）：

```ts
{
  targetObjectId: ObjectId;   // 关联的目标对象
  relationType: RelationType; // OneToMany | ManyToMany
  inverseFieldName?: string;  // 在目标对象上显示的反向引用字段名
}
```

### 3.5 视图

视图类型对标飞书 aPaaS，与 `ViewType` 枚举一致。Phase 1 重点实现列表视图。

| 类型 | ViewType | 描述 | 优先级 |
|---|---|---|---|
| 列表视图 | `List` | 表格形式，支持筛选/排序/分组/字段显隐/分页 | P0 |
| 详情视图 | `Detail` | 单条记录的只读展示布局 | P1 |
| 表单视图 | `Form` | 新增/编辑记录的表单布局 | P1 |
| 看板视图 | `Kanban` | 按单选字段分组的卡片看板 | P2 |
| 日历视图 | `Calendar` | 按日期字段排布的日历 | P2 |
| 画廊视图 | `Gallery` | 附件为主的卡片画廊 | P2 |

#### 列表视图能力（P0 核心）

| # | 能力 | 描述 | 优先级 |
|---|---|---|---|
| V-1 | 字段显隐与顺序 | 选择显示哪些字段列、拖拽调整列顺序、调整列宽。对应 `ViewFieldConfig[]`。 | P0 |
| V-2 | 筛选 | 支持多条件 AND/OR 组合（`FilterGroup`），可选字段 + 操作符（`FilterOperator`）+ 值。 | P0 |
| V-3 | 排序 | 多字段排序（`SortParam[]`），升降序。 | P0 |
| V-4 | 分页 | 默认每页 20/50/100。 | P0 |
| V-5 | 分组 | 按单选/人员/日期字段分组展示。对应 `groupByFieldId`。 | P1 |
| V-6 | 快速搜索 | 顶部关键字搜索（命中 `searchable` 字段）。 | P1 |
| V-7 | 内联编辑 | 列表单元格直接编辑（P1）。 | P1 |
| V-8 | 默认视图 | 每个对象有一个 `isDefault` 视图。 | P0 |

#### 筛选操作符（`FilterOperator`，与契约一致）

`eq` `ne` `contains` `not_contains` `starts_with` `ends_with` `gt` `gte` `lt` `lte` `is_empty` `is_not_empty` `in` `not_in` `relative_date`（相对当前时间，用于日期）。

### 3.6 记录管理

| # | 功能 | 描述 | 优先级 |
|---|---|---|---|
| D-1 | 新增记录 | 按表单视图录入，校验必填/唯一/类型 | P0 |
| D-2 | 编辑记录 | 部分更新（`UpdateRecordRequest`） | P0 |
| D-3 | 查看记录 | 详情视图展示 | P0 |
| D-4 | 删除记录 | 软删除（标记）或硬删除（P0 硬删除，P2 软删除回收站） | P0 |
| D-5 | 列表查询 | 分页 + 筛选 + 排序，返回 `QueryRecordsResponse` | P0 |
| D-6 | 批量删除 | 列表勾选多条删除 | P1 |
| D-7 | 批量编辑 | 列表勾选多条批量修改某字段 | P2 |
| D-8 | 导入 | CSV/Excel 导入，按 apiName 列匹配，校验 + 错误报告 | P1 |
| D-9 | 导出 | 当前视图（含筛选）导出 CSV/Excel | P1 |
| D-10 | 单条按 ID 查询 | `GET /records/:id` | P0 |

> **存储上限**：单对象记录上限参考飞书 aPaaS（单表 1000 万），Phase 1 不做硬限制，仅监控。

---

## 4. 用户故事

### US-1：搭建客户管理对象（核心 P0）

> 作为搭建者，我想创建一个"客户"对象，添加名称/电话/行业字段，然后录入客户数据并在列表中筛选。

**步骤**：
1. 在对象设计器新建对象，填显示名"客户"，API 名自动生成为 `customer`，选择图标。
2. 添加字段：`name`（单行文本，必填，设为主显示字段）、`phone`（单行文本）、`industry`（单选，选项：互联网/制造/金融）。
3. 系统自动创建默认列表视图，展示全部字段。
4. 进入记录列表，新增 3 条客户记录。
5. 在列表视图配置筛选：行业 = 互联网，验证列表仅显示匹配记录。

**验收**：对象创建成功、字段持久化、记录可录入并按筛选条件查询返回正确结果。

### US-2：客户关联订单（一对多，P0）

> 作为搭建者，我想让"订单"对象关联到"客户"，录入订单时能选择所属客户。

**步骤**：
1. 已有"客户"对象。新建"订单"对象，添加 `amount`（数字）字段。
2. 在"订单"添加 Lookup 字段"所属客户"，目标对象选"客户"，关系类型一对多。
3. 录入订单时，"所属客户"字段弹出客户列表选择器，按客户名称展示。
4. （P1）在"客户"对象自动出现反向字段"相关订单"，展示该客户下的订单列表。

### US-3：订单自动编号（P1）

> 作为搭建者，我想让订单编号自动生成 `ORD-0001`、`ORD-0002`。

**步骤**：
1. 在"订单"添加自动编号字段 `order_no`，配置格式 `ORD-{seq:0000}`。
2. 新建订单时该字段只读，系统自动分配递增编号。

### US-4：列表视图个性化（P0）

> 作为业务用户，我想在客户列表只看本周新增的金融行业客户，按创建时间倒序。

**步骤**：
1. 打开客户列表视图，配置筛选：行业 = 金融，且 创建时间 相对当前 = 本周。
2. 排序：创建时间 倒序。
3. 隐藏不需要的列（如 updated_by）。
4. 保存为个人视图（P1 支持个人视图与共享视图区分）。

### US-5：数据导入（P1）

> 作为搭建者，我想把现有 500 条客户 Excel 导入到客户对象。

**步骤**：
1. 在客户列表点"导入"，上传 Excel。
2. 系统按列头与字段 apiName 自动映射，可手动调整映射。
3. 预校验：必填缺失/类型不符的行标记错误。
4. 确认导入，返回成功数与错误明细。

---

## 5. 数据模型（与现有 Prisma schema / shared 类型映射）

### 5.1 存储架构

```
元数据（meta-svc 管辖）            运行时数据（runtime-svc 管辖）
┌──────────────────┐               ┌──────────────────────────┐
│ ObjectMeta       │ 1           n │ Record                   │
│  - fields: JSON  │◄─────────────│  - object_id              │
│  (字段定义数组)   │               │  - data: JSONB (业务值)    │
└──────┬───────────┘               │  - GIN 索引加速查询        │
       │ 1                         └──────────────────────────┘
       │ n
┌──────▼───────────┐
│ View             │
│  - config: JSON  │
│  (筛选/排序/显隐) │
└──────────────────┘
```

**核心决策**：字段（Field）**不单独建表**，而是作为 `ObjectMeta.fields` JSON 数组存储——这与元数据驱动原则一致，新增字段零 DDL。`shared` 的 `Field` 接口定义的是该 JSON 数组元素的形状。

### 5.2 映射表：shared 类型 ↔ Prisma 模型

#### ObjectMeta

| shared `ObjectMeta` 字段 | Prisma `ObjectMeta` 列 | 状态 | 处理 |
|---|---|---|---|
| `id` | `id` | ✅ 一致 | — |
| `tenantId` | `tenantId` | ✅ 一致 | — |
| `appId` | `appId` | ✅ 一致 | — |
| `apiName` | `apiName` | ✅ 一致 | 唯一约束 `[appId, apiName]` |
| `label` | `name` | ⚠️ 命名不一致 | **建议** Prisma 增 `label` 列（或前端映射 `name↔label`）。本文档统一用 `label`，开发时定 |
| `labelPlural` | — | ❌ 缺失 | **Phase 1 需补列** `label_plural` |
| `icon` | `icon` | ✅ 一致 | — |
| `nameFieldId` | — | ❌ 缺失 | **Phase 1 需补列** `name_field_id`（存于 fields JSON 内或独立列） |
| `description` | `description` | ✅ 一致 | — |
| `isSystem` | `isSystem` | ✅ 一致 | — |
| `recordLevelSecurity` | — | ❌ 缺失 | Phase 1 默认 `false`，可存入扩展 JSON；Phase 4 启用 |
| `createdBy` | — | ❌ 缺失 | **Phase 1 需补列** `created_by` |
| `createdAt/updatedAt` | `createdAt/updatedAt` | ✅ 一致 | — |
| `fields: Field[]` | `fields: Json` | ✅ JSON 存储 | `Field` 接口 = JSON 元素形状 |

#### Field（无独立 Prisma 模型，存于 ObjectMeta.fields JSON）

`shared` `Field` 接口每个属性即 JSON 元素的 key：`id` `objectId` `apiName` `label` `type` `config` `required` `unique` `searchable` `defaultValue` `description` `isSystem` `createdAt` `updatedAt`。`FieldConfig` 联合按 `type` 区分，对应各类型配置项（见 3.2）。

#### View

| shared `View` 字段 | Prisma `View` 列 | 状态 | 处理 |
|---|---|---|---|
| `id` | `id` | ✅ 一致 | — |
| `objectId` | `objectId` | ✅ 一致 | — |
| `name` | `name` | ✅ 一致 | — |
| `type` | `type` | ✅ 一致（值取 ViewType） | — |
| `tenantId` | — | ⚠️ 缺失 | 可经 object 反查 tenant；可选补列 |
| `filters` | `config.filters` | ✅ 存 config JSON | `FilterGroup` 形状 |
| `sorts` | `config.sorts` | ✅ 存 config JSON | `SortParam[]` 形状 |
| `groupByFieldId` | `config.groupByFieldId` | ✅ 存 config JSON | — |
| `fields` | `config.fields` | ✅ 存 config JSON | `ViewFieldConfig[]` 形状 |
| `layoutConfig` | `config.layoutConfig` | ✅ 存 config JSON | 看板/日历特化 |
| `isDefault` | `config.isDefault` | ✅ 存 config JSON | — |

#### Record

| shared `RecordData` 字段 | Prisma `Record` 列 | 状态 |
|---|---|---|
| `id` | `id` | ✅ |
| `objectId` | `objectId` | ✅ |
| `tenantId` | `tenantId` | ✅ |
| `appId` | `appId` | ✅ |
| `data` | `data` (JSONB) | ✅ key = field.apiName |
| `createdBy/updatedBy` | `createdBy/updatedBy` | ✅ |
| `createdAt/updatedAt` | `createdAt/updatedAt` | ✅ |

### 5.3 Phase 1 需要的 Prisma 迁移

基于上述映射差异，Phase 1 开发前需对 `schema.prisma` 补充：

1. `ObjectMeta` 增列：`label_plural String?`、`name_field_id String?`、`created_by String?`、`record_level_security Boolean @default(false)`。
2. `ObjectMeta.name` 与 `label` 的命名统一（建议保留 `name` 作显示名，shared 侧 `label` 别名映射；或在 Prisma 增 `label`，二者择一，由开发闸门定）。
3. `records.data` 的 GIN 索引（迁移 SQL 补充，Prisma 不直接支持 GIN on Json）——已在 schema 注释中预留。
4. `Record` 软删除字段 `deleted_at DateTime?`（P2 回收站，可延后）。

---

## 6. API 设计

> 约定：所有路由经 gateway（`apps/gateway`），JWT 保护，`tenantId` 从 token 提取。
> 响应统一 `{ ok: true, data }` / `{ ok: false, error }`（见 `ApiResponse`）。
> 元数据 CRUD 路由到 **meta-svc**；记录 CRUD/查询路由到 **runtime-svc**。

### 6.1 对象 CRUD（meta-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/apps/:appId/objects` | 列出应用下对象 | P0 |
| GET | `/objects/:objectId` | 获取对象（含字段） | P0 |
| POST | `/apps/:appId/objects` | 创建对象 | P0 |
| PUT | `/objects/:objectId` | 更新对象（label/icon/desc/nameField） | P0 |
| DELETE | `/objects/:objectId` | 删除对象（前置校验） | P0 |

**创建对象请求体**：
```jsonc
{
  "apiName": "customer",
  "label": "客户",
  "labelPlural": "客户",
  "icon": "user",
  "description": "客户主数据"
}
```

### 6.2 字段 CRUD（meta-svc）

字段是对象的子资源，存于 ObjectMeta.fields JSON。

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/objects/:objectId/fields` | 列出字段 | P0 |
| POST | `/objects/:objectId/fields` | 新增字段（写回 fields JSON） | P0 |
| PUT | `/objects/:objectId/fields/:fieldId` | 更新字段配置/属性 | P0 |
| DELETE | `/objects/:objectId/fields/:fieldId` | 删除字段（系统字段禁止） | P0 |

**新增字段请求体**（对应 `Field` 去除 id/timestamps）：
```jsonc
{
  "apiName": "phone",
  "label": "电话",
  "type": "text",
  "config": { "type": "text", "maxLength": 20 },
  "required": false,
  "unique": false,
  "searchable": true,
  "description": "客户联系电话"
}
```

### 6.3 视图 CRUD（meta-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/objects/:objectId/views` | 列出视图 | P0 |
| GET | `/views/:viewId` | 获取视图（含 config） | P0 |
| POST | `/objects/:objectId/views` | 创建视图 | P0 |
| PUT | `/views/:viewId` | 更新视图配置 | P0 |
| DELETE | `/views/:viewId` | 删除视图（默认视图禁止删） | P0 |

### 6.4 记录 CRUD / 查询（runtime-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/objects/:objectId/records` | 查询记录（分页+筛选+排序），query 传 `QueryRecordsRequest` | P0 |
| GET | `/records/:recordId` | 按 ID 查单条 | P0 |
| POST | `/objects/:objectId/records` | 新增记录 | P0 |
| PUT | `/records/:recordId` | 更新记录（部分更新） | P0 |
| DELETE | `/records/:recordId` | 删除记录 | P0 |
| POST | `/objects/:objectId/records/batch-delete` | 批量删除 | P1 |
| POST | `/objects/:objectId/records/import` | 导入（multipart） | P1 |
| GET | `/objects/:objectId/records/export` | 导出（按视图筛选） | P1 |

**查询记录请求**（GET query 或 POST body，对应 `QueryRecordsRequest`）：
```jsonc
{
  "objectId": "obj_xxx",
  "pagination": { "page": 1, "pageSize": 20 },
  "sorts": [{ "field": "created_at", "order": "desc" }],
  "filters": {
    "logic": "AND",
    "conditions": [
      { "fieldId": "fld_industry", "operator": "eq", "value": "internet" }
    ]
  },
  "fieldIds": ["fld_name", "fld_phone"]   // 可选，仅返回指定字段
}
```

### 6.5 校验与错误约定

- API 名称冲突 → `409 VALIDATION_ERROR` + `fieldErrors.apiName`。
- 必填缺失 / 类型不符 → `400 VALIDATION_ERROR` + `fieldErrors.<apiName>`。
- 唯一约束冲突 → `409 UNIQUE_VIOLATION`。
- 删除被引用对象 → `409 CONFLICT` + 提示引用方。
- 记录不存在 → `404 NOT_FOUND`。

---

## 7. 验收标准（Phase 1 完成闸门）

> 对齐 ROADMAP.md：**创建对象、加字段、录入查询记录。**

### 功能验收（可验证）

1. **对象**：能创建对象（含 apiName/label/icon/description），编辑非 apiName 字段，删除空对象；删除有记录的对象被正确阻止。
2. **字段**：能在对象上增删改 P0 字段类型（文本/多行文本/数字/单选/多选/日期/复选框/关联），配置必填/描述；系统字段不可删。
3. **关联**：能建立一对多 Lookup 关联，录入时选择目标记录，反向字段（P1）在目标对象可见。
4. **视图**：对象自动创建默认列表视图；能配置字段显隐/顺序、筛选（AND/OR）、排序、分页并保存。
5. **记录**：能新增/编辑/查看/删除记录，必填与类型校验生效；列表查询按筛选+排序+分页返回正确结果。
6. **多租户**：A 租户的对象/记录对 B 租户不可见。
7. **端到端**：完成 US-1（客户对象 + 字段 + 录入 + 筛选）全流程跑通。

### 技术验收

8. `packages/shared/src/object/index.ts` 类型在前后端全链路使用，无 `any` 逃逸。
9. Prisma schema 完成 5.3 所列迁移，`records.data` GIN 索引生效。
10. meta-svc 提供对象/字段/视图 CRUD；runtime-svc 提供记录 CRUD + 动态查询。
11. 对象设计器（`packages/studio/.../ObjectDesigner.tsx`）可用：建对象、加字段、配视图、录记录。

---

## 8. 非目标（Phase 1 不做）

| 非目标 | 说明 | 归属阶段 |
|---|---|---|
| 数据集 (Dataset) | 飞书 aPaaS 中由数据流加工聚合生成的实体数据表，区别于直接创建的对象。Phase 1 只做"对象"，不做数据流/数据集。 | 后续 |
| 图表 / 仪表盘视图 | Kanban/Calendar/Gallery 视图、统计图表。 | P2 / Phase 5 |
| 公式与汇总字段执行引擎 | `Formula`/`Rollup` 字段类型契约保留，但表达式引擎与实时计算不在 Phase 1 实现（可存配置，不执行）。 | P2 |
| 字段级加密 / 字段级权限 | 细粒度字段可见性控制、字段加密存储。 | Phase 4 |
| 记录级权限规则 | `recordLevelSecurity` 字段保留，但条件规则配置与执行不在 Phase 1（默认关闭）。 | Phase 4 |
| 多对多关联（中间对象自动生成） | 契约保留 `ManyToMany`，Phase 1 仅支持一对多。 | P2 |
| 软删除 / 回收站 | Phase 1 删除即硬删除，无回收站。 | P2 |
| API 名称重命名 / 字段类型转换 | 已存数据后改类型/改名涉及数据迁移，Phase 1 禁止。 | 后续 |
| 跨应用对象关联 | 关联仅限同应用内对象。 | 后续 |
| Webhook / 外部数据源同步 | 对象仅平台内存储，不接外部数据源。 | 后续 |
| 审计日志 / 操作历史 | 字段变更与记录操作的历史留痕。 | Phase 4/5 |

---

## 附录 A：字段类型与配置速查（对齐 shared FieldConfig）

| FieldType | FieldConfig 形状 | 运行时值类型 |
|---|---|---|
| `text` / `long_text` / `rich_text` | `{ type, maxLength? }` | `string` |
| `number` | `{ type, number: { precision } }` | `number` |
| `currency` | `{ type, currency: { precision, code } }` | `number` |
| `percent` | `{ type, number: { precision } }` | `number` |
| `auto_number` | `{ type, autoNumber: { format } }` | `string` |
| `single_select` / `multi_select` | `{ type, options: SelectOption[] }` | `string` / `string[]` |
| `date` / `date_time` | `{ type, format? }` | `string`(ISO) |
| `checkbox` | `{ type }` | `boolean` |
| `attachment` | `{ type }` | `Record<string,unknown>[]` |
| `user` | `{ type, multi? }` | `string` / `string[]` |
| `lookup` | `{ type, lookup: LookupConfig }` | `string`(记录ID) |
| `sub_form` | `{ type, subForm: SubFormConfig }` | `Record<string,unknown>[]` |
| `formula` | `{ type, formula: FormulaConfig }` | 由 returnType 定 |
| `rollup` | `{ type, rollup: { targetFieldId, aggregate } }` | `number` |

## 附录 B：P0 交付清单（MVP 最小集）

- 对象：创建/编辑/删除/列表/详情（O-1~O-5）
- 字段类型：text / long_text / number / single_select / multi_select / date / checkbox / lookup
- 字段属性：required / description / apiName / label / isSystem
- 关联：一对多 Lookup（R-1）
- 视图：列表视图（字段显隐/顺序 + 筛选 + 排序 + 分页 + 默认视图）（V-1~V-4, V-8）
- 记录：新增/编辑/查看/删除/列表查询/按ID查询（D-1~D-6 之 D-1~D-5, D-10）
- API：6.1 / 6.2 / 6.3 / 6.4 的 P0 项
- 系统字段自动生成
