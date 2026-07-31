# 页面搭建器 设计规范 (DESIGN-page-builder)

> 模块: Phase 2 — 可视化页面搭建器
> 角色: UI/UE 设计规范,供前端开发 agent 直接实现
> 技术栈: React 18 + Ant Design 5 + TailwindCSS 3 + React Query + Zustand + React Router v6 + dnd-kit
> 对标: 飞书 aPaaS 拖拽式可视化搭建器(三栏:组件面板 / 画布 / 属性面板)
> 类型契约来源: [`packages/shared/src/page/index.ts`](../../packages/shared/src/page/index.ts)(SSOT,本规范所有组件类型 / Schema / 动作类型均与其对齐)

---

## 0. 设计对齐说明

本规范与现有 Studio 骨架严格对齐,复用既有约定:

| 约定项 | 取值 | 来源 |
|---|---|---|
| 主色 | `#1677ff`(AntD 5 默认 token `colorPrimary`) | `main.tsx` ConfigProvider 未覆盖 token,沿用默认 |
| 页面背景 | `#f5f7fa` | `StudioLayout` / `ObjectDesigner` |
| 容器背景 | `#fff`(`colorBgContainer`) | `theme.useToken()` |
| 次级背景 | `#fafbfc` | `AppDashboard` 统计卡 / `FieldConfigDrawer` 选项行 |
| 主色浅 | `#e6f4ff` | 选中态背景、图标块背景(AntD `colorPrimaryBg`) |
| 分隔线 / 边框 | `#eef0f4`(强) / `#f0f2f5`(弱) | `StudioLayout` / `ObjectDesigner` |
| 阴影 | 卡片 `0 1px 3px rgba(0,0,0,0.04)`,悬浮 `0 8px 24px rgba(0,0,0,0.04)`,吸顶栏 `0 1px 4px rgba(0,0,0,0.03)` | 现有页面 |
| 圆角 | 卡片 `12`,弹窗/抽屉 `16`,小元素 `8`/`10`,图标大块 `28` | 现有页面 |
| StudioLayout 结构 | 左侧 `Sider width=220`(固定) + `Header height=56` + `Content padding=24` | `StudioLayout.tsx` |
| 路由 | `/app/:appId/pages` 渲染 `PageBuilder` | `router.tsx` |
| 侧边栏入口 | Studio 左侧导航「页面」项(`LayoutOutlined`),`selectedKey = 'pages'` | `StudioLayout` |
| API 模式 | `client.get/post/put/delete`,响应 `{ ok, data }`,React Query 取数 | `api/objects.ts` |
| locale | `zhCN` | `main.tsx` |
| dnd-kit | `@dnd-kit/core@6` `@dnd-kit/sortable@10` `@dnd-kit/utilities@3` **已安装** | `packages/studio/package.json` |

> **重要布局差异**:对象设计器是「StudioLayout.Content 内再嵌一层主从布局」;而页面搭建器需要**全屏三栏**(`组件面板 / 画布 / 属性面板`),必须撑满 `100vh - 56px`(顶栏)。因此 `PageBuilder` 不复用 `StudioLayout` 默认的「Content 内白色卡片包裹层」,而是占满 Content 区直接渲染三栏。见 §1.2 与 §7.1。

> **实现提示**:`PageBuilder.tsx` 现为占位页,需整体重写。建议拆分为 `pages/PageBuilder.tsx`(三栏容器 + DndContext + 路由 Outlet) + `components/page-builder/` 子组件目录,保持单文件可读性。Studio 侧 ID 统一用 `string`(运行时与品牌 ID 同为 string),与 `objects.ts` 一致;Studio 不直接依赖 `@apaas/shared`,按 `objects.ts` 既有惯例以接口形式重新声明页面相关类型(见 §8)。

---

## 1. 设计概述

### 1.1 定位

页面搭建器是 aPaaS 的「表现层中枢」。用户在此拖拽组件搭建页面,配置视图模型与表达式绑定,平台产出的「页面 Schema JSON」由运行时渲染器消费、动态渲染。本模块遵循「元数据驱动」原则——搭建器产出的是配置 JSON(`PageSchema`),而非源代码。

三大核心概念(均来自 `packages/shared/src/page/index.ts`):

| 概念 | 类型 | 说明 |
|---|---|---|
| 组件树 | `ComponentNode[]`(树) | 页面结构,`props` 可含绑定表达式 `{ __bind: 'vm.xxx' }` |
| 视图模型 | `ViewModel` | 页面级状态树,组件属性通过路径绑定到状态节点 |
| 事件动作 | `ActionConfig`(`{ type: ActionType, params }`) | 组件事件触发的动作(查询/提交/跳转/设变量等) |

### 1.2 整体布局:全屏三栏

不复用 `StudioLayout` 的 Content 内白色卡片,直接在 Content 区渲染三栏,撑满 `calc(100vh - 56px)`(56 为 StudioLayout Header)。这是飞书 aPaaS 与同类低代码搭建器(Webflow / 钉钉宜搭 / 腾讯微搭)的通用模式。

```
┌─ StudioLayout.Header(返回应用列表 / 用户菜单,height:56)──────────────────────────────┐
├─ StudioLayout.Sider(应用内导航:工作台 / 对象 / 页面 ◀ / 流程 / 权限,width:220)─┤
│                                                                                 │
│  ┌─ Content(padding:0, bg:#f5f7fa) ────────────────────────────────────────────┐ │
│  │ ┌─ 搭建器工具栏(height:48, bg:#fff, sticky)──────────────────────────────┐ │ │
│  │ │ ◀返回  页面名称 [editable]   页面类型▾  对象▾   ⤺撤销 ⤹重做  预览 发布  │ │ │
│  │ ├─────────────────────────────────────────────────────────────────────────┤ │ │
│  │ │ ┌────────────┬───────────────────────────────────────────┬────────────┐│ │ │
│  │ │ │ 组件面板    │  画布(Center)                              │ 属性面板   ││ │ │
│  │ │ │ (Left)     │  ┌─ 缩放工具(右上浮动) ─┐                 │ (Right)   ││ │ │
│  │ │ │ 280px      │  │ − 100% +  ⊡网格        │                 │ 360px     ││ │ │
│  │ │ │            │  └────────────────────────┘                 │            ││ │ │
│  │ │ │ 🔍搜索组件  │  ┌─ 页面画布(居中,固定宽,白底)─────────┐  │ Tabs:      ││ │ │
│  │ │ │ ─容器      │  │                                        │  │ 基础属性  ││ │ │
│  │ │ │  ▸ 页面    │  │   拖拽放置区 / 组件树渲染              │  │ 样式      ││ │ │
│  │ │ │  ▸ 分区    │  │   (选中蓝色边框高亮)                  │  │ 数据绑定  ││ │ │
│  │ │ │ ─数据      │  │   (拖拽时蓝色放置指示器)              │  │ 事件      ││ │ │
│  │ │ │  ▾ 表格    │  │                                        │  │            ││ │ │
│  │ │ │ ─表单      │  └────────────────────────────────────────┘  │ (属性表单) ││ │ │
│  │ │ │ ─展示      │                                              │            ││ │ │
│  │ │ │            │                                              │            ││ │ │
│  │ │ └────────────┴───────────────────────────────────────────────┴────────────┘│ │ │
│  │ └─────────────────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**三栏尺寸**:
- 左栏(组件面板):固定 `280px`,不可折叠(MVP),全高,`overflow-y:auto`
- 中栏(画布):`flex:1`,`overflow:auto`,内部画布居中
- 右栏(属性面板):固定 `360px`,全高,`overflow-y:auto`

> 尺寸依据:左/右栏需容纳可读表单项与组件卡片,`280`/`360` 为飞书/钉钉宜搭常见取值;中栏弹性适应。两栏与画布之间用 `1px solid #eef0f4` 分隔,无 gap(最大化画布空间)。

### 1.3 信息架构

