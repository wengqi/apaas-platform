# 对象设计器 设计规范 (DESIGN-object)

> 模块: Phase 1 — 对象 / 数据建模
> 角色: UI/UE 设计规范,供前端开发 agent 直接实现
> 技术栈: React 18 + Ant Design 5 + TailwindCSS 3 + React Query + Zustand + React Router v6
> 对标: 飞书 aPaaS 对象设计器(简洁、专业、信息密度适中)
> 类型契约来源: [`packages/shared/src/object/index.ts`](../../packages/shared/src/object/index.ts)(SSOT,本规范所有字段类型 / 配置项均与其对齐)

---

## 0. 设计对齐说明

本规范与现有 Studio 骨架严格对齐,开发时复用既有约定:

| 约定项 | 取值 | 来源 |
|---|---|---|
| 主色 | `#1677ff`(AntD 5 默认 token `colorPrimary`) | `main.tsx` ConfigProvider 未覆盖 token,沿用默认 |
| 页面背景 | `#f5f7fa` | `StudioLayout` / `AppList` |
| 容器背景 | `#fff`(`colorBgContainer`) | `theme.useToken()` |
| 次级容器 | `#fafbfc` | `AppDashboard` 统计卡 |
| 分隔线 / 边框 | `#eef0f4`(强) / `#f0f2f5`(弱) | `StudioLayout` / `AppList` |
| 阴影 | 卡片 `0 1px 3px rgba(0,0,0,0.04)`,悬浮 `0 8px 24px rgba(0,0,0,0.04)`,顶栏 `0 1px 4px rgba(0,0,0,0.03)` | 现有页面 |
| 圆角 | 卡片 `12`,弹窗/图标块 `16`,小元素 `8`/`10` | 现有页面 |
| 路由 | `/app/:appId/objects` 渲染 `ObjectDesigner` | `router.tsx` |
| 侧边栏入口 | Studio 左侧导航「对象」项(`DatabaseOutlined`),`selectedKey = 'objects'` | `StudioLayout` |
| API 模式 | `client.get/post/put/delete`,响应 `{ ok, data }`,React Query 取数 | `api/apps.ts` |
| locale | `zhCN` | `main.tsx` |

> 实现提示:`ObjectDesigner.tsx` 现为占位页,需整体重写。建议拆分为 `pages/ObjectDesigner.tsx`(列表页容器) + `components/object/` 子组件目录,保持单文件可读性。

---

## 1. 设计概述

### 1.1 定位

对象设计器是 aPaaS 的数据建模中枢。用户在此定义业务实体(对象)、配置字段与关联关系、组织列表视图,平台基于元数据(JSONB 宽表)提供记录 CRUD。本模块遵循「元数据驱动」原则——搭建器产出的是配置 JSON,而非源代码。

### 1.2 整体布局:左列表 + 右详情(主从布局)

复用 `StudioLayout` 的 Content 区,在其内部再做一层「对象列表 + 对象详情」的主从分割。这是飞书 aPaaS 与同类产品(Airtable / Salesforce)的通用模式,符合用户心智。

```
┌─ StudioLayout.Header(返回应用列表 / 用户菜单)──────────────────────────────┐
├─ StudioLayout.Sider(应用内导航:工作台 / 对象 / 页面 / 流程 / 权限)─┤
│                                                                     │
│  ┌── Content(padding:24, bg:#f5f7fa)──────────────────────────────┐ │
│  │                                                                 │ │
│  │  ┌─────────────┬───────────────────────────────────────────────┐│ │
│  │  │ 对象列表    │  对象详情                                     ││ │
│  │  │ (左 264px)  │  (右 flex:1)                                  ││ │
│  │  │             │                                               ││ │
│  │  │ [+ 新建对象]│  对象基本信息                                 ││ │
│  │  │ 🔍 搜索框   │  ─────────────                                ││ │
│  │  │ ─────────── │  [字段] [视图] [高级设置]  ← Tabs            ││ │
│  │  │ 📦 客户     │  ┌──────────────────────────────────────┐   ││ │
│  │  │ 📦 订单 ◀选中│  │ 工具栏  [+ 添加字段] 🔍 批量操作 ⋮  │   ││ │
│  │  │ 📦 产品     │  ├──────────────────────────────────────┤   ││ │
│  │  │             │  │ 字段列表表格(可拖拽排序)            │   ││ │
│  │  │             │  │ ⠿ 字段名 │ API名 │ 类型 │ 必填 │ 操作│   ││ │
│  │  │             │  │  ...                                 │   ││ │
│  │  │             │  └──────────────────────────────────────┘   ││ │
│  │  └─────────────┴───────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 信息架构

```
对象设计器
├── 对象列表(左栏)
│   ├── 搜索 + 新建对象
│   └── 对象条目(图标 / 名称 / API名 / 字段数 / 记录数)
├── 对象详情(右栏)
│   ├── 对象基本信息(名称 / API名 / 图标 / 主显示字段 / 描述)→ 内联编辑
│   └── Tabs
│       ├── 字段管理(默认)
│       │   ├── 工具栏(添加字段 / 搜索 / 批量操作)
│       │   └── 字段列表表格(拖拽排序)
│       ├── 视图管理
│       │   ├── 视图列表 + 新建视图
│       │   └── 视图配置器(筛选 / 排序 / 字段显隐)
│       └── 高级设置(记录级权限开关 / 删除对象)
└── 抽屉/弹窗
    ├── 新建对象弹窗(Modal)
    ├── 字段类型选择器(Modal,网格)
    └── 字段配置表单(Drawer,按类型动态渲染)
