# PRD — 可视化页面搭建器（Phase 2）

> 版本：v1.0 · 日期：2026-07-31 · 负责人：产品经理（主智能体）
> 对标：飞书 aPaaS 页面与 UI 模块（85+ 组件 / 视图模型 / 事件系统）
> 关联契约：`packages/shared/src/page/index.ts` · `packages/db/prisma/schema.prisma`（PageMeta）
> 验收闸门：Phase 2 产品闸门（ ROADMAP.md ）

---

## 1. 模块概述

### 1.1 定位

页面搭建器是 aPaaS 低代码平台的**表现层核心**，也是整个平台工作量最大的模块。它让搭建者通过拖拽组件、配置属性、绑定数据、编排事件，**所见即所得地搭建业务页面**——而无需编写前端代码。

本模块延续平台的**元数据驱动（Metadata-Driven）架构**：搭建器产出的不是源代码，而是一份 **页面 Schema JSON**（组件树 + 视图模型 + 绑定关系）。运行时渲染器读取这份 Schema 动态渲染页面，并处理数据查询与事件交互。

```
对象建模(Phase 1) ──提供数据源──▶ 页面搭建器(本模块) ──产出Schema JSON──▶ 运行时渲染器
       │                                   │                              │
       │                              绑定对象记录                          调记录API
       │                              编排事件动作                          处理事件
       ▼                                   ▼                              ▼
   records JSONB                     PageMeta.schema                   runtime-ui 渲染
```

页面搭建器在平台中的位置：

| 上游 | 本模块 | 下游 |
|---|---|---|
| 对象建模提供 `ObjectMeta`/`View`/字段定义作为数据源 | 页面搭建器产出 `PageSchema` JSON | 运行时渲染器（runtime-ui）读取 Schema 渲染 |
| 应用管理提供 `appId` 作为页面归属 | 绑定对象 → 自动生成 CRUD 页面 | 终端用户在 runtime-ui 中操作页面 |
| 流程引擎（Phase 3）接收页面按钮触发的动作 | 事件动作可 `trigger_process` | 流程执行后回写状态到视图模型 |

### 1.2 价值

| 角色 | 价值 |
|---|---|
| 搭建者 | 拖拽搭建 CRUD 三件套（列表/详情/表单），绑定对象即可用，无需写前端代码。 |
| 终端用户 | 在 runtime-ui 中获得完整的增删改查体验，筛选/排序/分页/表单校验开箱即用。 |
| 开发者 | Schema JSON 即契约，搭建器与运行时渲染器以此为对接边界（SSOT），解耦编辑态与运行态。 |
| 平台 | 页面元数据存于 `PageMeta.schema`，新增页面零代码，支持多租户隔离与应用内复用。 |

### 1.3 设计原则（与 ARCHITECTURE.md 对齐）

1. **元数据驱动**：搭建器产出的 `PageSchema` 是纯数据 JSON，运行时渲染器读取渲染——不生成源代码。
2. **Schema 即 SSOT**：`packages/shared/src/page/index.ts` 为搭建器、运行时渲染器、后端 API 的唯一对接边界。
3. **数据与视图分离**：视图模型（ViewModel）承载页面状态树，组件属性通过表达式绑定状态节点，而非直接硬编码数据请求。
4. **声明式事件**：事件以 `ActionConfig` 声明式描述（查询/提交/跳转/弹窗），由运行时统一调度执行，而非手写回调。
5. **对象优先**：列表/详情/表单三类标准页面基于对象元数据**自动生成模板**，搭建者从模板起步微调，而非从空白页搭起。

### 1.4 范围边界

| Phase 2 做 | Phase 2 不做（见 §11） |
|---|---|
| 25 个核心组件（容器/数据/表单/展示） | 自定义组件开发 SDK |
| 5 种标准页面类型 + 模板自动生成 | 飞书 85+ 组件全集（仅做 MVP 25 个） |
| 视图模型 + 表达式绑定引擎 | 移动端原生适配（仅响应式 CSS） |
| 事件动作系统（12 种 ActionType） | 组件市场 / 跨企业共享 |
| 拖拽搭建器（三栏布局 + 撤销重做） | JS 页面级代码扩展（仅声明式事件） |
| 运行时渲染器（runtime-ui） | 仪表盘图表引擎（Chart 组件仅占位） |

---

## 2. 核心概念

页面搭建器围绕五个核心概念组织。它们的关系如下：

```
PageSchema
├── viewModel: ViewModel     ← 视图模型（页面状态树）
│   └── variables: { record, list, selectedId, ... }
└── root: ComponentNode      ← 组件树根节点
    ├── props: { ... }       ← 属性值可绑定 ViewModel 路径
    ├── events?: [ ... ]     ← 事件触发 ActionConfig
    └── children: [ ... ]    ← 递归子节点
```

| 概念 | 定义 | 对应类型 | 类比 |
|---|---|---|---|
| **页面 Schema** | 搭建器产出的元数据 JSON，含组件树 + 视图模型 + 绑定关系，存于 `PageMeta.schema`。 | `PageSchema` | React 组件树的 JSON 序列化 |
| **视图模型 ViewModel** | 页面级状态树，组件属性通过表达式绑定到状态节点；状态节点可作为组件数据源。 | `ViewModel` | Vue 的 data / Redux store |
| **组件树 ComponentNode** | 页面的树形结构，容器类组件持有 `children`，叶子组件承载具体交互。 | `ComponentNode` | DOM 树 |
| **表达式绑定** | 组件属性值可绑定到视图模型路径（`{__bind}`）或内联表达式（`{__expr}`），实现数据驱动渲染。 | `PropValue` | Vue 的 `v-bind` / `{{ }}` |
| **事件动作系统** | 组件事件（onClick/onChange）触发动作链（ActionType 12 种），声明式描述交互逻辑。 | `ActionConfig` | 低代码版的事件回调 |

### 2.1 页面 Schema（PageSchema）

页面 Schema 是搭建器的**唯一产出物**，也是运行时渲染器的**唯一输入**。其结构对应 `packages/shared/src/page/index.ts` 的 `PageSchema`：

```jsonc
{
  "version": "1",
  "pageType": "list_page",
  "viewModel": {
    "variables": {
      "list": {
        "type": "record_list",
        "datasource": { "objectId": "obj_xxx", "viewId": "vie_yyy", "autoQuery": true }
      },
      "selectedId": { "type": "scalar", "initialValue": null }
    }
  },
  "root": {
    "id": "node_page",
    "type": "page",
    "props": { "title": "客户列表" },
    "children": [
      {
        "id": "node_table",
        "type": "data_table",
        "props": {
          "data": { "__bind": "vm.list.records" },
          "columns": [ /* 字段列配置 */ ]
        }
      }
    ]
  }
}
```

**版本约定**：`version: "1"` 为 Phase 2 的 Schema 版本。后续版本演进需保留向前兼容的迁移逻辑。

### 2.2 视图模型 ViewModel

视图模型是页面的**状态中枢**。它定义了页面的所有状态节点（变量），组件通过表达式绑定读写这些节点。

- **状态节点 = 变量**：每个变量有类型（`VariableType`）、初始值、可选的数据源配置。
- **数据源驱动**：`record_list` / `record` 类型的变量可配置 `DatasourceConfig`，绑定到对象记录，由运行时自动调数据 API 填充。
- **组件绑定**：组件属性通过 `{ __bind: 'vm.list.records' }` 绑定到状态节点路径，数据变化时组件自动更新。
- **事件读写**：事件动作（如 `set_variable`、`query_records`）可读写状态节点。