```
页面搭建器
├── 搭建器工具栏(顶部,吸顶)
│   ├── 返回(到 /pages 列表)*
│   ├── 页面名称(内联编辑)
│   ├── 页面类型 Select(ListPage/DetailPage/FormPage/Dashboard/Custom)
│   ├── 关联对象 Select(列表/详情/表单页必选)
│   ├── 撤销 / 重做
│   ├── 预览(抽屉预览运行时效果)
│   └── 发布(Switch 或 Button)
├── 左栏:组件面板
│   ├── 搜索组件
│   └── 分类折叠面板(容器 / 数据 / 表单 / 展示)
│       └── 组件项(图标 + 名称,可拖拽)
├── 中栏:画布
│   ├── 缩放工具(50%–150%)
│   ├── 拖放区(空状态:拖入第一个组件)
│   ├── 组件树渲染(递归)
│   ├── 选中高亮(蓝色边框)
│   ├── 悬停提示(组件名 + 复制/删除)
│   └── 拖拽放置指示器(蓝色线条)
├── 右栏:属性面板
│   └── Tabs(基础属性 / 样式 / 数据绑定 / 事件)
│       ├── 基础属性(ID / 名称 / 可见性 / 自定义 class)
│       ├── 样式(宽高 / 间距 / 边框 / 背景)
│       ├── 数据绑定(属性值 = 常量 或 绑定表达式)
│       └── 事件(事件列表 → 动作配置)
├── 视图模型面板(折叠抽屉 / 左栏底部)
│   ├── 变量树(可折叠)
│   └── 变量编辑(名称 / 类型 / 初始值 / 数据源)
└── 页面类型模板(新建页面时选择)
    ├── 列表页模板(搜索栏 + DataTable + 分页)
    ├── 详情页模板(DetailCard 字段自动布局)
    └── 表单页模板(Form 字段自动生成表单项)
```

> *「返回」:Phase 2 MVP 若暂无「页面列表页」(路由 `/app/:appId/pages` 直接进入搭建器),工具栏「返回」指向 `/app/:appId/dashboard`。如已有页面列表,则返回列表。

### 1.4 交互模式总览

| 模式 | 说明 | AntD / 技术实现 |
|---|---|---|
| 拖拽添加 | 从组件面板拖组件到画布 | `dnd-kit` `DndContext` + `useDraggable`(面板)+ `useDroppable`(画布) |
| 拖拽移动 | 画布内拖组件改变顺序/嵌套 | `dnd-kit` `useSortable`(树节点) |
| 点击选中 | 点击组件 → 蓝色边框高亮 + 属性面板加载 | `selectedId` state(Store) |
| 悬停提示 | 悬停浮出组件名 + 复制/删除按钮 | 绝对定位浮层 + `actions` |
| 放置指示器 | 拖拽时蓝色线条指示插入位置 | `dnd-kit` `DragOverlay` + 自定义指示线 |
| 画布缩放 | 50%–150% 缩放 | `transform: scale()`,`Segmented` 或滑块 |
| 属性内联编辑 | 页面名称点击即编辑 | `Typography` `editable` |
| 撤销/重做 | 编辑历史栈 | Zustand `past[]`/`future[]`(或 `zundo`) |
| 实时预览 | 抽屉内渲染运行时效果 | `Drawer` + 运行时渲染器(Phase 2 后期) |
| 即时反馈 | 增删改用 `message`,危险操作用 `Popconfirm` | `message` / `Popconfirm` |

---

## 2. 三栏布局规格

### 2.1 顶层容器 `<PageBuilder>`

**路由**:`/app/:appId/pages`(MVP 直接进入搭建器);如需多页面:`/app/:appId/pages` 列表 + `/app/:appId/pages/:pageId` 编辑。

**布局**:`PageBuilder` 渲染一个 `DndContext` 包裹的全屏 flex 容器,撑满 StudioLayout Content。

```tsx
// 关键结构(示意)
<div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
  <BuilderToolbar />                    {/* 工具栏,高 48,吸顶 */}
  <DndContext ...>
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <ComponentPanel />               {/* 左栏 280 */}
      <Canvas />                       {/* 中栏 flex:1 */}
      <PropertyPanel />                {/* 右栏 360 */}
    </div>
  </DndContext>
  <ViewModelDrawer />                  {/* 视图模型抽屉,按需打开 */}
</div>
```

> **不在 StudioLayout 默认白卡内**:`StudioLayout` 的 Content 默认包了一层 `padding:28 + 白底圆角卡片`(见 `StudioLayout.tsx` 第 189-200 行)。页面搭建器需绕过此层。两种实现:① `PageBuilder` 用负 margin 撑破(不优雅);② 调整 `StudioLayout`,新增 `fullBleed` 模式(推荐,见 §7.2)。MVP 可先用方案①快速验证。

**整体尺寸速查**:

| 区域 | 宽 | 高 | 背景 | 边框 |
|---|---|---|---|---|
| 工具栏 | 100% | 48px | `#fff` | `border-bottom:1px solid #eef0f4`,`box-shadow:0 1px 4px rgba(0,0,0,0.03)` |
| 左栏 组件面板 | 280px | `calc(100vh - 56px - 48px)` | `#fff` | `border-right:1px solid #eef0f4` |
| 中栏 画布 | flex:1 | 同上 | `#f5f7fa`(画布外区) / `#fff`(画布本体) | — |
| 右栏 属性面板 | 360px | 同上 | `#fff` | `border-left:1px solid #eef0f4` |