```

### 1.4 交互模式总览

| 模式 | 说明 | AntD 实现 |
|---|---|---|
| 主从选择 | 左栏点对象 → 右栏加载详情,URL 同步 `/app/:appId/objects/:objectId` | `react-router` 动态路由 + React Query |
| 内联编辑 | 对象名称/描述点击即编辑,失焦保存 | `Typography.Paragraph editable` |
| 抽屉配置 | 字段配置在右侧 Drawer,保留表格上下文 | `Drawer` width=480 |
| 拖拽排序 | 字段顺序、视图字段顺序可拖拽 | `Table` rowDrag 或 `dnd-kit` |
| 批量操作 | 表格多选后浮出操作条 | `Table rowSelection` + `Space` |
| 即时反馈 | 增删改用 `message` 提示,危险操作用 `Popconfirm` | `message` / `Popconfirm` |

---

## 2. 页面布局

### 2.1 对象列表页(左栏 + 右栏,整体)

**路由**:`/app/:appId/objects`(无 `:objectId` 时右栏显示空状态)

**布局**:`<div style={{ display:'flex', gap:16, height:'calc(100vh - 56px - 48px)' }}>`(56 为 Header,48 为 Content padding)。左栏固定宽 264px,右栏 `flex:1`。两栏各自白色背景 + `borderRadius:12` + `border:1px solid #eef0f4`。

#### 2.1.1 左栏:对象列表

```
┌─ 对象列表 (264px, bg:#fff) ──────────┐
│ ┌──────────────────────────────────┐ │
│ │ 📦 对象              [+ 新建对象]│ │  ← 标题行(Title level=5 + Button primary size=small)
│ ├──────────────────────────────────┤ │
│ │ 🔍 搜索对象…                     │ │  ← Input.Search(allowClear)
│ ├──────────────────────────────────┤ │
│ │ 客户         customer   8字段    │ │  ← 列表项(可选中,选中态 #e6f4ff 背景 + 左侧 3px #1677ff 竖条)
│ │ 订单 ●       sales_order 12字段  │ │     ● = 有未保存草稿标记(可选)
│ │ 产品         product     6字段   │ │
│ │ ...                              │ │
│ │                                  │ │  ← 列表可滚动(overflow:auto)
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**列表项规格**:
- 高度 56px,内边距 `12px 14px`,hover 背景 `#fafbfc`
- 选中态:背景 `#e6f4ff`,左侧 `borderLeft:3px solid #1677ff`
- 第一行:对象图标(28×28 圆角 8,渐变背景如 AppList 卡片)+ 显示名称(`Text strong fontSize:14`)+ 右侧字段数(`Text secondary fontSize:12`)
- 第二行:API 名称(`Text secondary fontSize:12`,等宽 `fontFamily:'monospace'`)
- 系统对象(如 User)名称右侧加 `Tag`「系统」(color=default),不可删除

**空状态**:列表为空时显示 `Empty`(description="还没有对象")+ 居中「新建对象」按钮。

**AntD 组件**:`Card`(无标题,自定义 body) 或 `div` + `List`;推荐 `List` + 自定义 `renderItem`,便于后续虚拟滚动。

#### 2.1.2 右栏:空状态(未选对象)

居中 `Empty`:图标块(112×112 圆角 28,背景 `#e6f4ff`,内嵌 `DatabaseOutlined` 64px `#1677ff`,复用现有占位页样式)+ 标题「选择一个对象开始」+ 副文案「从左侧选择对象,或新建对象来定义业务实体」。

### 2.2 对象详情页

**路由**:`/app/:appId/objects/:objectId`(选中左栏对象后 `navigate` 进入)

**结构**:右栏自上而下为「对象基本信息」+「Tabs(字段 / 视图 / 高级设置)」。

#### 2.2.1 对象基本信息(头部)

```
┌──────────────────────────────────────────────────────────────────────┐
│  🛒  客户                    customer        [Tag 系统/自定义]       │  ← 图标 48×48 + 名称(editable) + apiName + 状态 Tag
│      客户主数据,含联系方式与等级                                    │  ← 描述(editable, secondary)
│      主显示字段: 客户名称 ▾        记录数: 1,234    更新于 2 小时前  │  ← 主显示字段 Select + 元信息
└──────────────────────────────────────────────────────────────────────┘
```

- 图标块:48×48 圆角 12,渐变 `linear-gradient(135deg, #1677ff, #1677ffdd)`,emoji 文本(复用 AppDashboard 样式)
- 名称:`Typography.Title level={4}` + `editable`(`editable={{ onChange, tooltip }}`),失焦保存
- API 名:`Text code` 等宽 + 不可编辑(系统生成后锁定,旁置 `Tooltip`「创建后不可修改」)
- 描述:`Typography.Paragraph` type=secondary + `editable`
- 主显示字段:`Select`(候选 = 该对象所有文本类字段,绑定 `ObjectMeta.nameFieldId`),`placeholder="选择用于记录标题的字段"`
- 右侧元信息:记录数、最后更新时间(`Text secondary fontSize:12`)

#### 2.2.2 Tabs 区

`Tabs` `tabPosition="top"`,`items`:
- `字段`(key=`fields`,默认激活)— 见 2.3
- `视图`(key=`views`)— 见 2.4
- `高级设置`(key=`advanced`)— 记录级权限 `Switch`(`recordLevelSecurity`)、对象 API 名只读展示、危险区「删除对象」(`Popconfirm` + `Button danger`),系统对象隐藏删除

### 2.3 字段管理 Tab

#### 2.3.1 工具栏

```
┌──────────────────────────────────────────────────────────────────────┐
│ 共 12 个字段(2 个系统字段)        🔍 搜索字段  [+ 添加字段]  ⋮     │
└──────────────────────────────────────────────────────────────────────┘
```

- 左侧:`Text secondary` 字段计数
- 右侧:`Input.Search`(placeholder="搜索字段名",`allowClear`,`size="small"`,width 200)+ `Button type="primary" icon={<PlusOutlined/>}`「添加字段」+ `Dropdown`(更多操作:批量删除 / 导出 JSON)

#### 2.3.2 字段列表表格

