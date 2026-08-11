# 流程引擎 设计规范 (DESIGN-process)

> 模块: Phase 3 — 流程引擎
> 角色: UI/UE 设计规范,供前端开发 agent 直接实现
> 技术栈: React 18 + Ant Design 5 + TailwindCSS 3 + React Query + Zustand + React Router v6 + flowgram.ai(Fixed Layout)
> 对标: 飞书 aPaaS 流程编排(飞书式业务节点)
> 类型契约来源: [`packages/shared/src/process/index.ts`](../../packages/shared/src/process/index.ts)(SSOT,本规范所有节点类型 / Schema / 配置项均与其对齐)
> 现有组件: [`packages/studio/features/process/simplified/`](../../packages/studio/features/process/simplified/)(flowgram.ai fork,`SimplifiedProcessEditor` 已就绪,需基于此定制业务节点面板与配置)

---

## 0. 设计对齐说明

本规范与现有 Studio 骨架严格对齐,复用既有约定:

| 约定项 | 取值 | 来源 |
|---|---|---|
| 主色 | `#1677ff`(AntD 5 默认 token `colorPrimary`) | `main.tsx` |
| 页面背景 | `#f5f7fa` | `StudioLayout` |
| 容器背景 | `#fff`(`colorBgContainer`) | `theme.useToken()` |
| 次级背景 | `#fafbfc` | `AppDashboard` 统计卡 |
| 主色浅 | `#e6f4ff` | 选中态背景、节点选中描边(AntD `colorPrimaryBg`) |
| 分隔线 / 边框 | `#eef0f4`(强) / `#f0f2f5`(弱) | `StudioLayout` |
| 阴影 | 卡片 `0 1px 3px rgba(0,0,0,0.04)`,悬浮 `0 8px 24px rgba(0,0,0,0.04)`,吸顶栏 `0 1px 4px rgba(0,0,0,0.03)` | 现有页面 |
| 圆角 | 卡片 `12`,弹窗/抽屉 `16`,节点 `8`,小元素 `6` | 现有页面 |
| StudioLayout 结构 | `Sider width=220` + `Header height=56` + `Content padding=24` | `StudioLayout.tsx` |
| 路由 | `/app/:appId/processes` 渲染 `ProcessEditor`(现为占位页) | `router.tsx` |
| 侧边栏入口 | Studio 左侧导航「流程」项(`ApartmentOutlined`),`selectedKey = 'processes'` | `StudioLayout.tsx` |
| API 模式 | `client.get/post/put/delete`,响应 `{ ok, data }`,React Query 取数 | `api/objects.ts` |
| locale | `zhCN` | `main.tsx` |
| dnd-kit | `@dnd-kit/core@6` `@dnd-kit/sortable@10` `@dnd-kit/utilities@3` **已安装** | `package.json` |

> **重要布局**:流程编辑器与页面搭建器一样需要**全屏三栏**(节点面板 / 画布 / 配置面板),必须撑满 `100vh - 56px`。`StudioLayout` 已有 `isFullBleed` 逻辑(当前仅匹配 `/pages/:pageId`),需扩展匹配 `/processes/:processId`,见 §8.2。

> **核心数据流**:
> - 流程编辑器 → 直接产出 `WorkflowSchema` JSON(零翻译,flowgram 原生格式)
> - 执行格式统一为 `WorkflowSchema`,存入 `process_definitions.workflow_schema`(Prisma)

> **类型对齐提示**:`packages/shared/src/process/index.ts` 定义了 18 种 `SimplifiedNodeType`,但流程编辑器当前仅注册 10 种(`start`/`end`/`trigger`/`object_operation`/`condition`/`user_task`/`notification`/`http_request`/`assign`/`delay`)。本规范首期落地这 10 种,其余(`parallel`/`inclusive`/`loop`/`sub_process`/`break`/`continue`/`batch_operation`/`wait_for_condition`/`comment`)作为扩展节点,画布面板预留分组入口,后续按相同模式补全。

> **form-meta 对齐**:现有 `nodes/*/form-meta.ts` 使用 flowgram 表单元数据(`group/fields`,field types:`select/text/textarea/json/number`),其枚举值需与 `shared` 的 `TriggerType`/`UserTaskConfig`/`NotificationConfig` 等对齐(见 §4 标注的差异)。本规范推荐用 AntD `Form` 重写配置面板(form-meta 仅作字段 schema 来源驱动渲染),以统一交互与校验。

---

## 1. 设计概述

### 1.1 定位

流程引擎是 aPaaS 的「逻辑层中枢」。用户在此编排业务自动化流程:当记录创建时触发 → 审批 → 数据操作 → 通知。平台产出的「WorkflowSchema JSON」由自研执行引擎(状态机 + BullMQ 异步队列)消费执行。本模块遵循「元数据驱动」原则——编辑器产出的是配置 JSON(`WorkflowSchema`),而非源代码。

三大核心概念(均来自 `packages/shared/src/process/index.ts`):

| 概念 | 类型 | 说明 |
|---|---|---|
| 流程定义 | `ProcessDef` | 元数据(name/key/version/status)+ `workflowSchema` |
| 节点图 | `WorkflowSchema` | `nodes` + `edges` + 可选 `groups`/`globalVariable`,流程编辑器直接产出 |
| 四态值 | `IFlowValue` | `constant` / `ref` / `expression` / `template`,节点数据绑定桥梁 |

### 1.2 流程编辑器(flowgram.ai Fixed Layout)

aPaaS 采用 flowgram.ai Fixed Layout(已 fork)作为唯一流程编辑器,直接产出 `WorkflowSchema` JSON(零翻译)。

| 引擎 | 产出格式 | 适用人群 | 定位 |
|---|---|---|---|
| flowgram.ai Fixed Layout(已 fork) | `WorkflowSchema` JSON(零翻译) | 业务人员、初学者 | 飞书式业务节点,自上而下节点流,表单式配置 |

### 1.3 整体布局:列表页 + 全屏编辑器

```
┌─ StudioLayout.Header(返回应用列表 / 用户菜单,height:56)──────────────────────────────┐
├─ StudioLayout.Sider(应用内导航:工作台 / 对象 / 页面 / 流程 ◀ / 权限,width:220)─┤
│                                                                                 │
│  ┌─ Content(padding:0 全屏模式, bg:#f5f7fa)────────────────────────────────────┐ │
│  │                                                                                │ │
│  │   路由分两层:                                                                  │ │
│  │   /app/:appId/processes              → 流程列表页(卡片网格)                 │ │
│  │   /app/:appId/processes/:processId   → 流程编辑器(三栏全屏)                  │ │
│  │   /app/:appId/processes/monitor      → 流程监控(实例列表 + 详情)           │ │
│  │                                                                                │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

> 列表页走 StudioLayout 默认 Content(padding:24 + 白卡);编辑器与监控页走 fullBleed 全屏(见 §8.2)。

### 1.4 信息架构

```
流程引擎
├── 流程列表页(/processes)
│   ├── 工具栏(搜索 / 状态筛选 / [+ 新建流程])
│   ├── 流程卡片网格(名称 / 触发器类型 / 状态 / 版本)
│   └── 新建流程弹窗(填名称 + 选触发器)
├── 流程编辑器(/processes/:processId,全屏三栏)
│   ├── 编辑器工具栏(返回 / 名称 / 撤销重做 / 预览 / 保存 / 发布)
│   ├── 左栏:节点面板(10 种业务节点 + 拖拽)
│   ├── 中栏:画布(flowgram Fixed Layout,自上而下节点流)
│   └── 右栏:节点配置面板(表单式,按节点类型动态渲染)
├── 流程监控(/processes/monitor,全屏)
│   ├── 运行实例列表(流程名 / 状态 / 开始时间 / 耗时)
│   ├── 实例详情(节点执行状态颜色标记)
│   ├── 人工任务列表(待审批 / 已审批)
│   └── 任务处理面板(审批 / 驳回 / 转办)
└── 通知模版管理(独立入口或列表页 Tab)
    ├── 模版列表(名称 / 渠道 / 变量数)
    └── 模版编辑器(标题模版 + 正文模版 + 变量定义 + 预览)