### 2.2 搭建器工具栏 `<BuilderToolbar>`

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ◀返回  📄 客户列表页 [edit]   类型:[列表页▾]  对象:[客户▾]   ⤺ ⤹   👁预览  发布│
└──────────────────────────────────────────────────────────────────────────────────┘
```

| 元素 | 控件 | 规格 |
|---|---|---|
| 返回 | `Button type="text" icon={<ArrowLeftOutlined/>}` | `fontSize:13`,跳转上一级 |
| 页面图标 | emoji 文本 32×32 圆角 8 | 渐变背景(复用 AppDashboard 样式) |
| 页面名称 | `Typography.Title level={5}` `editable` | 失焦保存,`tooltip="点击编辑"` |
| 页面类型 | `Select` | 候选 = `PageType` 枚举(列表/详情/表单/仪表盘/自定义) |
| 关联对象 | `Select showSearch` | 候选 = `objectsApi.list(appId)`,仅列表/详情/表单页必填 |
| 撤销/重做 | `Button type="text" icon` | `UndoOutlined`/`RedoOutlined`,无历史时 `disabled` |
| 预览 | `Button icon={<EyeOutlined/>}`「预览」 | 打开 `Drawer` 右侧,渲染运行时效果(Phase 2 后期) |
| 发布 | `Switch` 或 `Button type="primary"` | 切换 `PageMeta.published`,`Popconfirm` 确认发布 |
| 保存 | 隐式自动保存 / `Button type="primary"` | 推荐防抖自动保存到草稿 |

> 工具栏左侧 `Space size={12}`,右侧 `Space size={8}`,中间用 `flex:1` 撑开。

---

## 3. 组件面板设计(左栏)

### 3.1 面板容器 `<ComponentPanel>`

```
┌─ 组件面板 (280px, bg:#fff) ─────────────┐
│ ┌────────────────────────────────────┐ │
│ │ 🔍 搜索组件…                       │ │  ← Input.Search(allowClear, size="small", margin:12)
│ ├────────────────────────────────────┤ │
│ │ ▾ 容器                              │ │  ← Collapse 折叠面板
│ │  ┌────────┐ ┌────────┐ ┌────────┐  │ │
│ │  │ ▤ 页面  │ │ ▥ 分区  │ │ ▥ 栅格  │  │ │  ← 组件项(网格,每行 3 个)
│ │  └────────┘ └────────┘ └────────┘  │ │
│ │ ▾ 数据                              │ │
│ │  ┌────────┐ ┌────────┐ ┌────────┐  │ │
│ │  │ ▦ 表格  │ │ ▣ 详情  │ │ ≡ 列表  │  │ │
│ │  └────────┘ └────────┘ └────────┘  │ │
│ │ ▸ 表单                              │ │  ← 折叠态
│ │ ▸ 展示                              │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

**规格**:
- 容器:`div` `width:280` `height:100%` `background:#fff` `border-right:1px solid #eef0f4` `overflow-y:auto`
- 搜索:`Input.Search` `placeholder="搜索组件"` `allowClear` `size="small"` `style={{ margin:12 }}`
- 分类:`Collapse` `ghost` `accordion={false}`(允许多个展开),默认「容器」展开
- 组件项网格:`Row gutter={[8,8]}` 每项 `Col span={8}`(每行 3 个)

### 3.2 组件项 `<ComponentItem>`(拖拽源)

```
┌────────┐
│   ▤    │  ← 图标 28px #1677ff
│  页面  │  ← 名称 Text fontSize:12
└────────┘
```

**规格**:
- 卡片:`div` `width:100%` `height:64` `border:1px solid #eef0f4` `borderRadius:8` `background:#fff`
  - hover:`border-color:#1677ff` `background:#e6f4ff` `cursor:grab`
  - 拖拽中:`opacity:0.5`
- 内容:垂直居中,图标(`Icon` 28px `#1677ff`)+ 名称(`Text fontSize:12` `marginTop:4`)
- 拖拽源:`dnd-kit` `useDraggable`,携带 `data: { source:'panel', componentType }`
- 鼠标按下即开始拖拽,松手到画布触发新增

**搜索过滤**:`Input.Search` 按 `label` 过滤所有分类下的组件,匹配时展开所在分类、高亮匹配项。

### 3.3 组件分类与图标映射

驱动 `COMPONENT_META` 常量表(单一数据源,对标 `FIELD_TYPE_META`),同时承载显示名、图标、分类、可否作为容器。所有图标来自 `@ant-design/icons`(已验证全部可用)。

**分类折叠面板 `COMPONENT_GROUPS`**:

| 分组 | 折叠默认 | 组件(ComponentType → 显示名) |
|---|---|---|
| 容器 | 展开 | 页面 `Page`、分区 `Section`、标签页 `Tabs`、栅格 `Grid` |
| 数据 | 展开 | 数据表格 `DataTable`、详情卡片 `DetailCard`、列表 `List` |
| 表单 | 折叠 | 表单 `Form`、单行文本 `TextInput`、多行文本 `TextArea`、数字 `NumberInput`、下拉 `Select`、多选下拉 `MultiSelect`、日期 `DatePicker`、单选 `Radio`、复选框 `Checkbox`、开关 `Switch`、关联选择器 `LookupPicker`、子表表格 `SubFormTable`、附件 `AttachmentUpload`、人员 `UserPicker` |
| 展示 | 折叠 | 按钮 `Button`、统计数字 `Statistic`、图表 `Chart`、富文本展示 `RichTextDisplay`、分割线 `Divider`、文本 `Text` |

> `GridColumn`(栅格列)不单独出现在面板(作为 `Grid` 的子项自动管理),MVP 不暴露。

**组件图标映射(全部已验证可用)**:

| ComponentType | 显示名 | 图标 | 是否容器 |
|---|---|---|---|
| `page` | 页面 | `LayoutOutlined` | 是 |
| `section` | 分区 | `BlockOutlined` | 是 |
| `tabs` | 标签页 | `AppstoreOutlined` | 是 |
| `grid` | 栅格 | `TableOutlined` | 是 |
| `grid_column` | 栅格列 | `ColumnHeightOutlined` | 是 |
| `data_table` | 数据表格 | `TableOutlined` | 否 |
| `detail_card` | 详情卡片 | `ProfileOutlined` | 否 |
| `list` | 列表 | `UnorderedListOutlined` | 否 |
| `form` | 表单 | `FormOutlined` | 是 |
| `text_input` | 单行文本 | `FontSizeOutlined` | 否 |
| `textarea` | 多行文本 | `AlignLeftOutlined` | 否 |
| `number_input` | 数字 | `NumberOutlined` | 否 |
| `select` | 下拉选择 | `CaretDownOutlined`* | 否 |
| `multi_select` | 多选下拉 | `CaretDownOutlined`* | 否 |
| `date_picker` | 日期 | `CalendarOutlined` | 否 |
| `radio` | 单选 | `RadioOutlined` | 否 |
| `checkbox` | 复选框 | `CheckSquareOutlined` | 否 |
| `switch` | 开关 | `ToggleOutlined` | 否 |
| `lookup_picker` | 关联选择器 | `LinkOutlined` | 否 |
| `sub_form_table` | 子表表格 | `TableOutlined` | 否 |
| `attachment_upload` | 附件上传 | `UploadOutlined` | 否 |
| `user_picker` | 人员选择 | `UserOutlined` | 否 |
| `button` | 按钮 | `ThunderboltOutlined` | 否 |
| `statistic` | 统计数字 | `NumberOutlined` | 否 |
| `chart` | 图表 | `BarChartOutlined` | 否 |
| `rich_text_display` | 富文本展示 | `FileMarkdownOutlined` | 否 |
| `divider` | 分割线 | `DividerOutlined` | 否 |
| `text` | 文本 | `FontColorsOutlined` | 否 |

> *`select`/`multi_select` 图标:若 `CaretDownOutlined` 不存在可用 `DownOutlined`。建议统一用 `CaretDownOutlined`(已验证存在)。`button` 也可用 `AppstoreOutlined`,这里选 `ThunderboltOutlined` 区分按钮语义。

**`COMPONENT_META` 数据结构建议**(对标 `FIELD_TYPE_META`):

```ts
export interface ComponentMeta {
  label: string;          // 中文显示名
  icon: IconType;         // @ant-design/icons
  group: 'container' | 'data' | 'form' | 'display';
  isContainer: boolean;   // 是否可容纳子组件
  defaultProps: Record<string, unknown>;  // 拖入时的初始 props
}
export const COMPONENT_META: Record<ComponentType, ComponentMeta> = { ... };
```

---

## 4. 画布交互设计(中栏)

### 4.1 画布容器 `<Canvas>`

```
┌─ 画布 (flex:1, bg:#f5f7fa, overflow:auto) ──────────────────────────────────┐
│                                            ┌─ 缩放工具(右上浮动) ─┐         │
│                                            │ −  [100%]  +  ⊡ 网格  │         │
│  ┌─ 页面画布(居中, width:1200px@100%, bg:#fff,  └───────────────────┘         │
│  │  border:1px solid #eef0f4, borderRadius:8,       boxShadow)              │
│  │                                                                            │
│  │   [拖拽放置区 / 组件树渲染]                                                │
│  │                                                                            │
│  └────────────────────────────────────────────────────────────────────────────┘
```

**规格**:
- 外区:`div` `flex:1` `background:#f5f7fa` `overflow:auto` `position:relative` `padding:24`
- 画布本体:`div` `width:1200`(100%时,缩放时 `width:1200 * scale` 不可,用 transform)`min-height:800` `background:#fff` `border:1px solid #eef0f4` `borderRadius:8` `box-shadow:0 1px 3px rgba(0,0,0,0.04)` `margin:0 auto`(水平居中)
- 缩放:画布 `transform: scale(${zoom})` `transform-origin: top center`,外区滚动条随之变化
- 网格背景(可选):`background-image: linear-gradient(...)` 点阵网格,`⊕ 网格` 按钮切换

### 4.2 缩放工具 `<CanvasZoom>`

```
┌─ 缩放工具(absolute, top:16, right:16, bg:#fff, border, radius:8, shadow) ─┐
│  −    100%    +    ⊡ 网格                                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

| 控件 | 实现 | 规格 |
|---|---|---|
| 缩小 | `Button type="text" icon={<ZoomOutOutlined/>}` | `zoom = max(0.5, zoom - 0.1)` |
| 缩放值 | `Segmented` 或 `Select` | 选项 `50% / 75% / 100% / 125% / 150%`,显示当前值;`100%` 默认 |
| 放大 | `Button type="text" icon={<ZoomInOutlined/>}` | `zoom = min(1.5, zoom + 0.1)` |
| 网格 | `Button type="text" icon={<BorderOutlined/>}` | 切换 `showGrid` state |

> 缩放仅影响搭建视图,不改变 Schema。鼠标滚轮 + `Ctrl/Cmd` 也可缩放(可选,Phase 2 后期)。

### 4.3 空状态(无组件)

画布无组件时显示拖放区:

```
┌─ 页面画布 ──────────────────────────────────────────┐
│                                                      │
│                                                      │
│                    ┌──────────────────┐              │
│                    │     ⊞            │              │
│                    │  拖拽组件到这里    │              │
│                    │  或从左侧选择      │              │
│                    └──────────────────┘              │  ← 虚线框, hover/dragover 变蓝
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- 拖放区:`div` `border:2px dashed #d9d9d9` `borderRadius:8` `padding:48` 居中
- 文案:`Icon`(64px `#bfbfbf`)+ `Text type="secondary"`「拖拽组件到这里」+「或从左侧选择组件开始搭建」
- `dragover` 时:`border-color:#1677ff` `background:#e6f4ff`

### 4.4 组件树渲染 `<ComponentNodeRenderer>`(递归)

画布递归渲染 `ComponentNode` 树。每个节点是一个**可选中 + 可拖拽 + 可放置**的包裹层,内部才是实际组件预览。

**节点包裹层(选中 + 悬停 + 放置)**:

```
┌─ 选中态(蓝色边框) ────────────────────────────┐
│  [组件名] [📋复制] [🗑删除]    ← 悬停浮出工具条  │
│ ┌──────────────────────────────────────────────┐ │
│ │  (实际组件预览,如一个 Table / Form)          │ │
│ │                                              │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**规格**:
- 包裹层:`div` `position:relative` `border:2px solid transparent` `borderRadius:6` `margin:8px 0`
  - 默认:`border:2px solid transparent`
  - 悬停(`hover`):`border-color:#91caff`(主色浅边)
  - 选中(`selected`):`border-color:#1677ff` `box-shadow:0 0 0 2px rgba(22,119,255,0.1)`
- 悬停工具条:`div` `position:absolute top:-28 left:-2` `background:#1677ff` `color:#fff` `borderRadius:6 6 0 0` `padding:2px 8` `fontSize:12`,含:
  - 组件名(`Text` `color:#fff` `fontSize:12`)
  - 复制 `Button type="text" size="small" icon={<CopyOutlined/>}`(`color:#fff`)
  - 删除 `Button type="text" size="small" danger icon={<DeleteOutlined/>}`(`Popconfirm` 确认)
- 选中态边框优先级高于悬停态

**点击交互**:点击节点任意区域 → `setSelectedId(node.id)`(Store)→ 属性面板加载该节点。点击空白处取消选中。`stopPropagation` 防止子节点点击冒泡误选父节点。

**实际组件预览**:节点内部渲染组件的「搭建态预览」(非完整运行时渲染,而是简化占位 + 关键 props)。MVP 可用占位块:`div` `background:#fafbfc` `border:1px dashed #eef0f4` `padding:16` `min-height:40` 显示 `组件名 + type + 关键 props 摘要`。完整运行时预览在 Phase 2 后期接入渲染器。

### 4.5 拖拽放置指示器(蓝色线条)

拖拽组件时,在目标位置显示蓝色水平线,指示插入位置(前/后)或嵌套。

**实现**(`dnd-kit`):
- 画布与每个容器节点都注册 `useDroppable`,`data: { source:'canvas'|'node', nodeId, isContainer }`
- `onDragOver` 计算指针相对 droppable 的位置:上 1/3 → 插入前,中 1/3 → 嵌入(仅容器),下 1/3 → 插入后
- 渲染指示线:`DragOverlay` 之外,在每个 droppable 边缘画 `div` `height:2` `background:#1677ff` `box-shadow:0 0 4px rgba(22,119,255,0.5)`

```
拖拽「分区」到「表格」下方:
┌─ 页面 ─────────────────────────────────┐
│  ┌─ 搜索栏 ─────────────────────────┐  │
│  └──────────────────────────────────┘  │
│  ━━━━━━━━━━━━━━━━━━━━━━━ ← 蓝色放置线  │  (插入「表格」之后)
│  ┌─ 数据表格 ───────────────────────┐  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

- 指示线颜色:`#1677ff`,高 `2px`,宽度跟随 droppable 宽度
- 嵌套提示:指针在容器中部时,容器整体显示 `background:#e6f4ff` `border-color:#1677ff`(提示将嵌入)

### 4.6 拖拽移动(改变顺序 / 嵌套)

- 画布内节点用 `useSortable`(而非 `useDraggable`),支持重排
- 拖拽手柄:节点悬停时左上角显示 `HolderOutlined`(可选;也支持整体拖拽)
- 拖拽规则:
  - 非容器组件(`isContainer=false`)不可作为放置目标嵌入子节点
  - `Page` 根节点不可拖动、不可删除
  - 防止组件嵌入自身或后代(循环检测)

### 4.7 撤销 / 重做

- 编辑历史基于 `PageSchema` 快照(每次 mutation 前 push 到 `past[]`,清空 `future[]`)
- 撤销:`past.pop()` → 应用 → push 到 `future[]`
- 重做:反向
- 工具栏按钮根据栈空禁用
- 推荐用 `zundo`(Zustand temporal 中间件)或手写;深拷贝 Schema 用 `structuredClone`

---

## 5. 属性面板设计(右栏)

### 5.1 面板容器 `<PropertyPanel>`

```
┌─ 属性面板 (360px, bg:#fff) ──────────────────┐
│ ┌──────────────────────────────────────────┐ │
│ │ 📊 数据表格              data_table       │ │  ← 选中组件头(图标+名称+type)
│ │ data_table_1                              │ │     ID(secondary, 等宽)
│ ├──────────────────────────────────────────┤ │
│ │ [基础属性] [样式] [数据绑定] [事件]        │ │  ← Tabs
│ ├──────────────────────────────────────────┤ │
│ │                                          │ │
│ │  (当前 Tab 的属性表单)                    │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**规格**:
- 容器:`div` `width:360` `height:100%` `background:#fff` `border-left:1px solid #eef0f4` `overflow-y:auto`
- 选中头:`div` `padding:12px 16px` `border-bottom:1px solid #eef0f4`
  - 图标 + 名称(`Text strong fontSize:14`)
  - ID(`Text secondary fontSize:12` `fontFamily:monospace`)
- 未选中时:显示 `Empty`(图标块 `#e6f4ff` + `LayoutOutlined` 64px `#1677ff`)+ 文案「选中一个组件以编辑属性」
- Tabs:`Tabs` `tabPosition="top"` `size="small"` `items=[基础属性,样式,数据绑定,事件]`,默认「基础属性」

### 5.2 基础属性 Tab `<BasicPropsTab>`

| 属性项 | 字段 | 控件 | 校验 |
|---|---|---|---|
| 组件 ID | `node.id` | 只读展示(`Text code`) | — (系统生成,不可改) |
| 组件名称 | `node.name` | `Input` | 选填,长度 1-40 |
| 可见性 | `node.hidden` | `Switch`(显示「显示/隐藏」) + 绑定按钮 | `true`=隐藏;支持绑定表达式(见 5.4) |
| 自定义 class | `props.className` | `Input` | 选填,空格分隔多个 class |

```
┌─ 基础属性 ─────────────────────────────────┐
│ 组件 ID                                    │
│ data_table_1                               │  ← 只读等宽
│                                            │
│ 组件名称 *                                  │
│ [客户数据表格__________]                    │
│                                            │
│ 可见性                          [显示 ▾]    │  ← Switch, 旁置 🔗 绑定按钮
│                                            │
│ 自定义 class                                │
│ [highlight-table____________]              │
└────────────────────────────────────────────┘
```

> 布局:`Form layout="vertical"`,表单项间距沿用 AntD 默认(`marginBottom:24`)。可用 `size="small"` 提升信息密度。

### 5.3 样式 Tab `<StylePropsTab>`

用 `Row`/`Col` 栅格组织,控件为 `InputNumber` + `ColorPicker`。所有样式值写入 `props.style`(对象)。

```
┌─ 样式 ─────────────────────────────────────┐
│ 尺寸                                       │
│  宽度 [___]px    高度 [___]px               │  ← InputNumber, 空表示自适应
│                                            │
│ 间距                                       │
│  外边距(margin)                            │
│   上[12] 右[12] 下[12] 左[12]               │  ← 4 个 InputNumber 一行
│  内边距(padding)                           │
│   上[16] 右[16] 下[16] 左[16]               │
│                                            │
│ 边框                                       │
│  样式 [实线▾]  宽度[1]px  颜色 [■ #eef0f4]   │  ← Select + InputNumber + ColorPicker
│  圆角 [8]px                                 │
│                                            │
│ 背景                                       │
│  颜色 [■ #ffffff]                           │  ← ColorPicker showText
└────────────────────────────────────────────┘
```

**规格**:
- 分区标题:`Divider orientation="left" plain`「尺寸」「间距」「边框」「背景」
- 尺寸:`Row gutter={12}`,两个 `Col span={12}`,各一个 `InputNumber addonAfter="px"`
- 间距 margin/padding:`Row`,4 个 `Col span={6}`,各一个 `InputNumber`(上/右/下/左);可加「锁定」图标同步四值(可选)
- 边框:
  - 样式 `Select`(无/实线/虚线/点线 → `none/solid/dashed/dotted`)
  - 宽度 `InputNumber addonAfter="px" min={0}`
  - 颜色 `ColorPicker showText`
- 圆角 `InputNumber addonAfter="px" min={0}`
- 背景颜色 `ColorPicker showText`
- 所有值写入 `node.props.style = { width, height, margin, padding, border, borderRadius, background }`(运行时渲染器读取)

> 数值绑定:样式值通常为常量,不绑定。如需绑定,在「数据绑定」Tab 单独配置(见 5.4)。

### 5.4 数据绑定 Tab `<DataBindingTab>`

属性值可为**常量**或**绑定表达式**(`{ __bind: 'vm.xxx' }`)。本 Tab 列出当前组件所有「可绑定属性」,每项一个「常量/绑定」切换器。

```
┌─ 数据绑定 ─────────────────────────────────┐
│ 属性值 = [常量 ▾ / 绑定 ▾]                  │  ← Segmented 切换模式
│                                            │
│ ▸ 数据源 (dataSource)        [绑定] 🔗      │  ← 常量态:显示输入控件
│   vm.recordList                             │     绑定态:显示绑定路径 + 选择器
│                                            │
│ ▸ 标题 (title)               [常量] 🔗      │
│   [客户列表______]                          │
│                                            │
│ ▸ 可见 (visible)             [绑定] 🔗      │
│   vm.showTable         [树形选择 ViewModel] │
└────────────────────────────────────────────┘
```

**规格**:
- 每个可绑定属性一行:`Row`(`align="middle"`)
  - 左:属性名 + key(`Text` + `Text code secondary`)
  - 中:`Segmented options=['常量','绑定']`
  - 右:值控件
    - 常量态:按属性类型渲染(文本 `Input`、数字 `InputNumber`、布尔 `Switch`、选项 `Select`)
    - 绑定态:`Input` 显示路径(如 `vm.recordList`)+ 旁置「🔗 选择」按钮 → 弹出**绑定选择器**(见 5.4.1)
- 切换到绑定时,值从字面量转为 `{ __bind: 'vm.xxx' }`;切回常量时清空绑定

**属性值类型(对齐 `PropValue`)**:
- 字面量:`string` / `number` / `boolean` / `null` / `PropValue[]` / 对象
- 绑定表达式:`{ __bind: string }`(如 `{ __bind: 'vm.record.name' }`)
- 内联表达式:`{ __expr: string }`(高级,Phase 2 后期)
- 事件动作:`{ __action: ActionConfig }`(在「事件」Tab 配置,见 5.5)

#### 5.4.1 绑定选择器 `<BindingPicker>`(Modal / 树形选择)

```
┌─ 选择绑定路径 ──────────────────────────────┐
│                                            │
│  ▾ vm (ViewModel)                          │
│    ▾ 📋 recordList (record_list)           │  ← 树形,显示变量名 + 类型
│        ├ name (string)                     │
│        ├ status (string)                   │
│        └ created_at (date_time)            │
│    ▾ 📄 record (record)                    │
│    ▾ 🔢 selectedId (scalar)                │
│    ▾ 🔢 keyword (scalar)                   │
│                                            │
│  已选: vm.recordList                       │  ← 底部显示当前路径
│                          [取消]  [确定]    │
└────────────────────────────────────────────┘
```

- 形态:`Modal` `title="选择绑定路径"` `width={480}` `footer=[取消, 确定]`
- 树:`Tree`,数据源 = 当前 `PageSchema.viewModel.variables`(递归展开对象/记录字段)
  - 节点:图标(按 `VariableType`)+ 变量名 + 类型 `Tag`
  - 点击叶子节点 → 设定绑定路径 `vm.{path}`
- 候选也可包含对象字段:`record` 类型变量展开其关联对象的字段(需 `objectsApi.get(objectId)` 拉取字段)
- 简化方案:用 `TreeSelect`(单选),`treeData` 同上,`showSearch`

**变量类型图标**:

| VariableType | 图标 | 说明 |
|---|---|---|
| `record` | `ProfileOutlined` | 单条记录 |
| `record_list` | `UnorderedListOutlined` | 记录列表 |
| `scalar` | `NumberOutlined` | 标量(string/number/boolean) |
| `object` | `BlockOutlined` | 结构化对象 |
| `array` | `AppstoreOutlined` | 数组 |

### 5.5 事件 Tab `<EventsTab>`

列出当前组件支持的事件,每个事件可配置一个动作(`ActionConfig`)。

```
┌─ 事件 ─────────────────────────────────────┐
│ 事件列表                                   │
│                                            │
│ ▸ onClick (点击)        [+ 配置动作]       │  ← 未配置
│   动作类型: [查询记录 ▾]                   │  ← 已配置,展开
│   参数:                                    │
│     目标变量 [vm.recordList ▾] 🔗          │
│     对象    [客户 ▾]                       │
│     视图    [全部客户 ▾]                   │
│                          [移除动作]        │
│                                            │
│ ▸ onChange (值变更)     [+ 配置动作]       │
│                                            │
└────────────────────────────────────────────┘
```

**规格**:
- 事件列表:按组件类型预定义支持的事件(见下表),`Collapse` 或 `List`
- 每个事件:标题 + 「+ 配置动作」按钮(未配置)/ 展开动作配置(已配置)
- 动作配置:
  - 动作类型 `Select`(候选 = `ActionType` 枚举,见下表)
  - 参数:按动作类型动态渲染(用 `Form.List` 或条件渲染)
  - 「移除动作」`Button type="text" danger`

**事件按组件类型**(MVP 预定义):

| 组件 | 支持事件 |
|---|---|
| `button` | `onClick` |
| `form` | `onSubmit`, `onReset` |
| `text_input`/`textarea`/`number_input`/`select`/`multi_select`/`date_picker`/`switch` | `onChange` |
| `data_table` | `onRowClick`, `onRowDoubleClick` |
| `page` | `onLoad` |

**动作类型与参数(对齐 `ActionType` 枚举)**:

| ActionType | 显示名 | 参数(params) |
|---|---|---|
| `query_records` | 查询记录 | `targetVariable`(写入哪个 VM 变量)、`objectId`、`viewId?`、`filter?` |
| `create_record` | 新增记录 | `objectId`、`data`(可绑定) |
| `update_record` | 更新记录 | `recordId`(可绑定)、`data`(可绑定) |
| `delete_record` | 删除记录 | `recordId`(可绑定) |
| `navigate` | 页面跳转 | `pageId` / `url`、`params?` |
| `open_modal` | 打开弹窗 | `modalId` / `componentId` |
| `close_modal` | 关闭弹窗 | `modalId?` |
| `confirm` | 弹出确认框 | `title`、`content`、`onConfirm`(嵌套动作,可选) |
| `toast` | 弹出提示 | `message`、`type`(success/info/warning/error) |
| `call_api` | 调用 API | `apiId` / `url`、`method`、`params?` |
| `trigger_process` | 触发流程 | `processId`、`inputs?` |
| `set_variable` | 设置变量 | `variable`(VM 路径)、`value`(可绑定) |

> 动作参数中的「可绑定」字段同样支持常量/绑定切换(复用 5.4 的绑定选择器)。`confirm` 的 `onConfirm` 支持嵌套一个动作(动作链),MVP 可先做单层。

**事件→动作数据结构**:
```ts
// 写入 ComponentNode.props[eventName] = { __action: ActionConfig }
button.props.onClick = {
  __action: {
    type: ActionType.QueryRecords,
    params: {
      targetVariable: { __bind: 'vm.recordList' },
      objectId: 'obj_xxx',
    },
  },
};
```

---

## 6. 页面类型模板

新建页面时(或在工具栏「类型」切换),按页面类型生成初始组件树模板。模板基于关联对象的字段自动生成组件。

### 6.1 列表页模板 `ListPage`

```
┌─ 页面(page) ───────────────────────────────────────────────┐
│ ┌─ 分区(section:搜索栏) ────────────────────────────────┐ │
│ │  关键字 [Input____________]  状态 [Select▾]  [搜索 Btn] │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌─ 分区(section:数据区) ─────────────────────────────────┐ │
│ │  ┌─ 数据表格(data_table) ───────────────────────────┐ │ │
│ │  │ ☐ │ 客户名称  │ 联系电话  │ 等级   │ 创建时间   │ │ │ │
│ │  │ ☐ │ 张三公司  │ 138...    │ 高     │ 2026-01-01 │ │ │ │
│ │  │ ☐ │ 李四公司  │ 139...    │ 中     │ 2026-01-02 │ │ │ │
│ │  └────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌─ 分区(section:分页) ───────────────────────────────────┐ │
│ │                          ‹ 1 2 3 ... ›  每页 20 条       │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**生成规则**:
- 根:`Page`
- 子1:`Section`(搜索栏),内含若干 `TextInput`/`Select`(取对象可搜索字段)+ `Button`(搜索,`onClick` → `QueryRecords`)
- 子2:`Section`(数据区),内含 `DataTable`,列 = 对象字段(默认前 6 个可见字段),`dataSource` 绑定 `vm.recordList`
- 子3:`Section`(分页),占位(MVP 可由 DataTable 内置分页)
- ViewModel:`recordList`(record_list,数据源=该对象,`autoQuery:true`)+ `keyword`(scalar)+ `selectedId`(scalar)

### 6.2 详情页模板 `DetailPage`

```
┌─ 页面(page) ───────────────────────────────────────────────┐
│ ┌─ 分区(section) ────────────────────────────────────────┐ │
│ │  ┌─ 详情卡片(detail_card) ───────────────────────────┐ │ │
│ │  │  客户名称:    张三公司                             │ │ │
│ │  │  联系电话:    13800138000                          │ │ │
│ │  │  等级:        高                                   │ │ │
│ │  │  创建时间:    2026-01-01 10:00                     │ │ │
│ │  │  ...                                               │ │ │
│ │  └────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**生成规则**:
- 根:`Page`
- 子:`Section` → `DetailCard`
- `DetailCard` 字段自动布局:遍历对象所有字段,生成「字段名:值」行,值绑定 `vm.record.{apiName}`
- ViewModel:`record`(record,数据源=该对象,`autoQuery:false`,由 URL 参数 `:recordId` 触发查询)

### 6.3 表单页模板 `FormPage`

```
┌─ 页面(page) ───────────────────────────────────────────────┐
│ ┌─ 分区(section) ────────────────────────────────────────┐ │
│ │  ┌─ 表单(form) ──────────────────────────────────────┐ │ │
│ │  │  客户名称 *      [______________________]          │ │ │
│ │  │  联系电话        [______________________]          │ │ │
│ │  │  等级            [高 ▾]                            │ │ │
│ │  │  下单时间        [2026-01-01 📅]                   │ │ │
│ │  │  备注            [                              ]  │ │ │
│ │  │                  [多行文本]                       │ │ │
│ │  │                                                   │ │ │
│ │  │                          [取消]  [提交]           │ │ │
│ │  └────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**生成规则**:
- 根:`Page`
- 子:`Section` → `Form`
- `Form` 字段自动生成:遍历对象字段(排除系统字段 `id`/`created_at` 等),按字段类型生成表单项:
  - 文本 → `TextInput`;多行文本/富文本 → `TextArea`;数字/金额/百分比 → `NumberInput`;单选 → `Select`;多选 → `MultiSelect`;日期/日期时间 → `DatePicker`;复选框 → `Checkbox`;人员 → `UserPicker`;关联 → `LookupPicker`;附件 → `AttachmentUpload`
  - 必填字段标 `*`,对应 `Form.Item rules=[{required:true}]`
- 表单项 `value` 绑定 `vm.record.{apiName}`
- 提交按钮 `onClick` → `CreateRecord` 或 `UpdateRecord`(按新增/编辑模式)
- ViewModel:`record`(record,编辑模式时数据源=该对象,`autoQuery:false`)

**字段类型 → 表单组件映射**(对齐对象字段类型,见 `FIELD_TYPE_META`):

| 字段类型 | 表单组件(ComponentType) |
|---|---|
| `text` | `text_input` |
| `long_text` / `rich_text` | `textarea` |
| `number` / `currency` / `percent` / `auto_number` | `number_input` |
| `single_select` | `select` |
| `multi_select` | `multi_select` |
| `checkbox` | `checkbox` |
| `date` / `date_time` | `date_picker` |
| `attachment` | `attachment_upload` |
| `user` | `user_picker` |
| `lookup` | `lookup_picker` |
| `sub_form` | `sub_form_table` |
| `formula` / `rollup` | (只读,表单中用 `text` 展示) |

### 6.4 模板生成入口

- 新建页面弹窗(`Modal`):填名称 + slug + 选类型 + 选对象 → 点确定后,按类型调 `generateTemplate(pageType, objectId)` 生成初始 `PageSchema`
- 工具栏「类型」切换:切换页面类型时 `Popconfirm`「切换类型将重置画布,是否继续?」→ 重新生成模板(或保留组件树,仅改 `pageType`,由用户手动调整)

---

## 7. 视图模型面板

视图模型(`ViewModel`)是页面级状态树。MVP 以**抽屉**形式提供编辑入口(从工具栏「视图模型」按钮或左栏底部入口打开),避免占用三栏空间。

### 7.1 面板形态 `<ViewModelPanel>`(Drawer)

```
┌─ 视图模型 (Drawer, right, width:400) ──────────────────────┐
│ 变量树                            [+ 添加变量]             │
│                                                            │
│ ▾ 📋 recordList    record_list    [✎] [✕]                  │  ← 变量行(可折叠展开字段)
│    数据源: 客户 / 全部客户视图  自动查询:✓                │
│    初始值: —                                               │
│                                                            │
│ ▾ 📄 record         record         [✎] [✕]                 │
│    数据源: 客户  自动查询:✗(由参数触发)                    │
│    初始值: —                                               │
│                                                            │
│ ▸ 🔢 selectedId     scalar        [✎] [✕]                  │
│ ▸ 🔢 keyword        scalar        [✎] [✕]                  │
│ ▸ 🔢 loading        scalar(bool)  [✎] [✕]                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**规格**:
- 形态:`Drawer` `placement="right"` `width={400}` `title="视图模型"`,`extra=[+ 添加变量]`
- 变量树:`Collapse` `ghost`,每项一个 `Panel`
  - 头:图标(按 `VariableType`)+ 变量名(`Text strong`)+ 类型 `Tag` + 编辑/删除按钮
  - 体:变量详情表单(见 7.2)
- 添加变量:`Form` 弹层或行内,填名称 + 类型

### 7.2 变量编辑 `<VariableEditor>`

每个变量(`VariableDef`)的编辑表单:

| 属性 | 字段 | 控件 | 说明 |
|---|---|---|---|
| 变量名 | key(`variables` 的 key) | `Input code` | `required`,正则 `^[a-zA-Z][a-zA-Z0-9_]*$`,页面内唯一 |
| 类型 | `type` | `Select` | 候选 = `VariableType`(record/record_list/scalar/object/array) |
| 初始值 | `initialValue` | 动态控件 | scalar→`Input`/`InputNumber`/`Switch`;object/array→`Input.TextArea`(JSON);record/record_list→禁用(由数据源决定) |
| 数据源 | `datasource` | 分区(仅 record/record_list) | 见下 |
| 描述 | `description` | `Input.TextArea rows={1}` | 选填 |

**数据源配置(`DatasourceConfig`,仅 record/record_list 类型)**:

```
┌─ 数据源 ───────────────────────────────────┐
│ 关联对象 *  [客户 ▾]                        │  ← Select(候选=objectsApi.list)
│ 视图        [全部客户 ▾]                    │  ← Select(候选=该对象视图)
│ 页面加载时自动查询  [✓]                     │  ← Switch(autoQuery)
└────────────────────────────────────────────┘
```

- 关联对象 `datasource.objectId`:`Select showSearch`,候选 = `objectsApi.list(appId)`
- 视图 `datasource.viewId`:`Select`(候选 = `objectsApi.listViews(objectId)`),选填
- 自动查询 `datasource.autoQuery`:`Switch`,`record_list` 默认 `true`,`record` 默认 `false`

### 7.3 变量增删

- 添加:点「+ 添加变量」→ 行内新增一行(默认 `scalar` 类型,空名)→ 填名保存
- 删除:`Popconfirm`「删除变量将解除所有引用它的绑定,是否继续?」→ 删除 `variables[key]`
- 引用检测:删除前扫描组件树,若仍有 `__bind: 'vm.{key}...'` 引用,提示引用位置

---

## 8. 视觉规格

### 8.1 配色方案(对齐 Studio `#1677ff` 主色)

| 语义 | 色值 | 用途 |
|---|---|---|
| 主色 Primary | `#1677ff` | 选中边框、放置指示线、主按钮、链接、图标默认 |
| 主色浅 | `#e6f4ff` | 选中行背景、图标块背景、容器嵌套提示背景(AntD `colorPrimaryBg`) |
| 主色边(浅) | `#91caff` | 悬停边框(AntD `colorPrimaryBorder`) |
| 成功 Success | `#52c41a` | 成功 message、已发布标记、预览图标 |
| 警告 Warning | `#fa8c16` | 草稿标记 |
| 危险 Error | `#ff4d4f` | 删除按钮、必填星号、错误提示 |
| 页面背景 | `#f5f7fa` | Content 区、画布外区 |
| 容器背景 | `#ffffff` | 三栏、画布本体 |
| 次级背景 | `#fafbfc` | 组件预览占位、悬停、工具栏吸顶 |
| 边框(强) | `#eef0f4` | 三栏分隔、卡片边框 |
| 边框(弱) | `#f0f2f5` | 表格内分隔、占位虚线 |
| 占位虚线 | `#d9d9d9` | 空状态拖放区边框(AntD `colorBorder`) |
| 文字主 | `rgba(0,0,0,0.88)` | 标题、主要文本(AntD `colorText`) |
| 文字次 | `rgba(0,0,0,0.45)` | 辅助说明、ID、类型(AntD `colorTextSecondary`) |

> 推荐用 `theme.useToken()` 取 AntD token,而非硬编码。Tailwind 仅用于布局工具类(`flex`/`gap`/`p-*`),颜色一律走 AntD token 或上述常量。

### 8.2 间距 / 圆角 / 阴影规范

**间距(Spacing,8px 栅格)**:
- 工具栏内边距:`12px 16px`
- 左栏搜索:`margin:12`
- 组件项间距:`Row gutter={[8,8]}`
- 画布外区 padding:`24px`
- 画布本体:组件节点 `margin:8px 0`,节点内 padding 按组件定
- 属性面板表单:`padding:16px`,表单项间距 AntD 默认
- 图标与文字:`8px`

**圆角(Border Radius)**:
- 三栏容器:无(撑满高度,边框分隔)
- 画布本体:`8px`
- 组件项卡片 / 组件预览占位:`8px`
- 工具栏按钮 / 输入框 / Tag:`6px`(AntD 默认)
- 图标块(空状态):`28px`
- 悬停工具条:`6px 6px 0 0`

**阴影(Box Shadow)**:
- 画布本体(静态):`0 1px 3px rgba(0,0,0,0.04)`
- 浮动缩放工具 / 悬停工具条:`0 2px 8px rgba(0,0,0,0.08)`
- 选中态:`0 0 0 2px rgba(22,119,255,0.1)`(主色外发光)
- 放置指示线:`0 0 4px rgba(22,119,255,0.5)`
- 拖拽中节点:`0 8px 24px rgba(0,0,0,0.12)`

**字号**:
- 工具栏页面名:`Title level={5}`(16px)
- 选中组件头:`Text strong` 14px
- 组件项名称 / 表格正文:14px
- 辅助文字 / ID / 类型 / 放置提示:12px

**AntD ConfigProvider token 建议**(可选,写入 `main.tsx`,与 `DESIGN-object` 一致):
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
      Tabs: { horizontalItemPadding: '8px 12px' },  // 紧凑属性面板 Tab
    },
  }}