`Table` `size="middle"` `pagination={false}` `rowKey="id"`,系统字段置顶并整行底色 `#fafbfc`。

| 列 | 宽 | 内容 | 说明 |
|---|---|---|---|
| ⠿(拖拽) | 40 | `HolderOutlined` | 仅非系统字段可拖;`Table` `components` 自定义 + `dnd-kit` 或 `react-dnd` |
| 字段名 | 240 | 图标 + `Text strong`(label)+ 必填星号 | 字段类型图标 16px `#1677ff`;必填字段名后 `Text type="danger"` `*` |
| API 名 | 200 | `Text code secondary` | 等宽,系统字段 `id`/`created_at` 等 |
| 类型 | 140 | `Tag` + 文字 | 类型显示名 + 颜色映射(见 5.2),如「单选」 |
| 必填 | 80 | `Switch` `size="small"` | 仅非系统字段可切换,内联保存 |
| 唯一 | 80 | `Switch` `size="small"` | 同上 |
| 操作 | 120 | `Button type="text"` 编辑 / 复制 / 删除 | 系统字段仅「编辑」(受限);`Divider type="vertical"` 分隔;删除走 `Popconfirm` |

**行交互**:
- 双击行 → 打开字段配置抽屉(等同「编辑」)
- 拖拽排序 → 更新 `Field.order`(需在 `Field` 元数据补 `order` 字段或用列表顺序隐式表达)
- `rowSelection`(可选)勾选后顶部浮出批量操作条:`已选 N 项 [批量删除] [批量设置必填] [取消]`

**空状态**:无字段时 `Empty`「还没有字段」+ 居中「添加第一个字段」按钮(系统对象除外,系统对象始终预置系统字段)。

### 2.4 视图管理 Tab

#### 2.4.1 视图列表(子级)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 视图                          [List ▾ 新建视图]                      │
│ ├ 全部客户 (列表,默认)  ✎编辑  ⋮                                      │
│ ├ 我的客户 (列表)        ✎编辑  ⋮                                      │
│ └ 客户看板 (看板)        ✎编辑  ⋮                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- `Dropdown.Button`(新建视图,下拉选类型)或 `Select` + `Button`
- 视图条目:`List`,每项显示名称 + 类型 `Tag` + 「默认」标记(`isDefault`)+ 编辑/更多操作
- 点击视图条目 → 展开下方「视图配置器」(2.4.2)

#### 2.4.2 视图配置器

仅「列表视图」(Phase 1 核心)完整实现,其他类型预留面板。三个折叠区块(`Collapse` `accordion`):

**A. 筛选条件(Filter Builder)** — 对应 `FilterGroup`
```
┌ 筛选条件 ─────────────────────────────────────────────┐
│ 满足 [全部 ▾ / 任意 ▾] 条件              [+ 添加条件] │  ← logic: AND/OR
│ ┌──────────────────────────────────────────────────┐ │
│ │ [字段 ▾] [操作符 ▾] [值____]              [✕]    │ │  ← FilterCondition
│ │ [字段 ▾] [操作符 ▾] [值____]              [✕]    │ │
│ └──────────────────────────────────────────────────┘ │
│ [+ 添加条件组]                                       │  ← 嵌套 FilterGroup
└──────────────────────────────────────────────────────┘
```
- 字段:`Select`(候选 = 当前对象字段,按 `fieldId`)
- 操作符:`Select`,选项随字段 `type` 动态过滤(见 3.5.2)
- 值输入:按字段类型动态渲染(文本→`Input`,单选→`Select`,日期→`DatePicker`,多选→`Select mode="multiple"`,`is_empty`/`is_not_empty` 时隐藏值输入)

**B. 排序设置(Sort)** — 对应 `View.sorts: SortParam[]`
```
┌ 排序 ────────────────────────────────────────────────┐
│ [字段 ▾] [升序 ▾ / 降序 ▾]                   [✕]      │
│ [字段 ▾] [升序 ▾]                            [✕]      │
│ [+ 添加排序]                                         │
└──────────────────────────────────────────────────────┘
```

**C. 字段显隐与顺序(Fields)** — 对应 `View.fields: ViewFieldConfig[]`
```
┌ 字段显隐与顺序 ──────────────────────────────────────┐
│ ⠿ ☑ 客户名称        宽度 [160__] px                   │
│ ⠿ ☑ 联系电话        宽度 [140__] px                   │
│ ⠿ ☐ 创建时间        (隐藏)                           │
│ ⠿ ☑ 等级            宽度 [100__] px                   │
└──────────────────────────────────────────────────────┘
```
- 拖拽排序(`dnd-kit`)更新 `order`
- `Checkbox` 控制显隐(隐藏 = 不在 `fields` 中,或 `order=-1`)
- 列宽 `InputNumber`(`width`,仅列表视图)

### 2.5 字段编辑器(抽屉)

**触发**:点「+ 添加字段」→ 先弹「字段类型选择器」(Modal)→ 选定类型后打开「字段配置表单」(Drawer)。编辑已有字段直接打开 Drawer。

**形态**:`Drawer` `placement="right"` `width={480}`,标题随操作变化(「添加字段 — 单行文本」/「编辑字段 — 客户名称」)。底部固定操作栏 `Button`「取消」+ `Button type="primary"`「保存」(`Drawer` `footer` 或自定义 `Space` sticky)。

详见 §3.4 字段配置表单。

---

## 3. 组件规格

### 3.1 对象列表组件 `<ObjectListPanel>`

| 属性 | 规格 |
|---|---|
| 容器 | `Card` `style={{ width:264, borderRadius:12, border:'1px solid #eef0f4' }}` `styles={{ body:{ padding:0 } }}` |
| 标题区 | `padding:14px 16px`,`Title level={5}`「对象」+ 右侧 `Button type="primary" size="small" icon={<PlusOutlined/>}` |
| 搜索 | `Input.Search placeholder="搜索对象" allowClear size="small" style={{ margin:'0 16px 8px', width:'auto' }}` |
| 列表 | `List dataSource=objects renderItem`,外层 `height` 限定 + `overflow:auto` |
| 数据 | `useQuery(['objects', appId], objectsApi.list)` |
| 选中态 | `selectedKeys` 来自 URL `:objectId`;`onClick` → `navigate(/app/:appId/objects/:id)` |