```

### 1.5 交互模式总览

| 模式 | 说明 | 技术 |
|---|---|---|
| 拖拽添加节点 | 从左栏节点面板拖到画布 | flowgram 原生拖拽 |
| 点击选中节点 | 节点高亮 + 右栏加载配置 | `selectedNodeId` state |
| 表单式配置 | 右栏按节点类型动态渲染配置表单 | AntD `Form` + `form-meta` 驱动 |
| 内联编辑 | 流程名称点击即编辑 | `Typography` `editable` |
| 自动保存 | Schema 变化防抖保存草稿 | `useEffect` + 防抖 1s |
| 即时反馈 | 增删改用 `message`,危险操作用 `Popconfirm` | `message` / `Popconfirm` |

---

## 2. 流程列表页

**路由**:`/app/:appId/processes`(进入流程模块默认页)

**布局**:复用 StudioLayout Content 默认白卡层。顶部工具栏 + 卡片网格。

```
┌─ Content(padding:24, bg:#f5f7fa) ──────────────────────────────────────────┐
│ ┌─ 工具栏(白卡, padding:16 20, borderRadius:12)────────────────────────┐ │
│ │ 流程                       🔍搜索流程  状态[全部▾]  [+ 新建流程]       │ │
│ ├────────────────────────────────────────────────────────────────────────┤ │
│ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│ │ │ ⚡ 客户审批流 │ │ ⏰ 每日数据   │ │ 📨 订单通知   │ │ ➕ 新建流程  │   │ │
│ │ │              │ │   同步        │ │              │ │              │   │ │
│ │ │ 记录创建触发 │ │ 定时触发      │ │ 记录更新触发 │ │ 空白流程     │   │ │
│ │ │ [已发布 v3]  │ │ [草稿 v1]    │ │ [已发布 v2]  │ │ 开始编排     │   │ │
│ │ │ 更新于 2h前  │ │ 更新于 1d前  │ │ 更新于 3d前  │ │              │   │ │
│ │ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 工具栏

| 元素 | 控件 | 规格 |
|---|---|---|
| 标题 | `Title level={4}`「流程」 | 左侧 |
| 搜索 | `Input.Search` | `placeholder="搜索流程名"` `allowClear` `size="middle"` `width:240` |
| 状态筛选 | `Select` | 选项:全部 / 草稿 / 已发布 / 已弃用,对齐 `ProcessStatus` |
| 新建 | `Button type="primary" icon={<PlusOutlined/>}`「新建流程」 | 打开新建弹窗(§2.3) |

### 2.2 流程卡片 `<ProcessCard>`

```
┌─ 流程卡片 (width:100%, borderRadius:12, border:#eef0f4, hover shadow) ─┐
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │  ⚡  客户审批流                            [已发布] v3           │ │  ← 图标块 40×40 + 名称(editable 占位) + 状态 Tag + 版本
│ │      customer_approval                                           │ │
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │  触发器: 记录创建                                                 │ │  ← 触发器类型(图标 + 文字)
│ │  更新于 2 小时前                                                  │ │  ← updatedAt 相对时间
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │  ✎编辑   ▶监控   ⋮更多                                            │ │  ← 操作行
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**规格**:
- 卡片:`Card` `style={{ borderRadius:12, border:'1px solid #eef0f4' }}` `styles={{ body:{ padding:20 } }}`,hover `box-shadow:0 8px 24px rgba(0,0,0,0.04)`
- 网格:`Row gutter={[16,16]}`,每卡片 `Col xs={24} sm={12} lg={8} xl={6}`
- 图标块:40×40 圆角 10,渐变背景按触发器类型着色(见 §7.2)
- 名称:`Text strong fontSize:15`
- API 名:`Text code secondary fontSize:12`(等宽,`processKey`)
- 状态 Tag:草稿 `orange`、已发布 `green`、已弃用 `default`,对齐 `ProcessStatus`
- 触发器类型:图标 + 显示名(见 §7.2),来自 `ProcessDef.triggerType`
- 操作行:`Button type="text" size="small"`:编辑(`navigate(:processId)`)、监控(`navigate(/monitor?processId=)`)、更多(`Dropdown`:复制 / 导出 Schema / 删除)
- 删除:`Popconfirm`「删除后流程定义与历史实例将不可恢复」`okButtonProps={{ danger:true }}`

**空状态**:无流程时 `Empty`(图标块 `#e6f4ff` + `ApartmentOutlined` 64px `#1677ff`)+ 居中「新建第一个流程」按钮。

### 2.3 新建流程弹窗 `<CreateProcessModal>`

**形态**:`Modal` `title="新建流程"` `width={520}` `destroyOnClose`。

```
┌─ 新建流程 ──────────────────────────────────────┐
│                                                  │
│ 流程名称 *                                        │
│ [客户审批流______________________]               │
│                                                  │
│ API 名称                                          │
│ [customer_approval____]  (自动生成,可编辑)      │
│                                                  │
│ 触发器类型                                        │
│ [记录创建 ▾]  (可选,创建后再配)                 │
│                                                  │
│                          [取消]  [创建并编辑]    │
└──────────────────────────────────────────────────┘
```

| 表单项 | name | 控件 | 校验 |
|---|---|---|---|
| 流程名称 | `name` | `Input` | `required`,1-40 字 |
| API 名称 | `processKey`/`apiName` | `Input` 等宽 | `required`,正则 `^[a-z][a-z0-9_]*$`,应用内唯一 |
| 触发器类型 | `triggerType` | `Select` | 选填,候选见 §4.1 |

- 创建后:`POST` → 后端返回 `ProcessDef`(version=1, status=DRAFT)→ `navigate(/processes/:id)` 进入编辑器
- 新建空 `WorkflowSchema`(仅 start→end)
- API 名自动生成:输入名称后实时建议(`客户审批流` → `customer_approval`,中文转拼音或要求手填),创建后锁定

---

## 3. 流程编辑器界面 (flowgram.ai Fixed Layout)

**路由**:`/app/:appId/processes/:processId`

**基础**:基于现有 [`SimplifiedProcessEditor`](../../packages/studio/features/process/simplified/src/SimplifiedProcessEditor.tsx) 组件定制。该组件已封装 `FixedLayoutEditorProvider` + `EditorRenderer`,提供 `readonly` prop 与 `onSchemaChange` 回调。本规范在其外层包一层三栏布局 + 节点面板 + 配置面板。

### 3.1 整体布局:全屏三栏

```
┌─ 编辑器工具栏(height:48, bg:#fff, sticky)──────────────────────────────────┐
│ ◀返回  ⚡ 客户审批流 [edit]  ⤺⤹  👁预览  保存  [发布]                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┬───────────────────────────────────────┬────────────────────┐ │
│ │ 节点面板    │  画布(flowgram Fixed Layout)         │ 节点配置面板        │ │
│ │ (Left)     │                                       │ (Right)            │ │
│ │ 240px      │  ┌─ 缩放工具(右上浮动) ─┐           │ 360px              │ │
│ │            │  │ − 100% +  ⊡适应       │           │                    │ │
│ │ 🔍搜索节点  │  └──────────────────────┘           │ ┌────────────────┐ │ │
│ │ ─触发与起止 │  ┌─ 节点流(自上而下) ──┐           │ │ 🧑‍💼 审批       │ │ │
│ │  ▸ 触发器   │  │   ○ 开始              │           │ │ user_task       │ │ │
│ │  ▸ 开始     │  │   │                   │           │ ├────────────────┤ │ │
│ │  ▸ 结束     │  │   ▼                   │           │ │ 审批任务配置    │ │ │
│ │ ─数据操作   │  │   ⬡ 触发器            │           │ │ ...表单...      │ │ │
│ │  ▸ 对象操作 │  │   │                   │           │ │                │ │ │
│ │ ─流程控制   │  │   ▼                   │           │ │                │ │ │
│ │  ▸ 条件分支 │  │   ▣ 审批 ◀选中        │           │ │                │ │ │
│ │ ─业务操作   │  │   │                   │           │ │                │ │ │
│ │  ▸ 人工任务 │  │   ▼                   │           │ │                │ │ │
│ │  ▸ 通知     │  │   ✉ 通知              │           │ │ [取消] [保存]   │ │ │
│ │  ▸ HTTP请求 │  │   │                   │           │ └────────────────┘ │ │
│ │  ▸ 赋值     │  │   ▼                   │ │                    │ │
│ │  ▸ 延时     │  │   ◯ 结束              │ │                    │ │
│ │            │  └──────────────────────┘ │                    │ │
│ └────────────┴───────────────────────────────────────┴────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**三栏尺寸**:
- 左栏(节点面板):固定 `240px`,全高,`overflow-y:auto`
- 中栏(画布):`flex:1`,`overflow:auto`
- 右栏(节点配置面板):固定 `360px`,全高,`overflow-y:auto`
- 栏间 `1px solid #eef0f4` 分隔,无 gap

### 3.2 编辑器工具栏 `<ProcessEditorToolbar>`

通过流程编辑器共用。

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀返回  ⚡ 客户审批流 [edit]   ⤺ ⤹   👁预览  保存  [发布]                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

| 元素 | 控件 | 规格 |
|---|---|---|
| 返回 | `Button type="text" icon={<ArrowLeftOutlined/>}` | 跳转 `/processes` 列表 |
| 流程图标 | 触发器图标块 32×32 圆角 8 | 渐变背景(见 §7.2) |
| 流程名称 | `Typography.Title level={5}` `editable` | 失焦保存 `name` |
| 撤销/重做 | `Button type="text" icon` | `UndoOutlined`/`RedoOutlined`,复用 `usePlaygroundTools` |
| 预览 | `Button icon={<EyeOutlined/>}` | 试运行:输入参数 → 启动实例 → 跳监控(可选,Phase 3 后期) |
| 保存 | `Button` | 防抖自动保存草稿(`status=DRAFT`);手动保存 `message.success` |
| 发布 | `Button type="primary"` | `Popconfirm`「发布后将生成新版本,已发布版本不可编辑」→ version+1, status=PUBLISHED |
| 状态标记 | `Tag` | 草稿 `orange` / 已发布 `green`,显示在名称右侧 |

> 工具栏左侧 `Space size={12}`,右侧 `Space size={8}`,中间 `flex:1` 撑开。复用现有 `EditorToolbar` 的撤销/重做/适应视区逻辑。

### 3.3 左栏:节点面板 `<NodePanel>`

复用 `ApaasNodeRegistries` 的节点元数据(`info.icon` / `info.description`)驱动渲染。

```
┌─ 节点面板 (240px, bg:#fff) ──────────┐
│ ┌──────────────────────────────────┐ │
│ │ 🔍 搜索节点…                     │ │  ← Input.Search(allowClear, size="small", margin:12)
│ ├──────────────────────────────────┤ │
│ │ ▾ 触发与起止                      │ │  ← Collapse 折叠面板(默认全展开)
│ │  ┌────────┐ ┌────────┐ ┌────────┐│ │
│ │  │ ⚡ 触发器│ │ 🏁 开始 │ │ 🔚 结束 ││ │  ← 节点项(网格,每行 3 个)
│ │  └────────┘ └────────┘ └────────┘│ │
│ │ ▾ 数据操作                        │ │
│ │  ┌────────┐                      │ │
│ │  │ 🗄 对象操作│                    │ │
│ │  └────────┘                      │ │
│ │ ▾ 流程控制                        │ │
│ │  ┌────────┐                      │ │
│ │  │ 🔀 条件分支│                    │ │
│ │  └────────┘                      │ │
│ │ ▾ 业务操作                        │ │
│ │  ┌────────┐ ┌────────┐ ┌────────┐│ │
│ │  │ 🧑‍💼 审批 │ │ ✉ 通知  │ │ 🌐 HTTP ││ │
│ │  └────────┘ └────────┘ └────────┘│ │
│ │  ┌────────┐ ┌────────┐           │ │
│ │  │ 📝 赋值 │ │ ⏱ 延时 │            │ │
│ │  └────────┘ └────────┘           │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**规格**:
- 容器:`div` `width:240` `background:#fff` `border-right:1px solid #eef0f4` `overflow-y:auto`
- 搜索:`Input.Search` `placeholder="搜索节点"` `allowClear` `size="small"` `style={{ margin:12 }}`
- 分类:`Collapse` `ghost`,默认全展开
- 节点项网格:`Row gutter={[8,8]}` 每项 `Col span={8}`(每行 3 个)

**节点项 `<NodeItem>`(拖拽源)**:
- 卡片:`div` `height:64` `border:1px solid #eef0f4` `borderRadius:8` `background:#fff`
  - hover:`border-color:#1677ff` `background:#e6f4ff` `cursor:grab`
  - 拖拽中:`opacity:0.5`
- 内容:垂直居中,图标(28px)+ 名称(`Text fontSize:12`)
- 拖拽:flowgram 原生拖拽创建节点(fixed-layout-editor 支持 panel→canvas create)

**节点分类与 10 种节点**(对齐 `ApaasNodeRegistries`):

| 分组 | 节点(type → 显示名) | 图标 |
|---|---|---|
| 触发与起止 | 触发器 `trigger`、开始 `start`、结束 `end` | `ThunderboltOutlined`、`PlayCircleOutlined`、`StopOutlined` |
| 数据操作 | 对象操作 `object_operation` | `DatabaseOutlined` |
| 流程控制 | 条件分支 `condition` | `BranchesOutlined` |
| 业务操作 | 人工任务 `user_task`、通知 `notification`、HTTP 请求 `http_request`、赋值 `assign`、延时 `delay` | `SolutionOutlined`、`BellOutlined`、`ApiOutlined`、`EditOutlined`、`ClockCircleOutlined` |

> 扩展节点(`parallel`/`inclusive`/`loop`/`sub_process` 等)在面板对应分组下显示为「即将支持」灰态项(`opacity:0.4` `cursor:not-allowed` + `Tooltip`)。

### 3.4 中栏:画布(flowgram Fixed Layout)

由 `EditorRenderer` 渲染,自上而下节点流(非自由布局)。每个节点是 flowgram 的内置节点渲染器,展示节点标题 + 类型图标 + 简要配置摘要。

**节点渲染规格**(定制 flowgram 节点卡片样式):
- 节点卡片:`border:1px solid #eef0f4` `borderRadius:8` `background:#fff` `padding:12 16` `width:240`(居中)
  - 默认:`border:#eef0f4`
  - 悬停:`border:#91caff`
  - 选中:`border:#1677ff` `box-shadow:0 0 0 2px rgba(22,119,255,0.1)`
  - 只读态(未支持节点占位):`border-dashed:#d9d9d9` `background:#fafbfc`
- 节点头:图标(24px,按类型着色)+ 标题(`Text strong fontSize:13`)+ 右侧类型 `Tag`
- 节点摘要:配置摘要(`Text secondary fontSize:12`,如「审批人: 管理员 · 单人审批」)
- 连线:flowgram 自动绘制竖向连线,`stroke:#d9d9d9` `strokeWidth:2`
- 条件分支节点:横向展开多个分支端口,每个分支显示 `label`(如「条件成立」「否则」)

**缩放工具**(右上浮动,复用现有 `EditorToolbar` 的 `fitView`):
```
┌─ 缩放工具(absolute, top:16, right:16) ─┐
│  −    100%    +    ⊡ 适应视区            │
└──────────────────────────────────────────┘
```

**空状态**:仅 start→end 时,在两节点间显示拖放提示「拖拽节点到这里」(虚线占位)。

### 3.5 右栏:节点配置面板 `<NodeConfigPanel>`

选中节点后,右栏按节点 `type` 动态渲染配置表单。表单 schema 由 `nodes/*/form-meta.ts` 提供,但推荐用 AntD `Form` 重写渲染器以统一校验与交互(见 §4)。

```
┌─ 节点配置面板 (360px, bg:#fff) ──────────────┐
│ ┌──────────────────────────────────────────┐ │
│ │ 🧑‍💼 审批任务                 user_task    │ │  ← 选中节点头(图标+标题+type)
│ │ node_userTask_0                          │ │     ID(secondary, 等宽)
│ ├──────────────────────────────────────────┤ │
│ │ 节点标题                                  │ │
│ │ [审批______________________]             │ │  ← 通用:节点标题(data.title)
│ │                                          │ │
│ │  ─── 审批任务配置 ───                    │ │  ← Divider orientation="left"
│ │                                          │ │
│ │ 审批人类型 *                              │ │  ← 类型专属配置(按 type 渲染)
│ │ [指定角色 ▾]                             │ │
│ │                                          │ │
│ │ 审批人/角色编码 *                         │ │
│ │ [ADMIN___________________] 🔗            │ │  ← 旁置变量绑定按钮(IFlowValue)
│ │                                          │ │
│ │ 审批模式 *                                │ │
│ │ [单人审批 ▾]                             │ │
│ │                                          │ │
│ │ 任务表单                                  │ │
│ │ [选择表单...         ▾]                  │ │
│ │                                          │ │
│ │             [删除节点]    [应用]         │ │  ← 底部操作
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**规格**:
- 容器:`div` `width:360` `background:#fff` `border-left:1px solid #eef0f4` `overflow-y:auto`
- 选中头:`padding:12px 16px` `border-bottom:1px solid #eef0f4`,图标 + 标题(`Text strong`)+ ID(`Text code secondary fontSize:12`)
- 未选中:`Empty`「选中一个节点以配置」(图标块 `#e6f4ff` + `ApartmentOutlined`)
- 表单:`Form layout="vertical" size="small"`,`padding:16`
- 通用项:节点标题 `data.title`(`Input`,所有节点共有)
- 类型专属项:按 `type` 渲染(见 §4)
- 底部:删除节点(`Button type="text" danger` + `Popconfirm`)+ 应用(`Button type="primary"`,或实时 onChange 写回)
- 变量绑定:每个值字段旁置 🔗 按钮,切换「常量 / 引用变量 / 表达式 / 模板」(对齐 `IFlowValue` 四态,见 §4.9)

---

## 4. 节点配置面板(按节点类型)

每个节点的配置表单由 `nodes/*/form-meta.ts` 的字段 schema 驱动,但用 AntD `Form` 渲染以统一校验。以下按 `SimplifiedNodeType` 详述。所有配置写入 `WorkflowNode.data`,四态值字段写入 `data.inputsValues[key]: IFlowValue`。

> **类型对齐提示**:现有 `form-meta.ts` 的枚举值(如 trigger 的 `RECORD_CREATED`)需与 `shared` 的 `TriggerType`(`record_event`/`schedule`/`manual`/`button_click`)对齐。下表以 `shared` 类型契约为 SSOT,标注差异。

### 4.1 触发器 `trigger`(`TriggerConfig`)

| 表单项 | key | 控件 | 候选/校验 |
|---|---|---|---|
| 触发类型 | `triggerType` | `Select` | `record_event`(记录创建/更新/删除)、`schedule`(定时)、`manual`(手动)、`button_click`(按钮点击) |
| 关联对象 | `objectTrigger.objectId` | `Select showSearch` | 候选 = `objectsApi.list(appId)`;仅 `record_event` 显示 |
| 触发事件 | `objectTrigger.event` | `Radio.Group` | `create`/`update`/`delete`;仅 `record_event` 显示 |
| 触发条件 | `objectTrigger.condition` | 条件构建器(复用对象视图 FilterBuilder) | 选填,满足才触发 |
| Cron 表达式 | `cron` | `Input` + `Tooltip` | 仅 `schedule` 显示,placeholder=`0 0 9 * * ?`(每天 9 点),旁置常用预设 `Select` |

```
┌─ 触发器配置 ────────────────────────────────────┐
│ 触发类型 *                                        │
│ [记录事件 ▾]                                      │
│                                                  │
│ 关联对象 *                                        │
│ [客户 ▾]                                          │
│                                                  │
│ 触发事件 *                                        │
│ ◉ 创建  ○ 更新  ○ 删除                           │
│                                                  │
│ 触发条件(可选)                                   │
│ 满足 [全部▾] 条件              [+ 添加条件]      │
│ [等级 ▾] [等于 ▾] [高 ▾]                  [✕]   │
│                                                  │
│ ─ 或(定时) ─                                    │
│ Cron 表达式 *                                     │
│ [0 0 9 * * ?____]  预设: [每天▾]                │
└──────────────────────────────────────────────────┘
```

> form-meta 现状:triggerType 候选为 `RECORD_CREATED/RECORD_UPDATED/SCHEDULED/API/MANUAL`,需改为 `shared` 的 `TriggerType` 枚举语义(`record_event` + `event` 字段区分增删改)。

### 4.2 对象操作 `object_operation`(`ObjectOperationConfig`)

| 表单项 | key | 控件 | 候选/校验 |
|---|---|---|---|
| 操作类型 | `operation` | `Select` | `create`/`update`/`query`/`delete`(form-meta 额外有 `UPSERT`,可保留) |
| 目标对象 | `objectId` | `Select showSearch` | 候选 = `objectsApi.list(appId)` |
| 字段映射 | `fieldMapping` | 字段映射器(键值对:对象字段 ← 流程变量) | `create`/`update` 显示;每行 `Select`(字段)+ 变量绑定 🔗 |
| 查询条件 | `filter` | 条件构建器(FilterBuilder) | `query`/`update`/`delete` 显示 |
| 结果变量 | `resultVariable` | `Input code` | `query` 显示,查询结果写入此变量名 |

```
┌─ 对象操作 ──────────────────────────────────────┐
│ 操作类型 *    [创建记录 ▾]                       │
│ 目标对象 *    [订单 ▾]                           │
│                                                  │
│ ─ 字段映射 ─                                     │
│ 订单名称    ← [${trigger.record.name} 🔗]  [✕]   │
│ 客户        ← [${trigger.record.customerId} 🔗] [✕]│
│ [+ 添加映射]                                     │
└──────────────────────────────────────────────────┘
```

> 字段映射器:每行左 = 目标对象字段(`Select`,候选 = `objectsApi.getWithFields`),右 = 值(变量绑定,默认 `template` 态引用触发记录)。

### 4.3 条件分支 `condition`(`ConditionBranch`)

| 表单项 | key | 控件 | 说明 |
|---|---|---|---|
| 分支列表 | `conditions` | 分支构建器 | 每个分支 `{ label, condition }`,最后可留空 `condition` 作 else |

```
┌─ 条件分支 ──────────────────────────────────────┐
│ 分支 1:                                          │
│   分支名称 [条件成立__________]          [✕]     │
│   满足 [全部▾] 条件            [+ 添加条件]      │
│   [金额 ▾] [大于 ▾] [1000 🔗]            [✕]    │
│                                                  │
│ 分支 2:                                          │
│   分支名称 [条件不成立__________]        [✕]     │
│   (空条件 = 否则/default)                        │
│                                                  │
│ [+ 添加分支]                                     │
└──────────────────────────────────────────────────┘
```

- 每个分支对应画布的一个出边端口,`label` 显示在分支端口上
- 条件构建器复用对象视图的 `FilterBuilder`(字段 `Select` + 操作符 `Select` + 值),操作符随字段类型过滤
- else 分支:`condition` 留空,`label` 默认「否则」

### 4.4 人工任务 `user_task`(`UserTaskConfig`)

| 表单项 | key | 控件 | 候选/校验 |
|---|---|---|---|
| 任务名称 | `taskName` | `Input` | `required` |
| 审批人类型 | `assigneeType` | `Select` | `USER`(指定用户)、`ROLE`(指定角色)、`ORG`(指定组织)、`SUPERVISOR`(上级主管)、`FORM_FIELD`(表单字段) |
| 审批人/角色 | `assignee`/`candidateGroups` | 动态控件 | `USER`→用户选择器;`ROLE`→角色 `Select`;`ORG`→组织树选择;`SUPERVISOR`→(无需填,自动取发起人主管);`FORM_FIELD`→字段 `Select` |
| 审批模式 | `approvalMode` | `Select` | `SINGLE`(单人)、`COUNTERSIGN`(会签,全部同意)、`OR_SIGN`(或签,任一同意) |
| 任务表单 | `formKey` | `Select` | 候选 = 应用内表单页(`pagesApi.list` 中 `type=form_page`);选填 |
| 截止时间 | `dueDate` | `InputNumber` + `Select`(单位) | 选填,超时提醒 |

```
┌─ 审批任务配置 ──────────────────────────────────┐
│ 任务名称 *   [合同审批__________________]        │
│ 审批人类型 * [指定角色 ▾]                        │
│ 审批角色 *   [财务审批人 ▾]                      │
│ 审批模式 *   [会签(全部同意) ▾]                  │
│ 任务表单     [合同审批表单 ▾]           (可选)   │
│ 截止时间     [48] [小时 ▾]              (可选)   │
└──────────────────────────────────────────────────┘
```

> form-meta 现状:`assigneeType` 候选 `USER/ROLE/ORG/SUPERVISOR/FORM_FIELD`,`approvalMode` 候选 `SINGLE/COUNTERSIGN/OR_SIGN`,与 `UserTaskConfig` 基本对齐。`assigneeId` 应按 `assigneeType` 动态切换控件。

### 4.5 通知 `notification`(`NotificationConfig`)

| 表单项 | key | 控件 | 候选/校验 |
|---|---|---|---|
| 通知渠道 | `channel` | `Select` | `in_app`(站内)、`email`(邮件)、`webhook` |
| 通知模版 | `templateId` | `Select` | 候选 = 通知模版列表(§5);选模版后自动填充标题/正文,可覆盖 |
| 收件人 | `recipients` | 动态控件(多选) | 用户选择器 / 角色 `Select` / 变量绑定 `${trigger.user.id}`;`webhook` 时为 URL 输入 |
| 标题 | `title` | `Input` | 支持变量插值 `${record.name}` |
| 正文 | `content` | `Input.TextArea rows={4}` | 支持变量插值;选模版后回填 |

```
┌─ 通知配置 ──────────────────────────────────────┐
│ 通知渠道 *   [邮件 ▾]                            │
│ 通知模版     [审批结果通知 ▾]           (可选)   │
│ 收件人 *     [张三 ×] [李四 ×] [+ 添加] 🔗       │
│ 标题 *       [${record.name} 审批已完成]         │
│ 正文 *       ┌──────────────────────────────┐   │
│              │ 您的 ${record.name} 已由      │   │
│              │ ${approver.name} 审批通过。   │   │
│              └──────────────────────────────┘   │
│                              [预览通知]          │
└──────────────────────────────────────────────────┘
```

> form-meta 现状:`channel` 候选 `EMAIL/IN_APP/WEBHOOK`,需改为小写 `in_app/email/webhook` 对齐 `NotificationConfig`。`recipient`(单值)应改为 `recipients`(数组)。变量插值用 `template` 态 `IFlowValue`。

### 4.6 HTTP 请求 `http_request`(`HttpConfig`)

| 表单项 | key | 控件 | 候选/校验 |
|---|---|---|---|
| 请求方法 | `method` | `Select` | `GET`/`POST`/`PUT`/`PATCH`/`DELETE` |
| 请求 URL | `url` | `Input` | `required`,支持变量插值 `${config.endpoint}` |
| 请求头 | `headers` | 键值对编辑器 | 每行 key/value,值支持变量绑定 |
| 请求体 | `body` | `Input.TextArea` 或 JSON 编辑器 | `POST`/`PUT`/`PATCH` 显示;支持变量插值 |
| 响应映射 | `responseMapping` | 键值对编辑器 | 每行:响应字段(JSONPath,如 `$.data.id`)→ 流程变量名 |

```
┌─ HTTP 请求 ─────────────────────────────────────┐
│ 请求方法 * [POST ▾]                              │
│ 请求 URL * [https://api.example.com/webhook 🔗]  │
│                                                  │
│ ─ 请求头 ─                                       │
│ Content-Type   [application/json____]     [✕]    │
│ Authorization  [Bearer ${token}____]      [✕]    │
│ [+ 添加请求头]                                   │
│                                                  │
│ ─ 请求体 ─                                       │
│ ┌──────────────────────────────────────────┐     │
│ │ { "orderId": "${record.id}" }            │     │
│ └──────────────────────────────────────────┘     │
│                                                  │
│ ─ 响应映射 ─                                     │
│ $.data.id      → [apiResultId____]        [✕]    │
│ [+ 添加映射]                                     │
└──────────────────────────────────────────────────┘
```

### 4.7 赋值 `assign`

| 表单项 | key | 控件 | 校验 |
|---|---|---|---|
| 变量名 | `variableName` | `Input code` | `required`,正则 `^[a-zA-Z][a-zA-Z0-9_]*$` |
| 值 | `value` | 四态值编辑器(见 §4.9) | `required`,`IFlowValue` |

```
┌─ 变量赋值 ──────────────────────────────────────┐
│ 变量名 *   [approvalResult____________]          │
│ 值 *       [常量 ▾ / 引用 / 表达式 / 模板]       │
│            [approved________________] 🔗         │
└──────────────────────────────────────────────────┘
```

> form-meta 现状:`value` 为 `json` 类型,应改为四态值编辑器,产出 `{ type:'constant', content:'approved' }` 等 `IFlowValue`。

### 4.8 延时 `delay`

| 表单项 | key | 控件 | 候选/校验 |
|---|---|---|---|
| 延时时长 | `duration` | `InputNumber min={1}` | `required` |
| 时间单位 | `unit` | `Select` | `SECONDS`/`MINUTES`/`HOURS`/`DAYS` |

```
┌─ 延时配置 ──────────────────────────────────────┐
│ 延时时长 * [24]  单位 [小时 ▾]                   │
└──────────────────────────────────────────────────┘
```

### 4.9 四态值编辑器 `<FlowValueEditor>`(通用)

所有节点配置中支持变量绑定的字段,统一用四态值编辑器,产出 `IFlowValue`。对齐 `shared` 的四态:

| 态 | `type` | 控件 | 说明 |
|---|---|---|---|
| 常量 | `constant` | 按字段类型(`Input`/`InputNumber`/`Switch`) | 字面量 |
| 引用 | `ref` | 变量路径 `TreeSelect`(候选 = 流程变量 + 触发记录字段 + 上游节点输出) | `content: string[]`(变量路径数组) |
| 表达式 | `expression` | `Input.TextArea`(或简易表达式编辑器) | `content: string` |
| 模板 | `template` | `Input`/`Input.TextArea`(支持 `${var}` 插值高亮) | `content: string` |

```
┌─ 值 (IFlowValue) ───────────────────────────────┐
│ [常量 ▾]                              🔗        │  ← Segmented 切换四态
│                                                  │
│  (常量态) [approved______________________]       │
│  (引用态) ▾ trigger.record.customerId            │  ← TreeSelect 变量路径
│  (表达式态) ┌────────────────────────────┐       │
│             │ amount > 1000 && status==1 │       │
│             └────────────────────────────┘       │
│  (模板态)  ${record.name} 审批已完成             │
└──────────────────────────────────────────────────┘
```

- 切换器:`Segmented options=['常量','引用','表达式','模板']`,或 🔗 按钮弹出选择
- 变量候选:流程变量(`globalVariable`)+ 触发记录字段 + 各节点 `outputs`(从 `WorkflowNodeData.outputs` JSON Schema 提取)
- 实现:每态渲染对应控件,产出 `{ type, content }` 写入 `data.inputsValues[key]`

---

## 5. 通知模版管理 UI

通知模版供 `notification` 节点复用,集中管理标题/正文模版与变量定义。入口:流程列表页 Tab「流程定义 / 通知模版」或独立路由 `/app/:appId/processes/templates`。

### 5.1 模版列表

```
┌─ 通知模版 (Tab) ──────────────────────────────────────────────────────────┐
│                                            🔍搜索  [+ 新建模版]            │
│ ┌────────────────────┬──────────┬──────────┬────────────┬───────────────┐ │
│ │ 模版名称           │ 渠道     │ 变量数   │ 更新于     │ 操作          │ │
│ ├────────────────────┼──────────┼──────────┼────────────┼───────────────┤ │
│ │ ✉ 审批结果通知     │ 邮件     │ 3        │ 2 小时前   │ ✎编辑  ⋮更多 │ │
│ │ 💬 站内审批提醒    │ 站内     │ 2        │ 1 天前     │ ✎编辑  ⋮更多 │ │
│ │ 🔗 Webhook 回调    │ Webhook  │ 5        │ 3 天前     │ ✎编辑  ⋮更多 │ │
│ └────────────────────┴──────────┴──────────┴────────────┴───────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- `Table` `size="middle"`,列:名称(图标 + `Text strong`)、渠道(`Tag`)、变量数、更新时间、操作
- 渠道 `Tag`:邮件 `blue`、站内 `green`、Webhook `purple`
- 新建/编辑:打开模版编辑器(抽屉)

### 5.2 模版编辑器 `<NotificationTemplateEditor>`(Drawer)

**形态**:`Drawer` `placement="right"` `width={560}`,标题「新建模版 / 编辑模版 — 审批结果通知」。

```
┌─ 通知模版编辑 (Drawer, width:560) ────────────────────────────────────────┐
│ 模版名称 *                                                                 │
│ [审批结果通知______________________]                                       │
│                                                                            │
│ 渠道 *           [邮件 ▾]                                                  │
│                                                                            │
│ ─ 标题模版 ─                                                                │
│ [${record.name} 审批${result}]                            [插入变量 ▾]     │
│                                                                            │
│ ─ 正文模版 ─                                                                │
│ ┌────────────────────────────────────────────────────────────────────┐    │
│ │ 尊敬的 ${recipient.name}:                                          │    │
│ │                                                                    │    │
│ │ 您提交的 ${record.name} 已由 ${approver.name}                      │    │
│ │ 于 ${approvedAt} 审批${result}。                                   │    │
│ │                                                                    │    │
│ │ 如有疑问,请联系审批人。                                           │    │
│ └────────────────────────────────────────────────────────────────────┘    │
│                                              [插入变量 ▾]                 │
│                                                                            │
│ ─ 变量定义 ─                                                                │
│ 变量名           说明              示例值                  [✕]             │
│ [record.name___] [记录名称________] [客户A____________]    [✕]            │
│ [result________] [审批结果________] [通过________________] [✕]            │
│ [approver.name_] [审批人姓名______] [张三______________]   [✕]            │
│ [+ 添加变量]                                                               │
│                                                                            │
│ ─ 预览 ─                                                                    │
│ ┌─ 邮件预览 ─────────────────────────────────────────────────────────┐    │
│ │ 标题: 客户A 审批通过                                               │    │
│ │ 正文: 尊敬的 李四:                                                 │    │
│ │       您提交的 客户A 已由 张三 于 2026-07-31 审批通过。            │    │
│ └────────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│                                          [取消]  [保存]                    │
└────────────────────────────────────────────────────────────────────────────┘
```

| 区块 | 控件 | 说明 |
|---|---|---|
| 基本信息 | `Form`:名称 `Input`、渠道 `Select` | `required` |
| 标题模版 | `Input` + 「插入变量」`Dropdown` | 变量插值 `${var}`,候选来自下方变量定义 |
| 正文模版 | `Input.TextArea rows={6}` + 「插入变量」 | 同上,支持换行 |
| 变量定义 | `Form.List`:变量名(`Input code`)+ 说明(`Input`)+ 示例值(`Input`) | 用于预览填充与节点配置提示 |
| 预览 | 只读渲染区,用示例值替换 `${var}` | 实时更新 |

- 「插入变量」`Dropdown`:列出已定义变量,点击插入 `${varName}` 到光标处
- 预览:遍历模版,用变量示例值替换 `${var}`,实时渲染(标题加粗、正文保留换行)

---

## 6. 流程监控界面

**路由**:`/app/:appId/processes/monitor`(全屏),或在列表页「监控」入口带 `?processId=` 过滤。

**数据来源**:`ProcessInstance`(实例)+ `NodeExecution`(节点执行),对齐 Prisma 模型与 `shared` 的 `ProcessInstance` / `NodeExecutionStatus`。

### 6.1 运行实例列表

```
┌─ 流程监控 ──────────────────────────────────────────────────────────────────┐
│ [运行实例] [人工任务]                    🔍  状态[全部▾]  流程[全部▾]  刷新 │
│ ┌──────────────┬──────────┬──────────┬───────────┬──────────┬─────────────┐ │
│ │ 流程名       │ 状态     │ 触发者   │ 开始时间  │ 耗时      │ 操作        │ │
│ ├──────────────┼──────────┼──────────┼───────────┼──────────┼─────────────┤ │
│ │ 客户审批流   │ ● 运行中 │ 张三     │ 07-31 09:00│ 2m 15s   │ 👁详情      │ │
│ │ 客户审批流   │ ⏸ 等待审批│ 李四    │ 07-31 08:30│ 32m      │ 👁详情  处理│ │
│ │ 订单通知     │ ✓ 已完成 │ 系统     │ 07-30 14:00│ 1.2s     │ 👁详情      │ │
│ │ 客户审批流   │ ✕ 失败   │ 王五     │ 07-30 10:00│ 5s       │ 👁详情  重试│ │
│ └──────────────┴──────────┴──────────┴───────────┴──────────┴─────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- `Tabs`:「运行实例」(默认)/「人工任务」(§6.3)
- `Table` `size="middle"`,列:流程名、状态(`Badge`+`Tag`)、触发者、开始时间、耗时、操作
- 状态映射(`ProcessInstanceState`):运行中 `processing` 蓝、等待 `waiting` 橙、已完成 `success` 绿、失败 `error` 红、已终止 `default` 灰
- 耗时:`finishedAt - startedAt` 或 `now - startedAt`(运行中),格式化(秒/分/时)
- 操作:详情(`navigate(/monitor/:instanceId)`)、处理(等待审批时,跳人工任务)、重试(失败时)
- 筛选:状态 `Select`、流程 `Select`(候选 = 已发布流程定义)
- 自动刷新:`useQuery` `refetchInterval:5000`(运行中实例轮询)

### 6.2 实例详情:节点执行状态

点击实例「详情」进入,展示节点图 + 各节点执行状态(颜色标记)。

```
┌─ 实例详情:客户审批流 ────────────────────────────────────────────────────────┐
│ ◀返回  客户审批流 #inst_abc123    状态: ● 运行中    耗时: 2m 15s            │
│        触发者: 张三   开始: 07-31 09:00:00   触发记录: 客户A (rec_xxx)      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─ 节点执行状态图(画布只读 + 状态着色) ──────────────────────────────┐ │
│ │                                                                        │ │
│ │   ○ 开始                          ✓ 已完成  09:00:00  0.1s            │ │  ← 绿色
│ │   │                                                                   │ │
│ │   ⬡ 触发器                        ✓ 已完成  09:00:00  0.2s            │ │
│ │   │                                                                   │ │
│ │   ▣ 审批                          ⏸ 等待中  09:00:20  待 张三处理     │ │  ← 橙色(高亮)
│ │   │                                                                   │ │
│ │   ✉ 通知                          ○ 待执行                             │ │  ← 灰色
│ │   │                                                                   │ │
│ │   ◯ 结束                          ○ 待执行                             │ │  ← 灰色
│ │                                                                        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ ┌─ 节点执行明细(选中节点) ──────────────────────────────────────────────┐ │
│ │ 🧑‍💼 审批 (user_task)              状态: ⏸ 等待中                      │ │
│ │ 开始: 09:00:20   结束: —   耗时: 32m                                    │ │
│ │ 输入: { assignee: "张三", approvalMode: "SINGLE" }                      │ │
│ │ 输出: (待处理)                                                           │ │
│ │ 重试次数: 0                                                              │ │
│ │                                          [处理任务]                      │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**节点状态颜色标记**(对齐 `NodeExecutionStatus.state`):

| 状态 | 颜色 | 节点样式 | 图标 |
|---|---|---|---|
| 已执行 `success` | `#52c41a`(绿) | 边框绿 + 左侧绿竖条 + ✓ 角标 | `CheckCircleOutlined` |
| 执行中 `processing` | `#1677ff`(蓝) | 边框蓝 + 脉冲动画 + Loading | `LoadingOutlined` |
| 等待中 `waiting` | `#fa8c16`(橙) | 边框橙 + 高亮 + ⏸ 角标 | `ClockCircleOutlined` |
| 待执行 `idle` | `#d9d9d9`(灰) | 边框灰 + 半透明 | `MinuscircledOutlined` / `○` |
| 失败 `fail` | `#ff4d4f`(红) | 边框红 + ✕ 角标 | `CloseCircleOutlined` |
| 跳过 `skipped` | `#bfbfbf`(浅灰) | 边框虚线灰 + 删除线 | `MinusOutlined` |

- 节点图:复用流程编辑器画布只读渲染(`SimplifiedProcessEditor readonly`)+ 状态着色覆盖
- 点击节点:下方显示该节点 `NodeExecution` 明细(输入/输出 JSON、时间、错误、重试次数)
- 失败节点:明细区显示 `error` + 「重试」按钮(`POST /instances/:id/nodes/:nodeId/retry`)
- 变量快照:可折叠区展示 `ProcessInstance.variables`(JSON 查看器)

### 6.3 人工任务列表

`Tabs`「人工任务」,列出当前用户待处理与已处理的审批任务。

```
┌─ 人工任务 ──────────────────────────────────────────────────────────────────┐
│ [待审批 (3)] [已审批]                                  🔍  流程[全部▾]      │
│ ┌──────────────┬──────────┬──────────┬───────────┬──────────┬─────────────┐ │
│ │ 任务名称     │ 流程     │ 发起人   │ 到达时间  │ 截止     │ 操作        │ │
│ ├──────────────┼──────────┼──────────┼───────────┼──────────┼─────────────┤ │
│ │ 合同审批     │ 客户审批流│ 张三     │ 09:00     │ 24h 后   │ [处理]      │ │
│ │ 请假申请     │ 请假流程  │ 李四     │ 08:30     │ 12h 后   │ [处理]      │ │
│ │ 报销审批     │ 报销流程  │ 王五     │ 昨天      │ 已超时   │ [处理]      │ │
│ └──────────────┴──────────┴──────────┴───────────┴──────────┴─────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- `Tabs`:「待审批」(默认,显示计数 Badge)/「已审批」
- 待审批:`Table`,列:任务名、流程、发起人、到达时间、截止(超时红色)、操作「处理」
- 已审批:增加列「审批结果」(通过/驳回)、「审批时间」
- 「处理」打开任务处理面板(§6.4)
- 数据:`GET /api/process-instances/tasks?assignee=:userId&status=pending|completed`

### 6.4 任务处理面板 `<TaskProcessPanel>`(Modal/Drawer)

```
┌─ 处理任务:合同审批 ────────────────────────────────────────────────────────┐
│ 流程: 客户审批流    发起人: 张三    到达: 09:00    截止: 24h 后            │
├──────────────────────────────────────────────────────────────────────────────┤
│ ─ 申请内容 ─                                                                │
│ ┌────────────────────────────────────────────────────────────────────┐    │
│ │ 客户名称: 客户A                                                    │    │
│ │ 合同金额: ¥50,000                                                  │    │
│ │ 合同类型: 新签                                                     │    │
│ │ 备注: 重点客户,需审批                                             │    │
│ └────────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│ ─ 审批意见 ─                                                                │
│ [请输入审批意见...                                                       ] │
│                                                                            │
│ ─ 审批操作 ─                                                                │
│ 转办给   [选择用户 ▾]              (转办时填写)                           │
│                                                                            │
│              [驳回]   [转办]   [通过]                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 形态:`Modal` `width={640}` 或 `Drawer width={560}`
- 申请内容:渲染任务表单(`formKey` 对应的表单页 Schema,只读)
- 审批意见:`Input.TextArea rows={3}`,选填(驳回时建议必填)
- 操作按钮:
  - 通过 `Button type="primary"`:`POST /tasks/:id/complete` `{ action:'approve', comment }`
  - 驳回 `Button danger`:`POST /tasks/:id/complete` `{ action:'reject', comment }`,可选拔回退到某节点
  - 转办 `Button`:`POST /tasks/:id/transfer` `{ toUserId, comment }`,需选用户
- 操作后:`message.success` + 刷新任务列表 + 若实例完成则更新状态

---

## 7. 视觉规格

### 7.1 配色方案(对齐 Studio `#1677ff` 主色)

| 语义 | 色值 | 用途 |
|---|---|---|
| 主色 Primary | `#1677ff` | 选中边框、主按钮、连线高亮、图标默认 |
| 主色浅 | `#e6f4ff` | 选中背景、节点 hover、图标块背景 |
| 主色边(浅) | `#91caff` | 节点悬停边框 |
| 成功 Success | `#52c41a` | 已完成节点、已发布状态、通过 |
| 警告 Warning | `#fa8c16` | 草稿状态、等待中节点、超时 |
| 危险 Error | `#ff4d4f` | 失败节点、驳回、删除、必填星号 |
| 页面背景 | `#f5f7fa` | Content 区、画布外区 |
| 容器背景 | `#ffffff` | 三栏、节点卡片 |
| 次级背景 | `#fafbfc` | 只读节点、占位标记、表头 |
| 边框(强) | `#eef0f4` | 三栏分隔、卡片边框 |
| 边框(弱) | `#f0f2f5` | 表格分隔 |
| 占位虚线 | `#d9d9d9` | 只读占位节点边框、空状态 |
| 文字主 | `rgba(0,0,0,0.88)` | 标题、主要文本 |
| 文字次 | `rgba(0,0,0,0.45)` | 辅助说明、ID、摘要 |

> 推荐用 `theme.useToken()` 取 AntD token。Tailwind 仅用于布局工具类,颜色走 AntD token 或上述常量。

### 7.2 节点图标与触发器类型映射

驱动 `NODE_META` / `TRIGGER_META` 常量表(单一数据源,对标 `FIELD_TYPE_META`)。节点面板图标用 `@ant-design/icons`,画布节点卡片可用彩色图标块。

**节点类型图标**(10 种,对齐 `ApaasNodeRegistries`):

| type | 显示名 | 图标 | 图标块色 | 说明 |
|---|---|---|---|---|
| `trigger` | 触发器 | `ThunderboltOutlined` | `#fa8c16`(橙) | 流程入口 |
| `start` | 开始 | `PlayCircleOutlined` | `#52c41a`(绿) | 默认开始 |
| `end` | 结束 | `StopOutlined` | `#8c8c8c`(灰) | 流程结束 |
| `object_operation` | 对象操作 | `DatabaseOutlined` | `#1677ff`(蓝) | CRUD |
| `condition` | 条件分支 | `BranchesOutlined` | `#722ed1`(紫) | if/else |
| `user_task` | 人工任务 | `SolutionOutlined` | `#13c2c2`(青) | 审批 |
| `notification` | 通知 | `BellOutlined` | `#eb2f96`(洋红) | 发送通知 |
| `http_request` | HTTP 请求 | `ApiOutlined` | `#2f54eb`(靛蓝) | 连接器 |
| `assign` | 赋值 | `EditOutlined` | `#faad14`(金) | 设变量 |
| `delay` | 延时 | `ClockCircleOutlined` | `#fa8c16`(橙) | 等待 |

> 现有节点 `info.icon` 用 emoji(`⚡🏁🔚`),可保留作为画布节点卡片内的装饰图标,或统一替换为 `@ant-design/icons` + 彩色块。推荐后者以对齐 Studio 风格。图标块:28×28 圆角 8,渐变背景 `linear-gradient(135deg, ${color}, ${color}dd)`,图标白色 18px。

**触发器类型映射**(流程卡片 + 工具栏图标块):

| triggerType | 显示名 | 图标 | 色块 |
|---|---|---|---|
| `record_event` | 记录事件触发 | `DatabaseOutlined` | `#1677ff` |
| `schedule` | 定时触发 | `ClockCircleOutlined` | `#fa8c16` |
| `manual` | 手动触发 | `UserOutlined` | `#52c41a` |
| `button_click` | 按钮点击触发 | `ThunderboltOutlined` | `#722ed1` |

### 7.3 流程状态颜色

| `ProcessStatus` | 显示名 | Tag 色 | 卡片状态标记 |
|---|---|---|---|
| `draft` | 草稿 | `orange` | `#fa8c16` 圆点 |
| `published` | 已发布 | `green` | `#52c41a` 圆点 |
| `deprecated` | 已弃用 | `default` | `#8c8c8c` 圆点 |

### 7.4 实例/节点执行状态颜色(监控)

见 §6.2 节点状态颜色标记表。`Badge` 状态映射:

| `ProcessInstanceState` | `Badge status` | 文案 |
|---|---|---|
| `running` | `processing` | 运行中 |
| `waiting` | `warning` | 等待中 |
| `completed` | `success` | 已完成 |
| `failed` | `error` | 失败 |
| `terminated` | `default` | 已终止 |
| `cancelled` | `default` | 已取消 |

### 7.5 间距 / 圆角 / 阴影规范

**间距**(8px 栅格):
- 工具栏内边距:`12px 16px`
- 节点面板搜索:`margin:12`
- 节点项间距:`Row gutter={[8,8]}`
- 画布外区 padding:`24px`(画布由 flowgram 管理)
- 配置面板表单:`padding:16`,表单项间距 AntD 默认(`size="small"` 紧凑)
- 图标与文字:`8px`

**圆角**:
- 三栏容器:无(撑满高度,边框分隔)
- 节点卡片:`8px`
- 流程卡片 / 弹窗 / 抽屉:`12px` / `16px`
- 按钮 / 输入框 / Tag:`6px`(AntD 默认)
- 图标块:`8px`(节点面板)/ `10px`(流程卡片)/ `28px`(空状态)

**阴影**:
- 节点卡片(静态):`0 1px 3px rgba(0,0,0,0.04)`
- 流程卡片(悬浮):`0 8px 24px rgba(0,0,0,0.04)`
- 选中态:`0 0 0 2px rgba(22,119,255,0.1)`
- 执行中节点(脉冲):`0 0 0 4px rgba(22,119,255,0.15)`(配合 `animation: pulse 2s infinite`)
- 吸顶工具栏:`0 1px 4px rgba(0,0,0,0.03)`
- 缩放工具浮动:`0 2px 8px rgba(0,0,0,0.08)`

**字号**:
- 工具栏流程名:`Title level={5}`(16px)
- 节点卡片标题:`Text strong` 13px
- 流程卡片名称:15px
- 表格正文 / 表单:14px(`size="small"` 时 13px)
- 辅助文字 / ID / 摘要:12px

**AntD ConfigProvider token 建议**(与 `DESIGN-object` 一致,可选补 components):
```ts
<ConfigProvider
  locale={zhCN}
  theme={{
    token: { colorPrimary: '#1677ff', borderRadius: 6, fontSize: 14 },
    components: {
      Tabs: { horizontalItemPadding: '8px 12px' },
      Table: { headerBg: '#fafbfc', headerColor: 'rgba(0,0,0,0.45)', cellPaddingBlock: 12 },
    },
  }}
>
```

---

## 8. Ant Design 组件映射 + 文件结构建议

### 8.1 AntD 组件映射

| 界面元素 | AntD / 技术组件 | 关键 props |
|---|---|---|
| 流程列表容器 | `Card` + `Row`/`Col` | `gutter={[16,16]}` |
| 流程卡片 | `Card` hoverable + `Tag` + `Space` | hover shadow |
| 状态 Tag | `Tag` | `color` 按 `ProcessStatus` |
| 新建流程弹窗 | `Modal` + `Form` + `Radio.Group` | `layout="vertical"` `destroyOnClose` |
| 编辑器工具栏 | `div` + `Space` + `Divider` | 吸顶 `position:sticky top:0` |
| 流程名称(内联编辑) | `Typography.Title` `editable` | `editable={{ tooltip }}` |
| 撤销/重做 | `Button type="text" icon` | flowgram `usePlaygroundTools` |
| 节点面板 | `div` + `Collapse` + `Row`/`Col` | `width:240` |
| 节点项(拖拽源) | `div` + flowgram create | hover 边框主色 |
| 画布 | flowgram `EditorRenderer` | `FixedLayoutEditorProvider` |
| 节点配置面板 | `div` + `Form` + `Empty` | `width:360;overflow-y:auto` |
| 配置表单 | `Form layout="vertical" size="small"` | 按 `form-meta` 动态渲染 |
| 选中节点头 | `Space` + `Typography` | 图标 + 名称 + ID |
| 类型专属配置分区 | `Divider orientation="left"` | 「审批任务配置」等 |
| 字段映射器 | `Form.List` + `Select` + `FlowValueEditor` | 键值对 |
| 条件/筛选构建器 | `Form.List` + `Select` + 动态值控件 | 复用对象 `FilterBuilder` |
| 四态值编辑器 | `Segmented` + 动态控件 + `TreeSelect` | `IFlowValue` 四态 |
| 变量路径选择 | `TreeSelect` | 候选=流程变量+节点输出 |
| 通知模版列表 | `Table` + `Tag` | 渠道 Tag |
| 通知模版编辑器 | `Drawer` + `Form` + `Form.List` | `width:560` |
| 插入变量 | `Dropdown` | 列出模版变量 |
| 模版预览 | 只读渲染区 | 示例值替换 `${var}` |
| 监控实例列表 | `Table` + `Badge` | `refetchInterval` 轮询 |
| 监控 Tabs | `Tabs` | 运行实例/人工任务 |
| 节点状态标记 | CSS `border` + `box-shadow` + 角标 | 按 `NodeExecutionStatus` 着色 |
| 人工任务列表 | `Table` + `Badge` + `Tabs` | 待审批/已审批 |
| 任务处理面板 | `Modal`/`Drawer` + `Form` | 审批/驳回/转办 |
| JSON 查看器 | `<pre>` 或 `react-json-view` | 变量快照/输入输出 |
| 危险确认 | `Popconfirm` | `okButtonProps={{ danger:true }}` |
| 全局反馈 | `message` | `success/error/warning` |
| 空状态 | `Empty` | `description` + children |
| 加载态 | `Skeleton` / `Spin` | — |
| 路由参数 | `useParams` / `useNavigate` | `appId` `processId` `instanceId` |
| 取数 | `useQuery` / `useMutation` | `@tanstack/react-query` |
| 全局状态(选中节点/历史栈) | `zustand` | `selectedNodeId`/`past`/`future` |

### 8.2 新增依赖建议

| 依赖 | 用途 | 是否必须 |
|---|---|---|
| `@dnd-kit/core` `@dnd-kit/sortable` | 字段映射器/变量排序拖拽 | **已安装** ✅ |
| `react-json-view`(可选) | 变量快照/输入输出展示 | 否 |

> flowgram.ai 已在 `features/process/simplified/` 就绪(已安装)。其余表单/表格/弹窗/抽屉由 `antd@5.29` + `@ant-design/icons@5.6` 提供。

### 8.3 文件结构建议

```
packages/studio/src/
├── pages/
│   ├── ProcessList.tsx                    # 流程列表页(卡片网格 + 新建弹窗)
│   ├── ProcessEditor.tsx                 # 编辑器容器(三栏 + 工具栏)← 重写占位页
│   └── ProcessMonitor.tsx                # 流程监控(实例列表 + 详情 + 人工任务)
├── components/process/
│   ├── ProcessEditorToolbar.tsx           # 编辑器工具栏(返回/名称/撤销/预览/发布)
│   ├── ProcessCard.tsx                    # 流程卡片(列表页)
│   ├── CreateProcessModal.tsx             # 新建流程弹窗
│   ├── simplified/                        # 流程编辑器(基于 features/process/simplified 封装)
│   │   ├── SimplifiedEditorShell.tsx      # 三栏外壳(节点面板 + 画布 + 配置面板)
│   │   ├── NodePanel.tsx                  # 左栏:节点面板(搜索 + 分类 + 节点项)
│   │   ├── NodeItem.tsx                   # 节点项(拖拽源)
│   │   ├── NodeConfigPanel.tsx            # 右栏:节点配置面板(按 type 动态渲染)
│   │   ├── FlowValueEditor.tsx            # 四态值编辑器(IFlowValue)
│   │   ├── VariablePicker.tsx             # 变量路径选择(TreeSelect)
│   │   ├── FieldMapper.tsx                # 字段映射器(对象操作/HTTP 响应映射)
│   │   └── configs/                       # 各节点配置表单(基于 form-meta + AntD Form)
│   │       ├── TriggerConfigForm.tsx
│   │       ├── ObjectOperationConfigForm.tsx
│   │       ├── ConditionConfigForm.tsx
│   │       ├── UserTaskConfigForm.tsx
│   │       ├── NotificationConfigForm.tsx
│   │       ├── HttpRequestConfigForm.tsx
│   │       ├── AssignConfigForm.tsx
│   │       └── DelayConfigForm.tsx
│   ├── notification-template/
│   │   ├── TemplateList.tsx               # 通知模版列表
│   │   └── TemplateEditor.tsx             # 模版编辑器(Drawer)
│   └── monitor/
│       ├── InstanceList.tsx               # 运行实例列表
│       ├── InstanceDetail.tsx             # 实例详情(节点状态图)
│       ├── NodeStatusOverlay.tsx          # 节点状态着色覆盖(复用画布只读)
│       ├── UserTaskList.tsx               # 人工任务列表(待/已审批)
│       └── TaskProcessPanel.tsx           # 任务处理面板(审批/驳回/转办)
├── constants/
│   └── process.ts                         # NODE_META + TRIGGER_META + 状态颜色映射
├── stores/
│   └── processEditor.ts                   # Zustand: schema/selectedNodeId/past/future
├── api/
│   └── processes.ts                       # processesApi(list/get/create/update/delete/publish + instances + tasks)
└── (路由调整) router.tsx                   # /processes 子路由(列表 + 编辑器 + 监控)
```

> 现有 `features/process/simplified/`(flowgram fork)作为底层引擎保留,`components/process/simplified/` 在其上封装 aPaaS 三栏外壳与 AntD 配置面板。`SimplifiedProcessEditor` 作为 `SimplifiedEditorShell` 的内核复用。

### 8.4 路由调整

`router.tsx` 中「流程」路由改为含子路由:

```tsx
<Route path="processes" element={<ProcessList />}>
  <Route index element={<ProcessList />} />                  {/* 流程列表(默认) */}
  <Route path=":processId" element={<ProcessEditor />} />    {/* 流程编辑器(全屏) */}
  <Route path="monitor" element={<ProcessMonitor />} />      {/* 流程监控(全屏) */}
  <Route path="monitor/:instanceId" element={<ProcessMonitor />} />  {/* 实例详情 */}
</Route>
```

> `ProcessList` 渲染列表 + `<Outlet/>`(编辑器/监控全屏覆盖)。或简化:列表与编辑器平级路由,编辑器/监控匹配时全屏。

### 8.5 StudioLayout 适配

扩展 `isFullBleed` 匹配流程编辑器与监控(当前仅匹配 `/pages/:pageId`):

```tsx
// StudioLayout.tsx
const isFullBleed = useMemo(() => {
  const segments = location.pathname.split('/');
  // 页面搭建器 / 流程编辑器 / 流程监控 → 全屏
  return (
    (segments[3] === 'pages' && !!segments[4]) ||        // /pages/:pageId
    (segments[3] === 'processes' && !!segments[4])        // /processes/:processId | /processes/monitor
  );
}, [location.pathname]);
```

### 8.6 类型声明(`api/processes.ts`)

Studio 不直接依赖 `@apaas/shared`,按 `objects.ts` 惯例以接口形式重新声明(对齐 `packages/shared/src/process/index.ts`):

```ts
export type ProcessStatus = 'draft' | 'published' | 'deprecated';
export type TriggerType = 'record_event' | 'schedule' | 'manual' | 'button_click';
export type ProcessInstanceState = 'pending'|'running'|'waiting'|'completed'|'failed'|'terminated'|'cancelled';

export interface ProcessDef {
  id; appId; processKey; name; workflowSchema: WorkflowSchema;
  version; status; triggerType?; createdAt; updatedAt;
}
export interface WorkflowSchema { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups?; globalVariable?; }
export interface WorkflowNode { id; type; meta; data; blocks?; edges?; }
export interface IFlowValue { type:'constant'|'ref'|'expression'|'template'; content?: unknown; }
export interface ProcessInstance { id; processDefId; version; state; variables; activeNodes; completedNodes; triggeredBy; startTime; endTime?; error?; }
export interface NodeExecutionStatus { nodeId; state:'idle'|'processing'|'success'|'fail'|'waiting'|'skipped'; startTime?; endTime?; error?; outputs?; }

export const processesApi = {
  list, get, create, update, delete, publish,
  // 监控
  listInstances, getInstance, retryNode,
  // 人工任务
  listTasks, completeTask, transferTask,
  // 通知模版
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
};
```

### 8.7 状态管理(`stores/processEditor.ts`)

```ts
interface ProcessEditorState {
  processDef: ProcessDef | null;       // 当前流程定义
  schema: WorkflowSchema | null;       // 当前 WorkflowSchema(编辑中)
  selectedNodeId: string | null;       // 选中节点
  past: WorkflowSchema[];              // 撤销栈
  future: WorkflowSchema[];            // 重做栈
  // actions
  setProcessDef, setSchema,
  setSelectedNode, addNode, updateNode, deleteNode, undo, redo, ...
}
```

> 自动保存:`useEffect` 监听 `schema` 变化,防抖 1s 调 `processesApi.update`(草稿)。变更前 push `past`(深拷贝 `structuredClone`)。

---

## 附:关键参考文件

- 类型契约(SSOT):[`packages/shared/src/process/index.ts`](../../packages/shared/src/process/index.ts) — `ProcessDef` / `WorkflowSchema` / `WorkflowNode` / `SimplifiedNodeType` / `IFlowValue` / `TriggerConfig` / `UserTaskConfig` / `NotificationConfig` / `HttpConfig` / `ProcessInstance` / `NodeExecutionStatus`
- 通用类型:[`packages/shared/src/common/index.ts`](../../packages/shared/src/common/index.ts) — `ProcessId` / `AppId` / `ObjectId` / `ApiResponse`
- 数据库模型:[`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma) — `ProcessDef` / `ProcessInstance` / `NodeExecution`(运行时持久化)
- 流程编辑器内核:[`packages/studio/features/process/simplified/src/SimplifiedProcessEditor.tsx`](../../packages/studio/features/process/simplified/src/SimplifiedProcessEditor.tsx) — `FixedLayoutEditorProvider` + `EditorToolbar` + `readonly`
- 节点注册:[`packages/studio/features/process/simplified/src/nodes/index.ts`](../../packages/studio/features/process/simplified/src/nodes/index.ts) — `ApaasNodeRegistries`(10 种节点)
- Schema 序列化:[`packages/studio/features/process/simplified/src/schema-serializer.ts`](../../packages/studio/features/process/simplified/src/schema-serializer.ts) — `flowToWorkflowSchema` / `workflowToFlowSchema`
- 节点 form-meta:[`packages/studio/features/process/simplified/src/nodes/*/form-meta.ts`](../../packages/studio/features/process/simplified/src/nodes/) — 各节点配置字段 schema
- 现有占位页:[`packages/studio/src/pages/ProcessEditor.tsx`](../../packages/studio/src/pages/ProcessEditor.tsx)(需整体重写)
- 布局:[`packages/studio/src/layouts/StudioLayout.tsx`](../../packages/studio/src/layouts/StudioLayout.tsx)(需扩展 `isFullBleed` 匹配 processes)
- 路由:[`packages/studio/src/router.tsx`](../../packages/studio/src/router.tsx)(新增 processes 子路由)
- API 封装范例:[`packages/studio/src/api/objects.ts`](../../packages/studio/src/api/objects.ts)(新建 `api/processes.ts` 对齐其风格)
- 对象设计器设计规范:[`docs/design/DESIGN-object.md`](./DESIGN-object.md)(视觉风格 / AntD 用法 / FilterBuilder 复用基准)
- 页面搭建器设计规范:[`docs/design/DESIGN-page-builder.md`](./DESIGN-page-builder.md)(全屏三栏 / StudioLayout fullBleed / 拖拽模式基准)
- 飞书 aPaaS 调研:[`docs/research/RESEARCH-feishu-apaas-full.md`](../research/RESEARCH-feishu-apaas-full.md) — D 节「流程引擎」为功能对标基准(触发器 / 150+ 节点 / 流程监控 / 四态值)

---

## 附:实现优先级(Phase 3 MVP 范围)

| 优先级 | 范围 | 说明 |
|---|---|---|
| P0 | 流程列表页 + 新建流程弹窗 + 流程定义 CRUD | 卡片网格、状态/版本 |
| P0 | 流程编辑器三栏 + 节点面板(10 种)+ 画布 + 节点配置面板 | 基于 `SimplifiedProcessEditor` 封装,AntD Form 重写配置 |
| P0 | 核心节点配置表单(Trigger/ObjectOperation/Condition/UserTask/Notification) | 5 种高频节点 |
| P0 | Schema 持久化 + 发布(version+1,status=PUBLISHED) | `processesApi` CRUD |
| P1 | 四态值编辑器(FlowValueEditor)+ 变量路径选择 | `IFlowValue` 四态绑定 |
| P1 | 其余节点配置(HttpRequest/Assign/Delay) | 补全 10 种 |
| P1 | 流程监控:实例列表 + 实例详情(节点状态图) | `ProcessInstance` + `NodeExecution` |
| P2 | 人工任务列表 + 任务处理面板(审批/驳回/转办) | 运行时联调 |
| P2 | 通知模版管理(列表 + 编辑器 + 预览) | 模版复用 |
| P2 | 撤销/重做 + 自动保存 + 试运行预览 | 历史栈 + 防抖 |
| P3 | 扩展节点(parallel/inclusive/loop/sub_process 等) | 按 §3.3 补全 |