>
```

---

## 9. Ant Design 组件映射

| 界面元素 | AntD 组件 | 关键 props |
|---|---|---|
| 三栏容器 | `div` flex(非 AntD 组件) | `display:flex;height:calc(100vh - 56px)` |
| 搭建器工具栏 | `div` + `Space` + `Divider` | 吸顶 `position:sticky top:0` |
| 页面名称(内联编辑) | `Typography.Title` `editable` | `editable={{ tooltip }}` |
| 页面类型 / 对象选择 | `Select` `showSearch` | `optionFilterProp="label"` |
| 撤销/重做 | `Button type="text" icon` | `disabled` 按历史栈 |
| 预览 | `Button` + `Drawer` | `width` 大,渲染运行时 |
| 发布 | `Switch` 或 `Button type="primary"` | `Popconfirm` 确认 |
| 组件搜索 | `Input.Search` | `allowClear size="small"` |
| 组件分类折叠 | `Collapse` | `ghost`,`items` |
| 组件项(拖拽源) | `div` + `dnd-kit useDraggable` + `Row/Col` | `Col span={8}` |
| 组件项卡片 | `Card` 或 `div` hoverable | hover 边框主色 |
| 画布外区 | `div` `overflow:auto` | `position:relative` |
| 画布缩放 | `Segmented` + `Button type="text"` | `transform:scale()` |
| 空状态拖放区 | `div` 虚线 + `Empty` | `border:2px dashed #d9d9d9` |
| 组件节点包裹 | `div` + `dnd-kit useSortable` | `position:relative` |
| 选中高亮 | CSS `border` + `box-shadow` | `border-color:#1677ff` |
| 悬停工具条 | `div` absolute + `Button type="text"` | `top:-28` |
| 放置指示器 | `div` + `DragOverlay` | `height:2;background:#1677ff` |
| 属性面板容器 | `div` + `Empty`(未选中) | `width:360;overflow-y:auto` |
| 选中组件头 | `Space` + `Typography` | 图标 + 名称 + ID |
| 属性 Tabs | `Tabs` | `size="small"`,4 个 item |
| 基础属性表单 | `Form layout="vertical"` | `size="small"` |
| 组件名称 | `Input` | `required` |
| 可见性 | `Switch` + 绑定按钮 | — |
| 自定义 class | `Input` | — |
| 样式分区 | `Divider orientation="left"` | 「尺寸/间距/边框/背景」 |
| 宽高/间距 | `Row`/`Col` + `InputNumber` | `addonAfter="px"` |
| 边框样式 | `Select` | none/solid/dashed/dotted |
| 颜色 | `ColorPicker` | `showText` |
| 数据绑定行 | `Row` + `Segmented` + 动态控件 | options=['常量','绑定'] |
| 绑定选择器 | `Modal` + `Tree` 或 `TreeSelect` | 候选=ViewModel 变量 |
| 事件列表 | `Collapse` / `List` | 按组件类型预定义 |
| 动作类型 | `Select` | 候选=`ActionType` |
| 动作参数 | `Form` 动态渲染 | 按动作类型 |
| 移除动作 | `Button type="text" danger` | — |
| 视图模型面板 | `Drawer` + `Collapse` | `width:400 placement="right"` |
| 变量树 | `Collapse` `ghost` | 每变量一个 Panel |
| 变量编辑 | `Form layout="vertical"` | 名称/类型/初始值/数据源 |
| 数据源配置 | `Select` + `Switch` | 对象/视图/autoQuery |
| 全局反馈 | `message` | `success/error` |
| 危险确认 | `Popconfirm` | `okButtonProps={{ danger:true }}` |
| 空状态 | `Empty` | `description` + children |
| 加载态 | `Skeleton` | `active` |
| 路由参数 | `useParams` / `useNavigate` | `appId` `pageId` |
| 取数 | `useQuery` / `useMutation` | `@tanstack/react-query` |
| 全局状态(选中态/历史栈) | `zustand` | `selectedId`/`past`/`future`/`schema` |
| DnD 上下文 | `@dnd-kit/core` `DndContext` | `onDragStart/Over/End` |
| 拖拽源(面板) | `@dnd-kit/core` `useDraggable` | `data:{source:'panel'}` |
| 可放置(画布/容器) | `@dnd-kit/core` `useDroppable` | `data:{nodeId,isContainer}` |
| 可排序(树节点) | `@dnd-kit/sortable` `useSortable` | 重排/嵌套 |