### 3.2 字段列表表格 `<FieldTable>`

| 属性 | 规格 |
|---|---|
| 组件 | `Table` `size="middle"` `rowKey="id"` `pagination={false}` `bordered={false}` |
| 拖拽 | `components.body.row` 注入 `dnd-kit` `useSortable`;非系统字段 `HolderOutlined` 可拖,系统字段置灰 |
| 行样式 | 系统字段行 `style={{ background:'#fafbfc' }}` |
| 列定义 | 见 2.3.2 表格 |
| 搜索过滤 | 工具栏 `Input.Search` 按 `label`/`apiName` 过滤 `dataSource` |
| 批量 | `rowSelection={{ type:'checkbox' }}`,勾选数>0 时顶部 `Alert`/浮条显示操作 |
| 数据 | `useQuery(['object', objectId], objectsApi.getWithFields)`,从 `ObjectWithFields.fields` 取 |

### 3.3 字段类型选择器 `<FieldTypePicker>` (Modal)

**形态**:`Modal` `title="选择字段类型"` `width={640}` `footer={null}`(点类型即继续)。

**布局**:分组网格。按字段语义分 7 组,每组标题(`Text type="secondary"`) + 该组类型卡片网格(`Row gutter={[12,12]}`)。

```
┌ 选择字段类型 ──────────────────────────────────────┐
│                                                    │
│ 文本                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Aa 单行文本│ │ ≣  多行文本│ │ B  富文本 │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                    │
│ 数值                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │ #  数字   │ │ ¥  金额   │ │ %  百分比 │ │ № 自动编号││
│  └──────────┘ └──────────┘ └──────────┘ └────────┘│
│                                                    │
│ 选择        ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ ◉ 单选   │ │ ☑ 多选   │ │ ☑ 复选框 │            ││
│  ...                                              ││
└────────────────────────────────────────────────────┘
```

**类型卡片**:hover 高亮 `border-color:#1677ff` + `background:#e6f4ff`,cursor pointer。内容:图标 24px `#1677ff` + 类型名 `Text strong`。`Col xs={8}`(每行 3 个)。

**分组与类型(18 种,对齐 `FieldType` 枚举)**:

| 分组 | 类型(显示名 → FieldType) |
|---|---|
| 文本 | 单行文本 `Text`、多行文本 `LongText`、富文本 `RichText` |
| 数值 | 数字 `Number`、金额 `Currency`、百分比 `Percent`、自动编号 `AutoNumber` |
| 选择 | 单选 `SingleSelect`、多选 `MultiSelect`、复选框 `Checkbox` |
| 日期 | 日期 `Date`、日期时间 `DateTime` |
| 媒体 | 附件 `Attachment` |
| 引用 | 人员 `User`、关联 `Lookup`、子表 `SubForm` |
| 计算 | 公式 `Formula`、汇总 `Rollup` |

> 实现提示:用一份 `FIELD_TYPE_META` 常量表驱动选择器、表格类型列、表单渲染(见 §3.4 与 §5.2),单一数据源避免散落。

### 3.4 字段配置表单 `<FieldConfigDrawer>`

**形态**:`Drawer` `placement="right"` `width={480}`,`Form` `layout="vertical"` `preserve={false}`。

#### 3.4.1 通用配置(所有类型共有)

| 表单项 | name | 控件 | 校验 |
|---|---|---|---|
| 字段类型 | `type` | 只读展示(类型 Tag + 名称),新增时已选定 | — |
| 显示名称 | `label` | `Input` | `required`,长度 1-40 |
| API 名称 | `apiName` | `Input` 等宽 | `required`,正则 `^[a-z][a-z0-9_]*$`,应用内唯一;编辑态锁定 |
| 必填 | `required` | `Switch` | — |
| 唯一 | `unique` | `Switch` | — |
| 可搜索 | `searchable` | `Switch` | — |
| 描述 | `description` | `Input.TextArea rows={2}` | 选填 |

> 系统字段编辑时,`label`/`apiName`/`type`/`required` 等核心项锁定,仅可改描述等次要项。

#### 3.4.2 类型专属配置(按 `FieldConfig` 联合类型动态渲染)

根据 `type` 渲染以下区块(标题 `Divider orientation="left"`「类型配置」):

| FieldType | 专属配置项 | 控件 |
|---|---|---|
| `Text` / `LongText` / `RichText` | 最大长度 `maxLength` | `InputNumber min={1} max={10000}`,默认 255(单行)/ 2000(多行) |
| `Number` | 小数位数 `number.precision` | `InputNumber min={0} max={10}`,默认 0 |
| `Currency` | 小数位数 `number.precision` + 货币 `currency.code` | `InputNumber` + `Select`(CNY/USD/EUR...) |
| `Percent` | 小数位数 `number.precision` | `InputNumber`,默认 2 |
| `AutoNumber` | 编号规则 `autoNumber.format` | `Input` placeholder=`ORD-{seq:0000}`,旁置 `Tooltip` 说明 `{seq}` 占位符 |
| `SingleSelect` / `MultiSelect` | 选项列表 `options` | **选项管理器**(见 3.4.3) |
| `Date` / `DateTime` | 显示格式 `format` | `Select`(yyyy-MM-dd / yyyy-MM-dd HH:mm 等) |
| `Checkbox` | 默认值 | `Switch`(默认勾选/不勾选) |
| `Attachment` | (预留)最大数量 | `InputNumber`(Phase 1 可不强制) |
| `User` | 是否多选 `multi` | `Switch` |
| `Lookup` | 目标对象 `lookup.targetObjectId` + 关系类型 `lookup.relationType` + 反向字段名 `lookup.inverseFieldName` | `Select`(候选=同应用对象)+ `Radio.Group`(一对多/多对多)+ `Input`(选填) |
| `SubForm` | 子对象 `subForm.childObjectId` + 父关联字段 `subForm.parentFieldId` | `Select` + `Select`(候选=子对象的 lookup 字段) |
| `Formula` | 表达式 `formula.expression` + 返回类型 `formula.returnType` | `Input.TextArea`(或简易表达式编辑器)+ `Select`(Number/Text/Date/Currency) |
| `Rollup` | 目标字段 `rollup.targetFieldId` + 聚合方式 `rollup.aggregate` | `Select`(关联对象的数值字段)+ `Select`(sum/avg/count/min/max) |