详见 [§5 视图模型](#5-视图模型-viewmodel)。

### 2.3 组件树 ComponentNode

组件树是页面的**结构骨架**，由 `ComponentNode` 递归组成：

| 属性 | 说明 |
|---|---|
| `id` | 节点唯一 ID（页面内），搭建器自动生成（cuid），用于选中、拖拽、绑定引用。 |
| `type` | 组件类型（`ComponentType` 枚举，25 种）。决定可配置的属性与渲染行为。 |
| `name` | 组件实例名称，搭建器组件树面板中显示，便于定位（如"客户表格""提交按钮"）。 |
| `props` | 组件属性键值对，值为字面量或绑定表达式（`PropValue`）。 |
| `children` | 子节点数组（仅容器类组件：Page/Section/Tabs/Grid/GridColumn/Form）。 |
| `hidden` | 是否隐藏，可为布尔值或绑定表达式（`{ __bind: 'vm.record.status === "draft"' }`）。 |

**容器 vs 叶子**：

- **容器类**（Page/Section/Tabs/Grid/GridColumn/Form）：持有 `children`，负责布局与分组。
- **叶子类**（TextInput/DataTable/Button 等）：无 `children`，承载具体展示与交互。

### 2.4 表达式绑定

组件属性值有三种形态，对应 `PropValue` 联合类型：

| 形态 | 语法 | 示例 | 说明 |
|---|---|---|---|
| **字面量** | 直接值 | `"客户列表"` / `20` / `true` | 静态值，不随状态变化。 |
| **绑定** | `{ __bind: '路径' }` | `{ "__bind": "vm.record.name" }` | 绑定到视图模型路径，数据变化时组件自动更新。 |
| **表达式** | `{ __expr: '表达式' }` | `{ "__expr": "vm.list.total > 100" }` | 内联表达式，支持运算与函数。 |

**绑定路径约定**：以 `vm.` 开头表示视图模型根，如 `vm.list.records`、`vm.record.name`、`vm.selectedId`。

**表达式引擎语法**（Phase 2 MVP 子集）：

- 属性访问：`vm.record.name`
- 比较运算：`===` `!==` `>` `<` `>=` `<=`
- 逻辑运算：`&&` `||` `!`
- 三元表达式：`vm.record.status === 'active' ? '激活' : '停用'`
- 内置函数：`NOW()`（当前时间）、`EMPTY(v)`（是否为空）、`LEN(v)`（长度）

> **约束**：Phase 2 表达式引擎实现 MVP 子集（属性访问 + 比较 + 逻辑 + 三元 + 5 个内置函数），不实现完整 JS 沙箱。表达式在运行时由受限解释器执行，非 `eval`。

### 2.5 事件动作系统

事件动作系统是页面的**交互逻辑层**，声明式描述"当 X 发生时，执行 Y"。

- **组件事件**：每个组件可声明事件（如 Button 的 `onClick`、TextInput 的 `onChange`、Page 的 `onLoad`）。
- **动作配置**：事件触发 `ActionConfig`，含动作类型（`ActionType` 12 种）与参数。
- **动作链**：一个事件可配置多个动作，按顺序执行，支持条件判断。
- **条件判断**：每个动作执行前可配置 `condition`（表达式），为 `true` 才执行。

```jsonc
// Button 的 onClick 事件：确认后提交表单，成功后提示并跳转
{
  "type": "button",
  "props": {
    "label": "保存",
    "onClick": [
      {
        "type": "confirm",
        "params": { "title": "确认保存", "content": "确定要提交吗？" }
      },
      {
        "type": "update_record",
        "params": {
          "objectId": { "__bind": "vm.record.__objectId" },
          "recordId": { "__bind": "vm.record.id" },
          "data": { "__bind": "vm.record" }
        },
        "condition": { "__expr": "vm.record.id != null" }
      },
      { "type": "toast", "params": { "message": "保存成功", "type": "success" } },
      { "type": "navigate", "params": { "pageSlug": "customer_detail", "params": { "id": { "__bind": "vm.record.id" } } } }
    ]
  }
}
```

详见 [§6 事件系统](#6-事件系统)。

---

## 3. 组件清单

对标飞书 aPaaS 85+ 组件，Phase 2 MVP **先行实现 25 个核心组件**，覆盖容器、数据、表单、展示四大类。组件清单与 `ComponentType` 枚举一一对应。

> **P0** = Phase 2 MVP 必须 · **P1** = Phase 2 尽量做 · **P2** = 后续迭代

### 3.1 组件总览

| # | 组件 | ComponentType | 分类 | 优先级 | 容器 |
|---|---|---|---|---|---|
| 1 | 页面 | `page` | 容器 | P0 | 是 |
| 2 | 分区 | `section` | 容器 | P0 | 是 |
| 3 | 标签页 | `tabs` | 容器 | P0 | 是 |
| 4 | 栅格 | `grid` | 容器 | P0 | 是 |
| 5 | 栅格列 | `grid_column` | 容器 | P0 | 是 |
| 6 | 数据表格 | `data_table` | 数据 | P0 | 否 |
| 7 | 详情卡片 | `detail_card` | 数据 | P0 | 否 |
| 8 | 列表 | `list` | 数据 | P1 | 否 |
| 9 | 表单 | `form` | 表单 | P0 | 是 |
| 10 | 单行文本 | `text_input` | 表单 | P0 | 否 |
| 11 | 多行文本 | `textarea` | 表单 | P0 | 否 |
| 12 | 数字输入 | `number_input` | 表单 | P0 | 否 |
| 13 | 下拉选择 | `select` | 表单 | P0 | 否 |
| 14 | 多选下拉 | `multi_select` | 表单 | P0 | 否 |
| 15 | 日期选择 | `date_picker` | 表单 | P0 | 否 |
| 16 | 单选 | `radio` | 表单 | P0 | 否 |
| 17 | 复选框 | `checkbox` | 表单 | P0 | 否 |
| 18 | 开关 | `switch` | 表单 | P0 | 否 |
| 19 | 关联选择器 | `lookup_picker` | 表单 | P0 | 否 |
| 20 | 子表表格 | `sub_form_table` | 表单 | P0 | 否 |
| 21 | 附件上传 | `attachment_upload` | 表单 | P0 | 否 |
| 22 | 人员选择 | `user_picker` | 表单 | P0 | 否 |
| 23 | 按钮 | `button` | 展示 | P0 | 否 |
| 24 | 统计数字 | `statistic` | 展示 | P1 | 否 |
| 25 | 图表 | `chart` | 展示 | P2 | 否 |
| 26 | 富文本展示 | `rich_text_display` | 展示 | P0 | 否 |
| 27 | 分割线 | `divider` | 展示 | P0 | 否 |
| 28 | 文本 | `text` | 展示 | P0 | 否 |

> 说明：`ComponentType` 枚举共 28 个值，Phase 2 MVP 完成全部 P0 项（25 个），P1 项尽量做，P2 项占位。

### 3.2 容器类组件

#### Page（页面） `page` · P0

页面根容器，每个 Schema 的 `root` 必须是 Page。

| 属性 | 类型 | 说明 |
|---|---|---|
| `title` | `string \| {__bind}` | 页面标题 |
| `description` | `string \| {__bind}` | 页面描述 |

**事件**：`onLoad`（页面加载时触发，常用于 `query_records` 自动查询）。

#### Section（分区） `section` · P0

内容分区，用于将页面划分为多个区块。

| 属性 | 类型 | 说明 |
|---|---|---|
| `title` | `string \| {__bind}` | 分区标题 |
| `collapsible` | `boolean` | 是否可折叠 |
| `defaultCollapsed` | `boolean` | 默认是否折叠 |

#### Tabs（标签页） `tabs` · P0

多标签切换容器，`children` 为各标签页内容。

| 属性 | 类型 | 说明 |
|---|---|---|
| `tabs` | `Array<{ label, key }>` | 标签页配置 |
| `activeKey` | `string \| {__bind}` | 当前激活标签（可绑定） |

#### Grid（栅格） `grid` · P0

栅格布局容器，`children` 为 GridColumn。

| 属性 | 类型 | 说明 |
|---|---|---|
| `columns` | `number` | 栅格列数（1-24） |
| `gutter` | `number` | 列间距（px） |

#### GridColumn（栅格列） `grid_column` · P0

栅格列容器，必须作为 Grid 的子节点。

| 属性 | 类型 | 说明 |
|---|---|---|
| `span` | `number` | 占据列数（1-24） |

### 3.3 数据类组件

#### DataTable（数据表格） `data_table` · P0

绑定记录列表，支持分页/筛选/排序/行选择。是列表页的核心组件。

| 属性 | 类型 | 说明 |
|---|---|---|
| `data` | `{__bind}` | 绑定 `vm.list.records`（记录数组） |
| `columns` | `Array<ColumnConfig>` | 列配置（字段 ID + 标题 + 宽度） |
| `pagination` | `boolean` | 是否分页 |
| `pageSize` | `number` | 每页条数（默认 20） |
| `selectable` | `boolean` | 是否可多选行 |
| `showIndex` | `boolean` | 是否显示序号列 |

**ColumnConfig 结构**：
```jsonc
{ "fieldId": "fld_name", "label": "客户名称", "width": 200, "sortable": true }
```

**事件**：
- `onRowClick`：点击行（常用于跳转详情页）
- `onSelectionChange`：选择行变化
- `onPageChange`：翻页（触发 `query_records` 带分页参数）

#### DetailCard（详情卡片） `detail_card` · P0

绑定单条记录，按字段布局展示。是详情页的核心组件。

| 属性 | 类型 | 说明 |
|---|---|---|
| `record` | `{__bind}` | 绑定 `vm.record`（单条记录） |
| `fields` | `Array<FieldDisplayConfig>` | 字段展示配置（字段 ID + 标签 + 组件类型） |
| `columns` | `number` | 布局列数（1-3，字段按列排布） |

**FieldDisplayConfig 结构**：
```jsonc
{ "fieldId": "fld_name", "label": "客户名称", "span": 1 }
```

#### List（列表） `list` · P1

通用列表展示（卡片式），区别于 DataTable 的表格形式。

| 属性 | 类型 | 说明 |
|---|---|---|
| `data` | `{__bind}` | 绑定记录数组 |
| `template` | `ComponentNode` | 单项渲染模板（可含子组件） |

### 3.4 表单类组件

#### Form（表单） `form` · P0

表单容器，承载表单字段组件，负责统一校验与提交。是表单页的核心组件。

| 属性 | 类型 | 说明 |
|---|---|---|
| `record` | `{__bind}` | 绑定 `vm.record`（表单数据对象） |
| `objectId` | `string \| {__bind}` | 关联对象 ID |
| `layout` | `'vertical' \| 'horizontal'` | 表单布局 |
| `labelSpan` | `number` | 标签宽度（horizontal 布局） |
| `columns` | `number` | 字段列数（1-3） |

**事件**：
- `onSubmit`：提交表单（校验通过后触发）
- `onValidate`：字段校验

> Form 的子组件（TextInput 等）通过 `fieldId` 绑定到 `vm.record.<fieldApiName>`，无需手动写 `__bind`——Form 容器自动将子组件的 `fieldId` 映射到 `vm.record` 的对应字段。

#### TextInput（单行文本） `text_input` · P0

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（Form 内自动映射到 `vm.record`） |
| `label` | `string` | 标签 |
| `placeholder` | `string` | 占位提示 |
| `required` | `boolean` | 是否必填 |
| `maxLength` | `number` | 最大长度 |
| `disabled` | `boolean \| {__bind}` | 是否禁用 |

**事件**：`onChange`（值变化时触发，可联动 `set_variable`）。

#### TextArea（多行文本） `textarea` · P0

同 TextInput，额外属性：

| 属性 | 类型 | 说明 |
|---|---|---|
| `rows` | `number` | 行数（默认 4） |
| `showCount` | `boolean` | 是否显示字数统计 |

#### NumberInput（数字输入） `number_input` · P0

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID |
| `precision` | `number` | 小数位数 |
| `min` | `number` | 最小值 |
| `max` | `number` | 最大值 |
| `step` | `number` | 步长 |

#### Select（下拉选择） `select` · P0

绑定单选/多选字段的选项，或静态选项。

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（单选字段） |
| `options` | `Array<{label, value}> \| {__bind}` | 选项列表（可绑定动态选项） |
| `allowClear` | `boolean` | 允许清除 |

#### MultiSelect（多选下拉） `multi_select` · P0

同 Select，值类型为 `string[]`。

#### DatePicker（日期选择） `date_picker` · P0

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（日期/日期时间字段） |
| `showTime` | `boolean` | 是否含时间（日期时间字段为 true） |
| `format` | `string` | 显示格式（默认 `YYYY-MM-DD`） |

#### Radio（单选） `radio` · P0

单选按钮组，属性同 Select。

#### Checkbox（复选框） `checkbox` · P0

布尔复选框，绑定 checkbox 类型字段。

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（checkbox 字段） |
| `label` | `string` | 标签 |

#### Switch（开关） `switch` · P0

开关切换，同 Checkbox 的布尔语义，UI 不同。

#### LookupPicker（关联选择器） `lookup_picker` · P0

选择关联对象的记录，绑定 lookup 字段。

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（lookup 字段） |
| `targetObjectId` | `string` | 目标对象 ID（从字段配置自动填充） |
| `displayField` | `string` | 显示字段（目标对象的主显示字段） |
| `multiple` | `boolean` | 是否多选 |

**交互**：点击弹出目标对象的列表视图（复用对象视图配置），选择记录后回填记录 ID。

#### SubFormTable（子表表格） `sub_form_table` · P0

主从子表，绑定 sub_form 字段，支持行内编辑。

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（sub_form 字段） |
| `childObjectId` | `string` | 子对象 ID（从字段配置自动填充） |
| `columns` | `Array<ColumnConfig>` | 列配置（子对象字段） |
| `editable` | `boolean` | 是否可编辑 |

#### AttachmentUpload（附件上传） `attachment_upload` · P0

文件上传，绑定 attachment 字段。

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（attachment 字段） |
| `maxCount` | `number` | 最大数量 |
| `accept` | `string` | 接受的文件类型 |

#### UserPicker（人员选择） `user_picker` · P0

选择系统用户，绑定 user 字段。

| 属性 | 类型 | 说明 |
|---|---|---|
| `fieldId` | `string` | 绑定字段 ID（user 字段） |
| `multiple` | `boolean` | 是否多选 |

### 3.5 展示类组件

#### Button（按钮） `button` · P0

通用按钮，事件交互的主要触发点。

| 属性 | 类型 | 说明 |
|---|---|---|
| `label` | `string \| {__bind}` | 按钮文本 |
| `type` | `'primary' \| 'default' \| 'dashed' \| 'link'` | 按钮样式 |
| `icon` | `string` | 图标标识 |
| `disabled` | `boolean \| {__bind}` | 是否禁用 |
| `loading` | `boolean \| {__bind}` | 是否加载中 |

**事件**：`onClick`（最常用的事件入口，触发查询/提交/跳转/弹窗等动作链）。

#### Statistic（统计数字） `statistic` · P1

数值统计展示。

| 属性 | 类型 | 说明 |
|---|---|---|
| `title` | `string` | 标题 |
| `value` | `number \| {__bind}` | 数值 |
| `prefix` | `string` | 前缀（如 ¥） |
| `suffix` | `string` | 后缀（如 个） |

#### Chart（图表） `chart` · P2

数据可视化。Phase 2 仅占位（类型保留），不实现图表引擎。

| 属性 | 类型 | 说明 |
|---|---|---|
| `type` | `'bar' \| 'line' \| 'pie'` | 图表类型 |
| `data` | `{__bind}` | 数据源 |
| `title` | `string` | 图表标题 |

#### RichTextDisplay（富文本展示） `rich_text_display` · P0

富文本内容展示（只读）。

| 属性 | 类型 | 说明 |
|---|---|---|
| `content` | `string \| {__bind}` | 富文本 HTML 内容 |

#### Divider（分割线） `divider` · P0

视觉分割线。

| 属性 | 类型 | 说明 |
|---|---|---|
| `orientation` | `'left' \| 'center' \| 'right'` | 文字位置 |
| `label` | `string` | 分割线文字（可选） |

#### Text（文本） `text` · P0

静态文本展示。

| 属性 | 类型 | 说明 |
|---|---|---|
| `content` | `string \| {__bind}` | 文本内容 |
| `level` | `1 \| 2 \| 3 \| 4 \| 5 \| 6` | 标题级别（可选，渲染为 h1-h6） |

### 3.6 组件属性配置元模型

每个组件类型的可配置属性、事件、是否容器，由**组件元数据描述**（ComponentMeta）驱动搭建器的属性面板渲染。这保证新增组件只需注册元数据，属性面板自动适配。

```jsonc
// ComponentMeta 示例（TextInput）
{
  "type": "text_input",
  "label": "单行文本",
  "category": "form",
  "isContainer": false,
  "props": [
    { "key": "fieldId", "label": "绑定字段", "type": "fieldPicker", "required": true },
    { "key": "label", "label": "标签", "type": "string" },
    { "key": "required", "label": "必填", "type": "boolean", "default": false },
    { "key": "maxLength", "label": "最大长度", "type": "number" }
  ],
  "events": ["onChange"],
  "icon": "edit"
}
```

属性面板根据 `props` 数组动态渲染表单项（字符串/数字/布尔/字段选择器/表达式绑定切换器）。

---

## 4. 页面类型

对标飞书 aPaaS 的 5 种页面类型，Phase 2 全部支持。列表/详情/表单三种标准页面基于对象元数据**自动生成模板**，搭建者从模板起步微调。

### 4.1 页面类型总览

| PageType | 名称 | 数据源 | 自动生成 | 说明 |
|---|---|---|---|---|
| `list_page` | 列表页 | 对象记录列表 | 是 | DataTable 为主，含筛选/分页/行操作 |
| `detail_page` | 详情页 | 单条记录 | 是 | DetailCard 为主，只读展示字段 |
| `form_page` | 表单页 | 单条记录（新建/编辑） | 是 | Form 为主，含字段输入组件 + 提交按钮 |
| `dashboard` | 仪表盘 | 多数据源 | 否 | 自由布局，统计/图表为主（Phase 2 仅骨架） |
| `custom` | 自定义页 | 无固定数据源 | 否 | 空白页，完全自由搭建 |

### 4.2 列表页（ListPage）

**模板结构**：
```
Page
└── Section (title: "<对象复数名>")
    ├── Section (筛选区, collapsible)
    │   └── Grid (筛选条件输入框)
    └── DataTable (绑定 vm.list)
        ├── columns: 对象视图的可显示字段
        ├── pagination: true
        ├── selectable: true
        └── onRowClick: navigate → 详情页
```

**自动生成逻辑**：
1. 读取关联对象的默认列表视图（`View`）。
2. 取视图的可显示字段生成 DataTable 的 `columns`。
3. 视图的筛选条件生成筛选区表单组件（按字段类型匹配输入组件）。
4. 视图的排序/分页配置填充到 DataTable。
5. `vm.list` 变量配置 `DatasourceConfig`（`autoQuery: true`），页面加载自动查询。
6. 行点击事件绑定 `navigate` 到详情页（带 `recordId` 参数）。
7. 顶部新增"新建"按钮，`onClick` 跳转表单页。

### 4.3 详情页（DetailPage）

**模板结构**：
```
Page (onLoad: query_records by URL param id)
└── DetailCard (绑定 vm.record)
    └── fields: 对象所有可显示字段
```

**自动生成逻辑**：
1. 读取关联对象的字段列表。
2. 过滤系统字段（除 name）外的业务字段，生成 DetailCard 的 `fields`。
3. `vm.record` 变量配置 `DatasourceConfig`（`autoQuery: true`），数据源为按 ID 查询。
4. Page 的 `onLoad` 事件读取 URL 参数 `id`，触发 `query_records`（单条查询）。
5. 顶部新增"编辑"按钮，`onClick` 跳转表单页（编辑模式）。
6. 顶部新增"删除"按钮，`onClick` 触发 `confirm` + `delete_record`。

### 4.4 表单页（FormPage）

**模板结构**：
```
Page (onLoad: 若 URL 有 id 则 query 填充, 否则初始化空记录)
└── Form (绑定 vm.record)
    └── children: 按字段类型生成输入组件
        ├── TextInput (text 字段)
        ├── TextArea (long_text 字段)
        ├── NumberInput (number/currency 字段)
        ├── Select (single_select 字段)
        ├── ...
        └── SubFormTable (sub_form 字段)
└── Button (保存) → onSubmit: create_record / update_record
└── Button (取消) → navigate back
```

**自动生成逻辑**：
1. 读取关联对象的字段列表。
2. 按字段类型映射到对应的输入组件（见下表）。
3. 字段的 `required`/`maxLength`/`precision` 等属性填充到组件属性。
4. `vm.record` 变量：若 URL 有 `id` 参数（编辑模式），`autoQuery` 查询填充；否则初始化为空对象（新建模式）。
5. 保存按钮的 `onClick`：根据 `vm.record.id` 是否存在，决定 `create_record` 还是 `update_record`。
6. 提交成功后 `toast` 提示 + `navigate` 返回列表页。

**字段类型 → 表单组件映射**：

| FieldType | 组件 | 说明 |
|---|---|---|
| `text` | `text_input` | 单行文本 |
| `long_text` | `textarea` | 多行文本 |
| `rich_text` | `textarea` | P1 接入富文本编辑器 |
| `number` / `currency` / `percent` | `number_input` | 数字输入 |
| `auto_number` | `text_input` (readonly) | 自动编号，只读 |
| `single_select` | `select` 或 `radio` | 单选 |
| `multi_select` | `multi_select` | 多选 |
| `date` / `date_time` | `date_picker` | 日期选择 |
| `checkbox` | `checkbox` 或 `switch` | 布尔 |
| `attachment` | `attachment_upload` | 附件（P1） |
| `user` | `user_picker` | 人员（P1） |
| `lookup` | `lookup_picker` | 关联选择 |
| `sub_form` | `sub_form_table` | 子表 |
| `formula` / `rollup` | `text` (readonly) | 计算字段只读展示 |

### 4.5 仪表盘（Dashboard）

**模板结构**：自由布局，以 Grid + Statistic/Chart 为主。Phase 2 仅提供骨架（Grid 布局 + Statistic 组件），Chart 组件占位不实现图表引擎。

### 4.6 自定义页（Custom）

**模板结构**：空白 Page，搭建者自由拖拽组件搭建。无固定数据源，由搭建者手动配置 ViewModel 变量。

---

## 5. 视图模型 ViewModel

视图模型是页面的状态中枢。本节定义变量类型、数据源配置与作用域规则。

### 5.1 变量类型（VariableType）

| VariableType | 说明 | 运行时值类型 | 典型用途 |
|---|---|---|---|
| `record` | 单条记录 | `Record<string,FieldValue>` | 详情页/表单页的当前记录 |
| `record_list` | 记录列表 | `{ records: Record[], total: number }` | 列表页的数据 |
| `scalar` | 标量 | `string \| number \| boolean \| null` | 选中 ID、搜索关键字、当前页码 |
| `object` | 对象 | `Record<string,unknown>` | 复杂结构化状态 |
| `array` | 数组 | `unknown[]` | 多选值、临时列表 |

**变量定义示例**：
```jsonc
{
  "variables": {
    "list": {
      "type": "record_list",
      "datasource": { "objectId": "obj_customer", "viewId": "vie_default", "autoQuery": true }
    },
    "record": {
      "type": "record",
      "datasource": { "objectId": "obj_customer", "autoQuery": false }
    },
    "selectedId": { "type": "scalar", "initialValue": null },
    "keyword": { "type": "scalar", "initialValue": "" },
    "currentPage": { "type": "scalar", "initialValue": 1 },
    "pageSize": { "type": "scalar", "initialValue": 20 },
    "loading": { "type": "scalar", "initialValue": false }
  }
}
```

### 5.2 数据源配置（DatasourceConfig）

`record` / `record_list` 类型的变量可配置数据源，由运行时自动调数据 API 填充。

| 字段 | 类型 | 说明 |
|---|---|---|
| `objectId` | `ObjectId` | 关联对象 ID |
| `viewId` | `string?` | 视图 ID（使用某视图的筛选/排序/字段显隐配置） |
| `autoQuery` | `boolean` | 是否页面加载时自动查询 |

**查询行为**：
- `record_list` + `autoQuery: true`：页面 `onLoad` 时调 `GET /objects/:objectId/records`（带 viewId 的筛选/排序），填充 `vm.list.records`。
- `record` + `autoQuery: true`：页面 `onLoad` 时从 URL 参数取 `id`，调 `GET /records/:recordId`，填充 `vm.record`。
- `autoQuery: false`：不自动查询，由事件动作 `query_records` 手动触发（如按钮点击查询）。

**与对象视图的关系**：`viewId` 复用对象建模（Phase 1）的视图配置——视图定义了筛选条件、排序、字段显隐，数据源查询时自动应用，无需在页面重复配置。

### 5.3 变量作用域

| 作用域 | 说明 | 示例 |
|---|---|---|
| **页面级** | 定义在 `PageSchema.viewModel.variables`，全页面共享。 | `vm.list` / `vm.record` / `vm.selectedId` |
| **组件级** | 容器组件（如 Tabs/Grid）可定义局部状态，仅子树可访问。Phase 2 MVP 仅支持页面级。 | （Phase 2 不实现） |

> **Phase 2 约束**：MVP 仅支持页面级变量作用域。组件级作用域（如 Tabs 各标签页独立状态）推迟到后续迭代。绑定路径统一以 `vm.` 开头访问页面级变量。

### 5.4 变量的读写时机

| 时机 | 操作 | 执行者 |
|---|---|---|
| 页面初始化 | 应用 `initialValue`；`autoQuery` 变量触发数据查询 | 运行时渲染器 |
| 事件触发 | `set_variable` 写入；`query_records` 查询后写入 | 事件调度器 |
| 组件交互 | 输入组件 `onChange` 通过 `fieldId` 双向绑定写入 `vm.record` | 表单双向绑定 |
| 渲染读取 | 组件属性 `__bind` 读取变量值渲染 | 运行时渲染器 |

---

## 6. 事件系统

事件系统是页面的交互逻辑层，声明式描述组件交互。本节定义组件事件、动作类型、条件判断与动作链。

### 6.1 组件事件

每个组件类型可声明其支持的事件。事件挂在组件 `props` 上，值为 `ActionConfig` 数组（动作链）。

| 组件 | 事件 | 触发时机 |
|---|---|---|
| Page | `onLoad` | 页面加载完成（常用于自动查询） |
| Button | `onClick` | 点击按钮 |
| DataTable | `onRowClick` / `onSelectionChange` / `onPageChange` | 行点击 / 选择变化 / 翻页 |
| Form | `onSubmit` / `onValidate` | 提交 / 校验 |
| TextInput / TextArea / NumberInput | `onChange` | 值变化 |
| Select / MultiSelect / DatePicker / Radio / Checkbox / Switch | `onChange` | 值变化 |
| LookupPicker | `onChange` | 选择记录变化 |
| Tabs | `onTabChange` | 切换标签 |

### 6.2 动作类型（ActionType）

对标飞书 aPaaS 的 12 种动作类型，与 `ActionType` 枚举一一对应。

| ActionType | 名称 | 参数（params） | 行为 |
|---|---|---|---|
| `query_records` | 查询记录 | `objectId`, `viewId?`, `filters?`, `sorts?`, `pagination?`, `targetVariable` | 调 runtime-svc 查询记录，结果写入目标变量 |
| `create_record` | 新增记录 | `objectId`, `data` | 调 runtime-svc 新增记录 |
| `update_record` | 更新记录 | `objectId`, `recordId`, `data` | 调 runtime-svc 更新记录 |
| `delete_record` | 删除记录 | `objectId`, `recordId` | 调 runtime-svc 删除记录 |
| `navigate` | 页面跳转 | `pageSlug`, `params?`, `mode?`(`'push' \| 'replace'`) | 跳转到指定页面（slug 路由），携带参数 |
| `open_modal` | 打开弹窗 | `pageSlug`, `params?`, `width?` | 以弹窗形式打开页面 |
| `close_modal` | 关闭弹窗 | `result?` | 关闭当前弹窗，可回传结果 |
| `confirm` | 确认框 | `title`, `content` | 弹出确认对话框，用户确认后继续动作链，取消则中断 |
| `toast` | 提示 | `message`, `type?`(`'success' \| 'error' \| 'warning' \| 'info'`) | 弹出提示消息 |
| `call_api` | 调用 API | `url`, `method`, `headers?`, `body?` | 调用自定义 HTTP API |
| `trigger_process` | 触发流程 | `processId`, `input?` | 触发流程引擎（Phase 3 对接） |
| `set_variable` | 设置变量 | `variable`（路径）, `value` | 设置视图模型变量的值 |

**参数值的动态性**：所有动作参数值均可为字面量或 `{__bind}` / `{__expr}` 绑定表达式，实现数据驱动。例如 `update_record` 的 `recordId` 绑定 `vm.record.id`，`data` 绑定 `vm.record`。

### 6.3 条件判断

每个动作执行前可配置 `condition`（表达式），为 `true` 才执行，否则跳过该动作继续下一个。

```jsonc
{
  "type": "toast",
  "params": { "message": "请先选择记录", "type": "warning" },
  "condition": { "__expr": "vm.selectedId == null" }
}
```

**`confirm` 动作的特殊语义**：`confirm` 不是条件判断，而是**交互中断**——用户点击"取消"时，整个动作链中断（后续动作不执行）；点击"确认"时继续。这是唯一会中断动作链的动作。

### 6.4 动作链

一个事件可配置多个动作（`ActionConfig` 数组），按数组顺序串行执行：

```jsonc
{
  "onClick": [
    { "type": "set_variable", "params": { "variable": "vm.loading", "value": true } },
    {
      "type": "query_records",
      "params": {
        "objectId": "obj_customer",
        "filters": { "logic": "AND", "conditions": [
          { "fieldId": "fld_name", "operator": "contains", "value": { "__bind": "vm.keyword" } }
        ]},
        "targetVariable": "vm.list"
      }
    },
    { "type": "set_variable", "params": { "variable": "vm.loading", "value": false } }
  ]
}
```

**执行规则**：
1. 动作按数组顺序串行执行。
2. 每个动作执行前检查 `condition`，为 `false` 则跳过。
3. `confirm` 动作用户取消时，中断整个动作链。
4. 动作执行失败（如 API 报错）时，中断动作链并 `toast` 错误提示。
5. 动作参数中的 `{__bind}` / `{__expr}` 在执行时实时求值。

### 6.5 事件配置交互（搭建器中）

搭建器右侧属性面板的"事件"区域：
1. 列出当前组件支持的事件（如 Button 显示 `onClick`）。
2. 点击事件 → 打开动作链编辑器（弹窗/抽屉）。
3. 动作链编辑器：可视化添加/排序/删除动作，每个动作选择类型 → 填写参数（参数输入框支持切换为表达式绑定）。
4. 支持为动作配置 `condition`（表达式输入框）。

---

## 7. 搭建器交互

搭建器是搭建者编辑页面 Schema 的可视化工具。本节定义其布局、交互模式与编辑能力。

### 7.1 三栏布局

```
┌─────────────────────────────────────────────────────────────────┐
│  顶栏: 页面名称(可编辑) | 预览/编辑切换 | 撤销/重做 | 保存 | 发布  │
├──────────┬────────────────────────────────┬─────────────────────┤
│ 左栏      │         中栏(画布)              │      右栏(属性面板)   │
│ 组件面板   │                                │                     │
│          │   ┌──────────────────────┐     │  ┌─────────────────┐│
│ 容器类    │   │  Page               │     │  │ 组件: DataTable ││
│ □ Page   │   │  ┌────────────────┐ │     │  ├─────────────────┤│
│ □ Section│   │  │ DataTable      │ │     │  │ ▸ 属性          ││
│ □ Tabs   │   │  │  [选中高亮]     │ │     │  │   data: vm.list ││
│ □ Grid   │   │  └────────────────┘ │     │  │   columns: [...] ││
│          │   │  ┌────────────────┐ │     │  │   pagination: on ││
│ 数据类    │   │  │ Button: 新建    │ │     │  ├─────────────────┤│
│ □ DataTbl│   │  └────────────────┘ │     │  │ ▸ 事件          ││
│          │   └──────────────────────┘     │  │   onRowClick: … ││
│ 表单类    │                                │  └─────────────────┘│
│ □ Form   │   [拖拽放置区 / 实时预览]        │                     │
│ □ TextIn │                                │                     │
│          │                                │                     │
│ 展示类    │                                │                     │
│ □ Button │                                │                     │
├──────────┴────────────────────────────────┴─────────────────────┤
│  底栏: 组件树大纲(可折叠)                                          │
└─────────────────────────────────────────────────────────────────┘
```

| 栏 | 内容 | 宽度 |
|---|---|---|
| 左栏 | 组件面板，按四大类（容器/数据/表单/展示）分组，可搜索 | 240px |
| 中栏 | 画布，所见即所得渲染页面，支持拖拽放置/选中/移动 | 自适应 |
| 右栏 | 属性面板，选中组件后显示其属性（属性/事件/样式分区） | 320px |
| 顶栏 | 页面操作（名称/预览切换/撤销重做/保存/发布） | — |
| 底栏 | 组件树大纲（可折叠），树形展示当前组件结构 | — |

### 7.2 拖拽添加 / 移动 / 删除

| 操作 | 方式 | 说明 |
|---|---|---|
| 添加组件 | 从左栏组件面板拖拽到画布的容器内 | 仅容器类组件可接收放置；叶子组件拖到非容器区域时高亮提示不可放置 |
| 选中组件 | 点击画布中的组件 / 点击组件树节点 | 选中后高亮显示，右栏加载属性面板 |
| 移动组件 | 在画布中拖拽组件到另一容器 / 在组件树中拖拽节点 | 移动时高亮目标容器；非法目标（如拖到叶子组件内）阻止 |
| 删除组件 | 选中后按 Delete 键 / 组件树节点右键删除 | 删除容器时连同子节点删除；Page 根节点不可删除 |
| 复制组件 | 选中后 Ctrl+C / Ctrl+V | 连同子树复制，生成新 ID |

**拖拽技术选型**：基于 `@dnd-kit`（与 Phase 1 字段排序一致），支持键盘可访问性。

### 7.3 选中组件 → 属性面板编辑

选中组件后，右栏属性面板分三个 Tab：

| Tab | 内容 |
|---|---|
| 属性 | 组件的可配置属性（由 ComponentMeta 驱动渲染），每个属性输入框支持切换为表达式绑定 |
| 事件 | 组件支持的事件列表，点击进入动作链编辑器 |
| 样式 | 宽度/高度/边距/隐藏条件等（Phase 2 MVP 基础样式） |

**属性值的绑定切换**：每个属性输入框右侧有"绑定"图标，点击切换为表达式绑定模式，可输入 `vm.xxx` 路径或 `{__expr}` 表达式。

### 7.4 实时预览

| 模式 | 说明 |
|---|---|
| 编辑模式 | 画布显示组件轮廓、选中高亮、拖拽放置区，不执行数据查询与事件 |
| 预览模式 | 画布以运行时模式渲染，执行数据查询（autoQuery）、可触发事件、真实数据交互 |

顶栏"预览"按钮切换模式。预览模式用于搭建者即时验证页面效果，无需发布。

### 7.5 撤销 / 重做

搭建器的所有编辑操作（增删改组件、修改属性、配置事件）纳入**操作历史栈**：

- 每次操作生成一个 history entry（操作前后的 Schema diff 或快照）。
- Ctrl+Z 撤销，Ctrl+Shift+Z / Ctrl+Y 重做。
- 历史栈上限 50 步。
- 页面未保存时关闭/刷新提示确认。

**技术方案**：基于 Schema 快照栈（Phase 2 MVP 用全量快照，后续可优化为 diff）。

### 7.6 组件树面板

底栏（可折叠）或左栏底部展示组件树大纲：

- 树形展示当前 PageSchema 的组件层级。
- 点击节点 → 选中对应画布组件。
- 拖拽节点 → 移动组件。
- 右键节点 → 复制/删除/重命名。
- 当前选中节点高亮，并滚动到画布可见区。

### 7.7 页面列表与管理

进入"页面"导航后，先显示**页面列表**（主从布局，对齐对象设计器风格）：

| 功能 | 说明 |
|---|---|
| 页面列表 | 按应用列出全部页面，显示名称/类型/关联对象/更新时间 |
| 新建页面 | 选择页面类型 + 关联对象（列表/详情/表单页必选对象），自动生成模板 |
| 编辑页面 | 进入搭建器编辑 Schema |
| 复制页面 | 复制 Schema 到新页面 |
| 删除页面 | 删除前校验是否被其他页面跳转引用 |
| 发布/下线 | 切换 `isPublished` 状态 |

---

## 8. 运行时渲染

运行时渲染器（runtime-ui）读取 `PageSchema` JSON 动态渲染页面。本节定义渲染流程、表达式解析与事件处理。

### 8.1 渲染流程

```
PageSchema JSON
     │
     ▼
┌─────────────────────────────────┐
│ 1. 初始化 ViewModel             │  ← 应用 initialValue，autoQuery 变量触发数据查询
├─────────────────────────────────┤
│ 2. 递归渲染组件树 (root)         │  ← 从 root 开始递归
│    ├─ 读取 type → 匹配组件实现    │
│    ├─ 解析 props 中的 __bind/__expr │  ← 表达式引擎求值
│    ├─ 渲染容器 → 递归 children    │
│    └─ 绑定事件 → 事件调度器       │
├─────────────────────────────────┤
│ 3. 数据查询完成 → 更新 ViewModel │  ← 触发依赖该变量的组件重渲染
├─────────────────────────────────┤
│ 4. 用户交互 → 触发事件 → 动作链   │  ← 事件调度器执行 ActionConfig
│    └─ 动作可能更新 ViewModel      │  ← 再次触发重渲染
└─────────────────────────────────┘
```

### 8.2 组件渲染器注册

运行时维护一个 **ComponentType → React 组件** 的注册表：

```ts
const rendererRegistry: Record<ComponentType, React.FC<ComponentRendererProps>> = {
  [ComponentType.Page]: PageRenderer,
  [ComponentType.DataTable]: DataTableRenderer,
  [ComponentType.TextInput]: TextInputRenderer,
  // ... 25 个组件各一个 Renderer
};
```

渲染器递归调度：
```ts
function renderNode(node: ComponentNode, vm: ViewModelContext): ReactNode {
  const Renderer = rendererRegistry[node.type];
  const props = resolveProps(node.props, vm);      // 解析 __bind / __expr
  const handlers = resolveEvents(node, vm);         // 绑定事件
  const children = node.children?.map(c => renderNode(c, vm));
  return <Renderer {...props} {...handlers}>{children}</Renderer>;
}
```

### 8.3 表达式绑定解析

运行时表达式引擎负责解析 `PropValue` 中的 `__bind` / `__expr`：

| 形态 | 解析逻辑 |
|---|---|
| 字面量 | 直接返回值 |
| `{ __bind: 'vm.list.records' }` | 从 ViewModel 上下文按路径取值 |
| `{ __expr: '...' }` | 表达式解释器求值（MVP 子集：属性访问 + 比较 + 逻辑 + 三元 + 内置函数） |

**响应式更新**：ViewModel 状态变化时，所有依赖该状态节点的绑定表达式自动重新求值，组件重渲染。基于 React 的 state/context 实现响应式（ViewModel 存于 React context，更新触发消费组件重渲染）。

### 8.4 数据查询

`autoQuery` 变量与 `query_records` 动作都调用 runtime-svc 的记录 API：

| 场景 | API | 参数 |
|---|---|---|
| `record_list` + autoQuery | `GET /objects/:objectId/records` | viewId（含筛选/排序）、分页 |
| `record` + autoQuery（编辑模式） | `GET /records/:recordId` | URL 参数 id |
| `query_records` 动作 | `GET /objects/:objectId/records` | 动作 params 中的 filters/sorts/pagination |

查询结果写入 ViewModel 对应变量（`vm.list` / `vm.record`），触发组件重渲染。

### 8.5 事件处理

运行时事件调度器负责执行动作链：

```ts
async function executeActionChain(actions: ActionConfig[], vm: ViewModelContext, event) {
  for (const action of actions) {
    // 1. 条件判断
    if (action.condition && !evalExpr(action.condition, vm)) continue;
    // 2. 执行动作
    const result = await executeAction(action, vm, event);
    // 3. confirm 取消 → 中断
    if (action.type === ActionType.Confirm && result === false) break;
    // 4. 失败 → 中断
    if (result instanceof Error) { toastError(result); break; }
  }
}
```

`executeAction` 按 `ActionType` 分发到对应处理器：数据动作调 runtime-svc API，UI 动作（navigate/modal/confirm/toast）调前端路由/弹窗，`set_variable` 更新 ViewModel。

### 8.6 页面路由

runtime-ui 根据已发布页面的 `slug` 注册路由：

| 路由 | 说明 |
|---|---|
| `/app/:appId/p/:slug` | 渲染 slug 对应的已发布页面 Schema |

`navigate` 动作按 `pageSlug` 跳转，`params` 作为 URL query 或 state 传递（如 `?id=rec_xxx`）。

---

## 9. API 设计

页面元数据 CRUD 由 meta-svc 提供，存取 `PageMeta.schema` JSON。沿用 Phase 1 的 API 响应包裹（`ApiResponse<T>`）与多租户隔离。

### 9.1 页面 CRUD（meta-svc）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/apps/:appId/pages` | 列出应用下页面（不含 schema 全量，返回摘要） | P0 |
| GET | `/pages/:pageId` | 获取页面（含完整 schema） | P0 |
| POST | `/apps/:appId/pages` | 创建页面（含自动生成模板） | P0 |
| PUT | `/pages/:pageId` | 更新页面（名称/schema/objectId） | P0 |
| DELETE | `/pages/:pageId` | 删除页面（前置校验引用） | P0 |
| POST | `/pages/:pageId/publish` | 发布页面（`isPublished = true`） | P0 |
| POST | `/pages/:pageId/unpublish` | 下线页面 | P1 |

**列出页面响应**（摘要，不含 schema）：
```jsonc
{
  "ok": true,
  "data": [
    {
      "id": "pag_xxx",
      "name": "客户列表",
      "apiName": "customer_list",
      "type": "list_page",
      "objectId": "obj_customer",
      "isPublished": true,
      "updatedAt": "2026-07-31T10:00:00Z"
    }
  ]
}
```

**创建页面请求体**：
```jsonc
{
  "apiName": "customer_list",
  "name": "客户列表",
  "type": "list_page",
  "objectId": "obj_customer",
  "autoGenerate": true   // 是否基于对象自动生成模板 Schema
}
```

> `autoGenerate: true` 时，后端按 [§4 页面类型](#4-页面类型) 的自动生成逻辑，读取对象元数据生成模板 `PageSchema`，免去搭建者从空白页搭起。

**更新页面请求体**（保存搭建器编辑结果）：
```jsonc
{
  "name": "客户列表",
  "schema": { /* 完整 PageSchema JSON */ }
}
```

### 9.2 运行时页面获取（runtime-ui 调用）

| 方法 | 路径 | 说明 | 优先级 |
|---|---|---|---|
| GET | `/apps/:appId/pages/by-slug/:slug` | 按 slug 获取已发布页面（运行时渲染用） | P0 |

**响应**：返回完整的 `PageMeta`（含 `schema`），runtime-ui 据此渲染。仅返回 `isPublished: true` 的页面。

### 9.3 校验与错误约定

| 场景 | 错误 |
|---|---|
| apiName 冲突（应用内唯一） | `409 VALIDATION_ERROR` + `fieldErrors.apiName` |
| Schema JSON 格式错误 / version 不支持 | `400 SCHEMA_INVALID` |
| 列表/详情/表单页未关联 objectId | `400 VALIDATION_ERROR` + `fieldErrors.objectId` |
| 删除被其他页面跳转引用 | `409 CONFLICT` + 提示引用方 |
| 按 slug 查询未发布页面 | `404 NOT_FOUND` |
| 自动生成模板时对象不存在 | `404 NOT_FOUND` |

### 9.4 数据查询复用

页面运行时的数据查询（`query_records` / autoQuery）复用 Phase 1 的 runtime-svc 记录 API（`GET /objects/:objectId/records`），无需新增数据 API。详见 `PRD-object.md` §6.4。

---

## 10. 验收标准（Phase 2 完成闸门）

> 对齐 ROADMAP.md：**拖拽搭建 CRUD 三件套（列表/详情/表单）并运行。**

### 10.1 功能验收（可验证）

1. **页面管理**：能创建页面（选择类型 + 关联对象 + 自动生成模板），编辑、删除、发布/下线；删除被引用页面被阻止。
2. **列表页**：自动生成的列表页能加载数据（DataTable 绑定 `vm.list`，autoQuery 生效），支持分页/排序/行选择；行点击跳转详情页；"新建"按钮跳转表单页。
3. **详情页**：自动生成的详情页能按 URL 参数 `id` 加载单条记录（DetailCard 绑定 `vm.record`），展示字段；"编辑"跳转表单页，"删除"确认后删除并返回。
4. **表单页**：自动生成的表单页能按字段类型渲染输入组件；新建模式提交 `create_record`，编辑模式（URL 有 id）加载数据后提交 `update_record`；必填校验生效；提交成功后 toast 提示并返回列表。
5. **搭建器**：三栏布局可用；能从组件面板拖拽组件到画布容器；能选中组件在右栏编辑属性；能配置事件动作链；能撤销/重做；能切换预览模式实时验证。
6. **表达式绑定**：组件属性能绑定 ViewModel 路径（如 DataTable 的 `data` 绑定 `vm.list.records`），数据变化时组件更新；`hidden` 绑定表达式生效。
7. **事件系统**：Button 的 `onClick` 能配置动作链（confirm → 提交 → toast → 跳转），条件判断生效，confirm 取消时中断动作链。
8. **运行时渲染**：runtime-ui 能按 slug 加载已发布页面 Schema 并渲染，数据查询与事件交互正常。
9. **多租户**：A 租户的页面/schema 对 B 租户不可见。

### 10.2 技术验收

10. `packages/shared/src/page/index.ts` 类型在搭建器、运行时渲染器、后端 API 全链路使用，无 `any` 逃逸。
11. `PageMeta` 表迁移完成，`schema` JSON 字段可存取完整 `PageSchema`。
12. meta-svc 提供页面 CRUD + 发布 API；runtime-ui 提供按 slug 获取页面 API。
13. 搭建器（`packages/studio/.../PageBuilder.tsx`）可用：三栏布局 + 拖拽 + 属性面板 + 事件配置 + 撤销重做 + 预览。
14. 运行时渲染器（`packages/runtime-ui`）可用：递归渲染组件树 + 表达式解析 + 数据查询 + 事件调度。
15. 28 个组件中所有 P0 项（25 个）有可运行的渲染器实现；P1 项（List/Statistic）尽量实现；P2 项（Chart）占位。
16. 自动生成模板：选择对象 + 页面类型能自动生成含 ViewModel + 组件树 + 事件的完整 Schema。

### 10.3 端到端验收

17. **CRUD 三件套闭环**：基于"客户"对象，自动生成列表/详情/表单三页面并发布；在 runtime-ui 中完成：列表查看 → 新建记录 → 详情查看 → 编辑记录 → 删除记录全流程跑通。

---

## 11. 非目标（Phase 2 不做）

| 非目标 | 说明 | 归属阶段 |
|---|---|---|
| 自定义组件开发 SDK | 飞书支持在线开发自定义组件并发布共享。Phase 2 仅提供内置 25 个组件，不开放自定义组件开发能力。 | 后续 |
| 飞书 85+ 组件全集 | Phase 2 MVP 仅做 25 个核心组件，覆盖 CRUD 场景。其余组件（如导航栏/看板/日历/画廊等）后续逐步补全。 | 后续迭代 |
| 移动端原生适配 | 飞书 PC 端设计自动同步移动端。Phase 2 仅做响应式 CSS（桌面优先），不做移动端原生布局适配。 | 后续 |
| 组件市场 / 跨企业共享 | 飞书有组件市场支持企业内外分享。Phase 2 不做组件市场。 | 后续 |
| JS 页面级代码扩展 | 飞书支持页面级 JavaScript 代码扩展。Phase 2 仅支持声明式事件动作系统，不开放 JS 代码编写。 | 后续 |
| 图表引擎 | Chart 组件类型保留但占位，不实现图表渲染引擎（柱状/折线/饼图）。 | Phase 5 |
| 仪表盘完整能力 | Dashboard 页面类型仅提供骨架（Grid + Statistic），不实现完整仪表盘（多图表/联动/下钻）。 | Phase 5 |
| 组件级变量作用域 | Phase 2 仅支持页面级 ViewModel 变量，不支持容器组件局部状态。 | 后续 |
| 完整表达式引擎 | Phase 2 表达式引擎仅实现 MVP 子集（属性访问 + 比较 + 逻辑 + 三元 + 5 内置函数），不实现完整 JS 沙箱。 | 后续 |
| 页面版本管理 | 不实现页面历史版本/回滚（仅 `isPublished` 开关）。 | 后续 |
| 实时协作编辑 | 多人同时编辑同一页面。 | 后续 |
| 页面权限控制 | 页面级访问权限（谁可看哪些页面）属权限模块。 | Phase 4 |
| 样式主题 / 自定义 CSS | Phase 2 仅基础样式（宽高/边距/隐藏），不支持主题切换与自定义 CSS。 | 后续 |

---

## 附录 A：ComponentType 与组件分类速查

| 分类 | ComponentType 值 | 数量 |
|---|---|---|
| 容器 | `page` `section` `tabs` `grid` `grid_column` | 5 |
| 数据 | `data_table` `detail_card` `list` | 3 |
| 表单 | `form` `text_input` `textarea` `number_input` `select` `multi_select` `date_picker` `radio` `checkbox` `switch` `lookup_picker` `sub_form_table` `attachment_upload` `user_picker` | 14 |
| 展示 | `button` `statistic` `chart` `rich_text_display` `divider` `text` | 6 |
| **合计** | | **28** |

## 附录 B：ActionType 速查

| ActionType | 值 | 数据/UI | Phase 2 |
|---|---|---|---|
| 查询记录 | `query_records` | 数据 | P0 |
| 新增记录 | `create_record` | 数据 | P0 |
| 更新记录 | `update_record` | 数据 | P0 |
| 删除记录 | `delete_record` | 数据 | P0 |
| 页面跳转 | `navigate` | UI | P0 |
| 打开弹窗 | `open_modal` | UI | P0 |
| 关闭弹窗 | `close_modal` | UI | P0 |
| 确认框 | `confirm` | UI | P0 |
| 提示 | `toast` | UI | P0 |
| 调用 API | `call_api` | 数据 | P1 |
| 触发流程 | `trigger_process` | 数据 | P1（Phase 3 对接） |
| 设置变量 | `set_variable` | UI | P0 |

## 附录 C：PageSchema 完整示例（列表页）

```jsonc
{
  "version": "1",
  "pageType": "list_page",
  "viewModel": {
    "variables": {
      "list": {
        "type": "record_list",
        "datasource": { "objectId": "obj_customer", "viewId": "vie_default", "autoQuery": true }
      },
      "selectedId": { "type": "scalar", "initialValue": null },
      "keyword": { "type": "scalar", "initialValue": "" }
    }
  },
  "root": {
    "id": "node_page",
    "type": "page",
    "props": { "title": "客户列表" },
    "children": [
      {
        "id": "node_section",
        "type": "section",
        "props": { "title": "客户" },
        "children": [
          {
            "id": "node_btn_create",
            "type": "button",
            "props": {
              "label": "新建",
              "type": "primary",
              "onClick": [
                { "type": "navigate", "params": { "pageSlug": "customer_form" } }
              ]
            }
          },
          {
            "id": "node_table",
            "type": "data_table",
            "props": {
              "data": { "__bind": "vm.list.records" },
              "columns": [
                { "fieldId": "fld_name", "label": "客户名称", "width": 200, "sortable": true },
                { "fieldId": "fld_phone", "label": "电话", "width": 150 },
                { "fieldId": "fld_industry", "label": "行业", "width": 120 }
              ],
              "pagination": true,
              "pageSize": 20,
              "selectable": true,
              "onRowClick": [
                {
                  "type": "navigate",
                  "params": {
                    "pageSlug": "customer_detail",
                    "params": { "id": { "__bind": "vm.selectedId" } }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## 附录 D：P0 交付清单（MVP 最小集）

- 页面类型：列表页 / 详情页 / 表单页（自动生成模板） + 自定义页（空白搭建）（§4）
- 组件：25 个 P0 组件（容器 5 + 数据 2 + 表单 14 + 展示 4）（§3）
- 视图模型：5 种变量类型 + 数据源配置 + 页面级作用域（§5）
- 事件系统：12 种 ActionType + 条件判断 + 动作链（§6）
- 搭建器：三栏布局 + 拖拽 + 属性面板 + 事件配置 + 撤销重做 + 预览（§7）
- 运行时：递归渲染 + 表达式解析 + 数据查询 + 事件调度（§8）
- API：页面 CRUD + 发布 + 按 slug 获取（§9）
- 端到端：CRUD 三件套闭环跑通（§10.3）