### 9.1 新增依赖建议

| 依赖 | 用途 | 是否必须 |
|---|---|---|
| `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` | 拖拽添加 / 移动 / 嵌套 | **已安装** ✅ |
| `zundo`(可选) | Zustand 撤销/重做中间件 | 否(可手写历史栈) |

> 其余(表单/表格/弹窗/抽屉/TreeSelect/ColorPicker)均由已安装的 `antd@5.29` + `@ant-design/icons@5.6` 提供,无需额外依赖。

---

## 10. 文件结构建议(供开发 agent 参考)

```
packages/studio/src/
├── pages/
│   └── PageBuilder.tsx                # 三栏容器 + DndContext + 工具栏挂载(整体重写)
├── components/page-builder/
│   ├── BuilderToolbar.tsx             # 顶部工具栏(返回/名称/类型/对象/撤销重做/预览/发布)
│   ├── ComponentPanel.tsx             # 左栏:组件面板(搜索 + 分类折叠 + 组件项)
│   ├── ComponentItem.tsx              # 单个组件项(dnd-kit useDraggable 拖拽源)
│   ├── Canvas.tsx                     # 中栏:画布(缩放 + 拖放区 + 组件树渲染)
│   ├── CanvasZoom.tsx                 # 画布缩放工具(50%-150%)
│   ├── ComponentNodeRenderer.tsx      # 组件节点递归渲染(选中 + 悬停 + 放置)
│   ├── DropIndicator.tsx              # 拖拽放置指示器(蓝色线条)
│   ├── ComponentPreview.tsx           # 组件搭建态预览(占位/简化渲染)
│   ├── PropertyPanel.tsx              # 右栏:属性面板(选中头 + Tabs)
│   ├── tabs/
│   │   ├── BasicPropsTab.tsx          # 基础属性(ID/名称/可见性/class)
│   │   ├── StylePropsTab.tsx          # 样式(宽高/间距/边框/背景)
│   │   ├── DataBindingTab.tsx         # 数据绑定(常量/绑定切换)
│   │   └── EventsTab.tsx             # 事件(事件列表 + 动作配置)
│   ├── BindingPicker.tsx              # 绑定选择器(Modal,树形选 ViewModel 节点)
│   ├── ActionConfigurator.tsx         # 动作配置器(动作类型 + 参数)
│   ├── ViewModelPanel.tsx             # 视图模型抽屉(变量树)
│   ├── VariableEditor.tsx             # 变量编辑(名称/类型/初始值/数据源)
│   ├── PageTemplateModal.tsx          # 新建页面弹窗(选类型 + 选对象 → 生成模板)
│   └── templates/
│       └── generateTemplate.ts        # 页面类型模板生成(列表/详情/表单)
├── constants/
│   └── pageBuilder.ts                 # COMPONENT_META + COMPONENT_GROUPS + 事件/动作元数据
├── stores/
│   └── pageBuilder.ts                 # Zustand: schema/selectedId/zoom/past/future
├── api/
│   └── pages.ts                       # pagesApi(list/get/create/update/delete/publish)
└── (路由调整) router.tsx              # /app/:appId/pages 子路由(列表 + 编辑)
```