> `Lookup`/`SubForm`/`Rollup` 涉及跨对象选择,Select 候选需异步加载(`useQuery` 拉取对象/字段列表)。

#### 3.4.3 选项管理器(单选/多选专用)

用于编辑 `SelectOption[]`,可增删改、设默认、设颜色、拖拽排序。

```
┌ 选项配置 ────────────────────────────────────────────┐
│ ⠿ 🟢 高优先级    [默认]                    [✕]        │  ← 行:拖拽手柄 + 颜色点(ColorPicker 触发)+ 标签(Input)+ 默认标记 + 删除
│ ⠿ 🔵 中优先级                            [✕]        │
│ ⠿ ⚪ 低优先级                            [✕]        │
│ [+ 添加选项]                                         │
└──────────────────────────────────────────────────────┘
```

- 颜色:`ColorPicker` `showText={false}`(弹出预设色板),或一组预设色 `Tag` 点选
- 默认:单选仅一项可为默认(`Radio` 语义,点选即互斥);多选可多项(`Checkbox`)
- 排序:拖拽(`dnd-kit`)更新数组顺序
- 实现:`Form.List` name="options",每项子表单 `{ id, label, color, isDefault }`

### 3.5 视图配置器 `<ViewConfigurator>`

#### 3.5.1 视图基本信息

| 项 | 控件 |
|---|---|
| 视图名称 `name` | `Input` required |
| 视图类型 `type` | 新建时 `Select`(List/Detail/Form/Kanban/Calendar/Gallery),编辑时只读 |
| 设为默认 `isDefault` | `Switch`(同对象仅一个默认) |

#### 3.5.2 筛选条件操作符(按字段类型过滤)

对应 `FilterOperator` 枚举。值输入控件随操作符 + 字段类型动态切换。

| 字段类型 | 可用操作符 | 值输入控件 |
|---|---|---|
| Text/LongText/RichText | eq, ne, contains, not_contains, starts_with, ends_with, is_empty, is_not_empty | `Input`(`is_empty`/`is_not_empty` 时隐藏) |
| Number/Currency/Percent | eq, ne, gt, gte, lt, lte, is_empty, is_not_empty | `InputNumber` |
| SingleSelect | eq, ne, is_empty, is_not_empty, in | `Select` |
| MultiSelect | contains, not_contains, is_empty, is_not_empty | `Select mode="multiple"` |
| Date/DateTime | eq, ne, gt, gte, lt, lte, is_empty, is_not_empty, relative_date | `DatePicker`;`relative_date` 时 `Select`(今天/本周/本月/近 7 天...) |
| Checkbox | eq | `Switch` |
| User/Lookup | eq, ne, is_empty, is_not_empty | `Select`(异步候选) |
| AutoNumber | eq, ne, contains, is_empty, is_not_empty | `Input` |
| Formula/Rollup/SubForm/Attachment | is_empty, is_not_empty | (无值输入) |

#### 3.5.3 筛选条件构建器实现

- 顶层 `FilterGroup` `logic`(AND/OR)用 `Radio.Group` 或 `Segmented`
- 条件用 `Form.List` name="conditions",每行三列 `Select`(字段)+ `Select`(操作符)+ 动态值控件 + 删除 `Button`
- 嵌套条件组:递归渲染同一组件(支持 `conditions` 内含 `FilterGroup`)

---

## 4. 交互流程

### 4.1 完整用户旅程:创建对象 → 加字段 → 配视图 → 录数据

```
1. 进入对象设计器(/app/:appId/objects)
   └ 右栏空状态 → 点「新建对象」
2. 新建对象弹窗
   ├ 填: 显示名称「客户」、API 名称「customer」(自动转 snake_case 建议)、图标 emoji、描述
   └ 确定 → 后端创建 → 左栏列表新增并自动选中 → 右栏进入字段 Tab(仅系统字段)
3. 添加字段
   ├ 点「+ 添加字段」→ 字段类型选择器(Modal)→ 选「单行文本」
   ├ 字段配置抽屉(Drawer):填显示名「客户名称」、apiName「customer_name」、必填=是、最大长度 100
   └ 保存 → 抽屉关闭 → 表格新增行 → message.success「字段已添加」
4. (重复)添加 联系电话(text)、等级(single_select: 高/中/低)、下单时间(date_time) 等字段
5. 设主显示字段:对象头部「主显示字段」Select → 选「客户名称」
6. 配置视图
   ├ 视图 Tab → 新建视图「我的客户」(列表)→ 默认生成全部字段可见
   ├ 筛选:等级 eq 高 AND 下单时间 relative_date 本月
   ├ 排序:下单时间 desc
   └ 字段显隐:隐藏「创建时间」,拖拽调整列序,设置列宽
7. 录入数据(Phase 1 可在对象设计器内提供简易记录预览,或跳转运行时)
   └ 表格上方「查看记录」→ 跳转 runtime-ui 列表页(消费同一视图配置)
```

### 4.2 关键交互细节

#### 4.2.1 拖拽排序