### 10.1 路由调整

`router.tsx` 中「页面」路由改为含子路由(MVP 可先只做编辑器):

```tsx
<Route path="pages" element={<PageList />}>
  <Route index element={<PageList />} />           {/* 页面列表(可选,MVP 可跳过) */}
  <Route path=":pageId" element={<PageBuilder />} /> {/* 搭建器编辑器 */}
</Route>
```

> MVP 可保持 `/app/:appId/pages` 直接进 `PageBuilder`(新建未保存的草稿页),保存后才有 `pageId`。

### 10.2 StudioLayout 适配(推荐)

为支持搭建器全屏三栏,建议给 `StudioLayout` 的 Content 区加 `fullBleed` 判断:当路由为 `pages` 子路由时,Content 不套白色卡片层,直接 `<Outlet/>` 撑满。

```tsx
// StudioLayout.tsx Content 区(示意)
const isFullBleed = location.pathname.includes('/pages');
<Content style={{ padding: isFullBleed ? 0 : 24, background: '#f5f7fa' }}>
  {isFullBleed ? <Outlet /> : <div className="white-card">{<Outlet />}</div>}
</Content>
```

### 10.3 类型声明(`api/pages.ts`)

Studio 不直接依赖 `@apaas/shared`,按 `objects.ts` 惯例以接口形式重新声明(对齐 `packages/shared/src/page/index.ts`):

```ts
// 对齐 shared ComponentType/PageType/ActionType/VariableType 枚举值
export type ComponentType = 'page' | 'section' | 'tabs' | 'grid' | ... ;
export type PageType = 'list_page' | 'detail_page' | 'form_page' | 'dashboard' | 'custom';
export type ActionType = 'query_records' | 'create_record' | ... ;
export type VariableType = 'record' | 'record_list' | 'scalar' | 'object' | 'array';

export interface ComponentNode { id; type; name?; props; children?; hidden?; }
export interface ViewModel { variables: Record<string, VariableDef>; }
export interface VariableDef { type; initialValue?; datasource?; description?; }
export interface PageSchema { version:'1'; pageType; viewModel; root; }
export interface PageMeta { id; appId; name; slug; type; objectId?; schema; published; ... }

export const pagesApi = {
  list, get, create, update, delete, publish
};
```

### 10.4 状态管理(`stores/pageBuilder.ts`)

```ts
interface PageBuilderState {
  schema: PageSchema | null;     // 当前页面 Schema
  selectedId: string | null;     // 选中组件 ID
  zoom: number;                  // 画布缩放 0.5-1.5
  past: PageSchema[];            // 撤销栈
  future: PageSchema[];          // 重做栈
  // actions
  setSchema, addComponent, moveComponent, updateNode, deleteNode, duplicateNode,
  setSelected, setZoom, undo, redo, ...
}
```