- **字段表格**:行拖拽。拖动 `HolderOutlined` 列 → 行提升 + 阴影 `0 8px 24px rgba(0,0,0,0.12)` + 占位虚线;松手后即时更新本地顺序并 `PATCH` 字段顺序。系统字段不可拖(锁定置顶)。
- **视图字段显隐列表**:同上,拖拽改 `order`。
- **选项管理器**:拖拽改选项顺序。
- **技术选型**:推荐 `@dnd-kit/core` + `@dnd-kit/sortable`(轻量、无障碍、AntD 5 兼容好);需在 `package.json` 新增依赖。或用 `react-dnd`(AntD 官方 Table 拖拽示例所用)。

#### 4.2.2 内联编辑

- 对象名称、描述:`Typography` `editable`(`tooltip="点击编辑"`),`onChange` 触发 `PATCH`,loading 时显示 `Skeleton.Input`。
- 字段必填/唯一:`Switch` 切换即 `PATCH` 单字段,`message.success` 反馈,失败回滚。

#### 4.2.3 批量操作

- 表格 `rowSelection` 勾选后,工具栏下方浮出 `Alert` `type="info"`:`已选 N 项` + `[批量删除]` `[批量设为必填]` `[取消选择]`。
- 批量删除:`Popconfirm` 二次确认,展示将删除的字段名列表。

#### 4.2.4 危险操作确认

- 删除字段 / 删除对象:`Popconfirm` `title` 明确后果(「删除后数据将不可恢复」),`okButtonProps={{ danger:true }}`。
- 删除含关联/被引用的对象:后端返回 `409` → `message.error` 提示被引用位置。

#### 4.2.5 API 名称自动生成

新建对象/字段时,输入显示名称后实时生成 API 名建议:`客户` → `customer`,`客户名称` → `customer_name`(中文转拼音或直接要求手填)。提供「使用建议」链接一键填充。创建后 API 名锁定不可改。

### 4.3 状态与数据流

```
React Query keys:
  ['objects', appId]              → 对象列表(左栏)
  ['object', objectId]            → 对象 + 字段(ObjectWithFields)
  ['object', objectId, 'views']   → 视图列表
  ['view', viewId]                → 单个视图配置

Mutation → 成功后 invalidate 对应 key
  createObject   → invalidate ['objects', appId]
  updateObject   → invalidate ['object', objectId]
  deleteObject   → invalidate ['objects', appId] + navigate 回 /objects
  createField    → invalidate ['object', objectId]
  updateField    → invalidate ['object', objectId]
  reorderFields  → invalidate ['object', objectId]
  create/updateView → invalidate ['object', objectId, 'views'], ['view', viewId]
```

---

## 5. 视觉规格

### 5.1 配色方案(对齐 Studio `#1677ff` 主色)

| 语义 | 色值 | 用途 |
|---|---|---|
| 主色 Primary | `#1677ff` | 主按钮、选中态、链接、图标默认 |
| 主色浅 | `#e6f4ff` | 选中行背景、图标块背景、hover 高亮(AntD `colorPrimaryBg`) |
| 成功 Success | `#52c41a` | 成功 message、已发布标记 |
| 警告 Warning | `#fa8c16` | 草稿标记 |
| 危险 Error | `#ff4d4f` | 删除按钮、必填星号、错误提示 |
| 页面背景 | `#f5f7fa` | Content 区 |
| 容器背景 | `#ffffff` | 卡片/表格 |
| 次级背景 | `#fafbfc` | 系统字段行、hover、统计卡 |
| 边框(强) | `#eef0f4` | 卡片边框、分隔线 |
| 边框(弱) | `#f0f2f5` | 表格内分隔 |
| 文字主 | `rgba(0,0,0,0.88)` | 标题、主要文本(AntD `colorText`) |
| 文字次 | `rgba(0,0,0,0.45)` | 辅助说明、API 名(AntD `colorTextSecondary`) |

> 推荐用 `theme.useToken()` 取 AntD token,而非硬编码,便于后续主题切换。Tailwind 仅用于布局工具类(`flex`/`gap`/`p-*`),颜色一律走 AntD token 或上述常量。

### 5.2 字段类型图标映射

驱动 `FIELD_TYPE_META` 常量(同时承载类型显示名、Tag 颜色)。所有图标来自 `@ant-design/icons`(已验证可用)。

| FieldType | 显示名 | 图标 | Tag 颜色(AntD preset) |
|---|---|---|---|
| `text` | 单行文本 | `FontSizeOutlined` | `blue` |
| `long_text` | 多行文本 | `AlignLeftOutlined` | `blue` |
| `rich_text` | 富文本 | `BoldOutlined` | `blue` |
| `number` | 数字 | `NumberOutlined` | `geekblue` |
| `currency` | 金额 | `DollarOutlined` | `geekblue` |
| `percent` | 百分比 | `PercentageOutlined` | `geekblue` |
| `auto_number` | 自动编号 | `FieldNumberOutlined` | `geekblue` |
| `single_select` | 单选 | `TagOutlined` | `purple` |
| `multi_select` | 多选 | `TagsOutlined` | `purple` |
| `checkbox` | 复选框 | `CheckSquareOutlined` | `purple` |
| `date` | 日期 | `CalendarOutlined` | `green` |
| `date_time` | 日期时间 | `ClockCircleOutlined` | `green` |
| `attachment` | 附件 | `PaperClipOutlined` | `orange` |
| `user` | 人员 | `UserOutlined` | `cyan` |
| `lookup` | 关联 | `LinkOutlined` | `cyan` |
| `sub_form` | 子表 | `TableOutlined` | `cyan` |
| `formula` | 公式 | `FunctionOutlined` | `magenta` |
| `rollup` | 汇总 | `CalculatorOutlined` | `magenta` |

> 通用图标:`PlusOutlined`(添加)、`HolderOutlined`(拖拽手柄)、`EditOutlined`(编辑)、`DeleteOutlined`(删除)、`CopyOutlined`(复制)、`EyeOutlined`/`EyeInvisibleOutlined`(显隐)、`SearchOutlined`(搜索)、`FilterOutlined`(筛选)、`SortAscendingOutlined`(排序)、`SettingOutlined`(设置)、`MoreOutlined`(更多)、`ReloadOutlined`(刷新)、`DatabaseOutlined`(对象/数据)、`AppstoreOutlined`(网格)。

### 5.3 间距 / 圆角 / 阴影规范

**间距(Spacing,8px 栅格)**:
- 页面级:Content padding `24px`(沿用 `StudioLayout`);卡片内边距 `20px`/`24px`
- 区块间距:`16px`(紧凑)/ `24px`(常规)
- 表单项间距:`Form` 默认(AntD 5 `marginBottom:24`);紧凑区可用 `size="small"`
- 图标与文字:`8px`

**圆角(Border Radius)**:
- 卡片 / 表格容器:`12px`
- 弹窗 / 抽屉:`16px`(Modal 默认 8,建议 `style={{ borderRadius:16 }}`)
- 按钮 / 输入框 / Tag:`6px`(AntD 默认 6)
- 小图标块 / 标签:`8px`–`10px`
- 图标大块(空状态):`28px`

**阴影(Box Shadow)**:
- 卡片(静态):`0 1px 3px rgba(0,0,0,0.04)`
- 卡片(悬浮):`0 8px 24px rgba(0,0,0,0.04)`(过渡 `transition: all 0.3s ease`)
- 顶栏 / 吸顶工具栏:`0 1px 4px rgba(0,0,0,0.03)`
- 拖拽中行:`0 8px 24px rgba(0,0,0,0.12)`
- 主按钮 / 图标块:`0 4px 12px rgba(22,119,255,0.25)`(主色阴影,复用 AppList)

**字号**:
- 页面标题:`Title level={3}`(24px)/ `level={4}`(20px)
- 区块标题:`Title level={5}`(16px)
- 正文 / 表格:`14px`
- 辅助文字 / API 名 / 计数:`12px`

**AntD ConfigProvider token 建议**(可选,写入 `main.tsx`):
```ts
<ConfigProvider
  locale={zhCN}
  theme={{
    token: {
      colorPrimary: '#1677ff',
      borderRadius: 6,
      fontSize: 14,
    },
    components: {
      Table: { headerBg: '#fafbfc', headerColor: 'rgba(0,0,0,0.45)', cellPaddingBlock: 12 },
      Drawer: { paddingLG: 24 },
    },
  }}
>
```

---

## 6. Ant Design 组件映射

| 界面元素 | AntD 组件 | 关键 props |
|---|---|---|
| 对象列表容器 | `Card` / `List` | `styles={{ body:{ padding:0 } }}`,`List` `renderItem` |
| 对象列表项 | `List.Item` + `Space` | 自定义 `className` 控制选中态 |
| 搜索框 | `Input.Search` | `allowClear size="small"` |
| 新建对象弹窗 | `Modal` + `Form` | `layout="vertical"`,`destroyOnClose` |
| 图标/颜色选择 | `Input`(emoji)+ `ColorPicker` | 复用 `AppList` 创建应用弹窗 |
| 对象头部信息 | `Typography.Title/Paragraph` `editable` + `Space` | `editable={{ tooltip }}` |
| 主显示字段选择 | `Select` | 候选=文本类字段 |
| Tab 切换 | `Tabs` | `items=[{key:'fields'},{key:'views'},{key:'advanced'}]` |
| 字段表格 | `Table` | `size="middle"` `pagination={false}` `rowKey="id"`,`components` 注入拖拽 |
| 表格拖拽 | `@dnd-kit/sortable` + `Table.components` | `useSortable` per row |
| 表格行内开关 | `Switch` | `size="small"` |
| 行操作按钮 | `Button type="text"` + `Divider type="vertical"` | `icon` only 或 `size="small"` |
| 批量操作条 | `Alert` + `Space` | `type="info"` `action` |
| 危险确认 | `Popconfirm` | `okButtonProps={{ danger:true }}` |
| 字段类型选择器 | `Modal` + `Row`/`Col` 网格 | `footer={null}` `width={640}` |
| 类型卡片 | `Card` hoverable | `size="small"`,hover 边框变主色 |
| 字段配置抽屉 | `Drawer` + `Form` | `placement="right" width={480} layout="vertical"` |
| 动态表单分区 | `Divider orientation="left"` | 标题「类型配置」 |
| 选项管理器 | `Form.List` + `dnd-kit` | 每项 `{id,label,color,isDefault}` |
| 颜色选择 | `ColorPicker` | `showText={false}` 或预设色 `Tag` |
| 视图列表 | `List` + `Tag` | 类型 Tag + 「默认」Tag |
| 筛选条件构建器 | `Form.List` + `Select`/`InputNumber`/`DatePicker` | 嵌套递归 |
| 逻辑 AND/OR | `Segmented` 或 `Radio.Group` | `options=['全部','任意']` |
| 排序设置 | `Form.List` + `Select` + `Segmented`(asc/desc) | — |
| 字段显隐拖拽 | `Checkbox` + `dnd-kit` + `InputNumber`(宽度) | — |
| 折叠面板 | `Collapse` | `accordion`,`items` |
| 全局反馈 | `message` | `message.success/error` |
| 空状态 | `Empty` | `description` + children 按钮 |
| 加载态 | `Skeleton` | `active avatar` |
| 路由参数 | `useParams` / `useNavigate` | `appId` `objectId` |
| 取数 | `useQuery` / `useMutation` | `@tanstack/react-query` |
| 全局状态 | `zustand`(如需对象选中态跨组件) | — |

### 6.1 新增依赖建议

| 依赖 | 用途 | 是否必须 |
|---|---|---|
| `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` | 拖拽排序(字段 / 选项 / 视图字段) | 是 |
| (备选) `react-dnd` `react-dnd-html5-backend` | AntD 官方拖拽示例所用 | 二选一 |