> 自动保存:`useEffect` 监听 `schema` 变化,防抖 1s 调 `pagesApi.update`(草稿)。变更前 push `past`(深拷贝)。

---

## 附:关键参考文件

- 类型契约(SSOT):[`packages/shared/src/page/index.ts`](../../packages/shared/src/page/index.ts) — `ComponentType` / `PageType` / `ComponentNode` / `PageSchema` / `ViewModel` / `VariableDef` / `ActionType` / `PropValue`
- 通用类型:[`packages/shared/src/common/index.ts`](../../packages/shared/src/common/index.ts) — `PageId` / `AppId` / `ObjectId` / `ApiResponse`
- 现有占位页:[`packages/studio/src/pages/PageBuilder.tsx`](../../packages/studio/src/pages/PageBuilder.tsx)(需整体重写)
- 布局:[`packages/studio/src/layouts/StudioLayout.tsx`](../../packages/studio/src/layouts/StudioLayout.tsx)(需适配 fullBleed)
- 路由:[`packages/studio/src/router.tsx`](../../packages/studio/src/router.tsx)
- 主题/入口:[`packages/studio/src/main.tsx`](../../packages/studio/src/main.tsx)
- API 封装范例:[`packages/studio/src/api/objects.ts`](../../packages/studio/src/api/objects.ts)(新建 `api/pages.ts` 对齐其风格)
- 常量范例:[`packages/studio/src/constants/fieldTypes.ts`](../../packages/studio/src/constants/fieldTypes.ts)(新建 `constants/pageBuilder.ts` 对齐其风格)
- 风格参照(卡片/弹窗/表单/选项管理器):[`packages/studio/src/components/object/FieldConfigDrawer.tsx`](../../packages/studio/src/components/object/FieldConfigDrawer.tsx)
- 对象设计器设计规范:[`docs/design/DESIGN-object.md`](./DESIGN-object.md)(视觉风格 / AntD 用法 / 文件结构惯例的基准)
- 飞书 aPaaS 调研:[`docs/research/RESEARCH-feishu-apaas-full.md`](../research/RESEARCH-feishu-apaas-full.md) — C 节「页面与 UI」为功能对标基准

---

## 附:实现优先级(Phase 2 MVP 范围)

| 优先级 | 范围 | 说明 |
|---|---|---|
| P0 | 三栏布局 + 工具栏 + 组件面板 + 画布拖拽添加/选中 | dnd-kit 拖拽面板→画布,点击选中 |
| P0 | 属性面板(基础属性 + 样式) | ID/名称/可见性/class + 宽高/间距/边框/背景 |
| P0 | 页面类型模板(列表/详情/表单)+ Schema 持久化 | 生成初始组件树,`pagesApi` CRUD |
| P1 | 数据绑定 Tab + 绑定选择器 | 常量/绑定切换,树形选 ViewModel 节点 |
| P1 | 事件 Tab + 动作配置 | 事件列表 → 动作类型 + 参数 |
| P1 | 视图模型面板 | 变量增删改 + 数据源配置 |
| P1 | 拖拽移动/嵌套 + 放置指示器 + 悬停工具条 | 画布内重排与嵌套 |
| P2 | 撤销/重做 + 自动保存 | 历史栈 + 防抖保存 |
| P2 | 画布缩放 + 网格背景 | 50%-150% |
| P2 | 实时预览(接入运行时渲染器) | Drawer 预览 |
| P3 | PC/移动端切换、自定义组件 | 后续迭代 |