> 其余(表单/表格/弹窗/抽屉)均由已安装的 `antd@5.29` + `@ant-design/icons@5.6` 提供,无需额外依赖。

---

## 7. 文件结构建议(供开发 agent 参考)

```
packages/studio/src/
├── pages/
│   └── ObjectDesigner.tsx          # 列表页容器(左栏 + 右栏 + 路由 Outlet)
├── components/object/
│   ├── ObjectListPanel.tsx         # 左栏:对象列表
│   ├── ObjectDetail.tsx            # 右栏:对象详情(头部 + Tabs)
│   ├── ObjectHeader.tsx            # 对象基本信息(内联编辑)
│   ├── FieldTable.tsx              # 字段列表表格(拖拽)
│   ├── FieldTypePicker.tsx         # 字段类型选择器(Modal)
│   ├── FieldConfigDrawer.tsx       # 字段配置抽屉(动态表单)
│   ├── OptionManager.tsx           # 选项管理器(单选/多选)
│   ├── ViewListPanel.tsx           # 视图列表
│   ├── ViewConfigurator.tsx        # 视图配置器(筛选/排序/显隐)
│   ├── FilterBuilder.tsx           # 筛选条件构建器(递归)
│   └── constants.ts                # FIELD_TYPE_META(类型→图标/显示名/Tag色/操作符)
├── api/
│   └── objects.ts                  # objectsApi(list/get/getWithFields/create/update/delete + fields + views)
└── (路由调整) router.tsx           # 新增 /app/:appId/objects/:objectId 子路由
```

### 7.1 路由调整

`router.tsx` 中「对象」路由改为含子路由:

```tsx
<Route path="objects" element={<ObjectDesigner />}>
  <Route index element={<ObjectEmptyState />} />
  <Route path=":objectId" element={<ObjectDetail />} />
</Route>
```

`ObjectDesigner` 渲染左栏 + `<Outlet/>`(右栏),保持选中态与 URL 同步。

---

## 8. 与后端 API 对齐(预期端点)

> 以下为前端预期,实际以后端 meta-svc 实现为准。响应统一 `{ ok, data }`。

| 操作 | 方法 + 路径 | 返回 |
|---|---|---|
| 对象列表 | `GET /api/apps/:appId/objects` | `ObjectMeta[]`(含字段数/记录数统计) |
| 对象详情(含字段) | `GET /api/objects/:objectId` | `ObjectWithFields` |
| 创建对象 | `POST /api/apps/:appId/objects` | `ObjectMeta` |
| 更新对象 | `PATCH /api/objects/:objectId` | `ObjectMeta` |
| 删除对象 | `DELETE /api/objects/:objectId` | `{ deleted:true }` |
| 字段排序 | `PATCH /api/objects/:objectId/fields/reorder` | `Field[]` |
| 创建字段 | `POST /api/objects/:objectId/fields` | `Field` |
| 更新字段 | `PATCH /api/objects/:objectId/fields/:fieldId` | `Field` |
| 删除字段 | `DELETE /api/objects/:objectId/fields/:fieldId` | `{ deleted:true }` |
| 视图列表 | `GET /api/objects/:objectId/views` | `View[]` |
| 视图详情 | `GET /api/views/:viewId` | `View` |
| 创建/更新/删除视图 | `POST`/`PATCH`/`DELETE` `/api/views...` | `View` / `{ deleted }` |

> `objectsApi` 封装风格对齐现有 `appsApi`(`api/objects.ts`),用 `client` + React Query。

---

## 9. 实现优先级(Phase 1 MVP 范围)

| 优先级 | 范围 | 说明 |
|---|---|---|
| P0 | 对象列表 + 对象详情 + 字段表格 + 添加/编辑/删除字段(基础类型) | 覆盖 text/number/single_select/date/checkbox/lookup |
| P0 | 新建对象弹窗 + 对象头部内联编辑 | — |
| P1 | 拖拽排序(字段)、批量操作 | dnd-kit 接入 |
| P1 | 选项管理器、公式/汇总/子表配置 | 复杂类型表单 |
| P2 | 视图管理 + 视图配置器(筛选/排序/显隐) | 列表视图完整 |
| P2 | 其他视图类型(Kanban/Calendar/Gallery) | 仅配置面板,渲染在 runtime-ui |
| P3 | 记录预览 / 跳转运行时录入 | 与 runtime-svc 联调 |

---

## 附:关键参考文件

- 类型契约(SSOT):[`packages/shared/src/object/index.ts`](../../packages/shared/src/object/index.ts) — `FieldType` / `FieldConfig` / `ObjectMeta` / `View` / `FilterOperator`
- 通用类型:[`packages/shared/src/common/index.ts`](../../packages/shared/src/common/index.ts) — 品牌 ID / `ApiResponse` / `Paginated` / `SortParam`
- 数据库模型:[`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma) — `ObjectMeta` / `View` / `Record`(JSONB 宽表)
- 现有占位页:[`packages/studio/src/pages/ObjectDesigner.tsx`](../../packages/studio/src/pages/ObjectDesigner.tsx)
- 布局:[`packages/studio/src/layouts/StudioLayout.tsx`](../../packages/studio/src/layouts/StudioLayout.tsx)
- 风格参照(卡片/弹窗/表单):[`packages/studio/src/pages/AppList.tsx`](../../packages/studio/src/pages/AppList.tsx) / [`AppDashboard.tsx`](../../packages/studio/src/pages/AppDashboard.tsx)
- API 封装范例:[`packages/studio/src/api/apps.ts`](../../packages/studio/src/api/apps.ts)
- 路由:[`packages/studio/src/router.tsx`](../../packages/studio/src/router.tsx)
- 主题/入口:[`packages/studio/src/main.tsx`](../../packages/studio/src/main.tsx)
