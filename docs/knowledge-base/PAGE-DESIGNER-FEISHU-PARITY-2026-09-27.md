# 页面设计器飞书对齐重构记录 — 2026-09-27

> Phase 2.12。目标：表单页面设计器功能与 UI 对齐飞书 aPaaS v3 页面搭建器（AI 能力按 ADR-0002 不做）。
> 设计文档：`docs/design/DESIGN-page-builder-feishu-parity-2026-09-27.md`（含飞书实测记录全文）。

## 一、飞书实测要点（试用环境，DOM + 截图取证）

- v3 搭建器结构：顶栏（双端/缩放/设置/历史/多语/全局代码/刷新页面/预览/提交 + 「已保存未提交」）
  + 左栏（页面列表 + 组件/大纲树/状态数据/代码 页签 + 物料面板 基础/模板/自定义）
  + 画布（灰底 + 960px 白卡）+ 右侧单列分组属性面板 + 底部（错误检查/控制台/请求时间轴/性能）。
- 表单组件 = 顶部区（标题）+ 内容区（formBody）+ 底部区（提交按钮）+ 智能填表（AI，跳过）。
- **表单生成器**：来源选对象 → 字段表格（勾选/字段/类型/标题可编辑/输入组件映射/必填勾选，
  行拖拽排序；系统字段默认不勾选、必填锁死）→「将自动生成 N 个组件以及 1 个数据请求」→ 生成表单
  （字段组件 + 自动创建 create<对象> 数据请求并接线表单「提交时」事件）。
- 字段属性面板分组：内容（默认值/占位符/数据格式/拓展标题）、交互（form data key/事件/校验/
  只读/禁用/加载中/隐藏）、风格（边框样式/步进按钮等）、尺寸（填充父容器/宽度 12 栅格/高度/边距）、
  样式（背景色/文字色/字号/字重/圆角/输入框样式/阴影）。组件路径面包屑 + 组件 ID 行内编辑。
- 画布选中：1.5px 蓝边 + 上方蓝胶囊工具条（组件名 + 数据绑定/JS + 复制 + 删除 + 隐藏）+ 左右 resize。
- 历史记录：按日期分组的服务端保存点列表（作者 + 最新保存标记）。

## 二、落地映射（飞书 → 本平台）

| 飞书 | 本平台 |
|---|---|
| 表单生成器 + 数据请求 | `form-generator/`（mapping/generate 纯函数）+ `FormGeneratorModal`；生成 vm.record 变量 + onSubmit=create_record（字段绑定 vm.record.{apiName}） |
| 字段属性面板 | `FieldPropsSections`（内容/校验/交互/尺寸）+ PropertyPanel 重构（面包屑 + 单列分组：专属配置→表单生成器→内容→校验→事件→数据绑定→样式） |
| 物料分组 | `DESIGNER_GROUPS`：常用/布局/数据展示/数据输入/通用（29 组件重排，4 列图标卡） |
| 画布排序 | store `reorderSibling`（同父）+ EditNode useSortable（胶囊握把为手柄）+ 自定义 CollisionDetection（画布节点只撞同级，规避放置区抢命中） |
| 胶囊工具条 | 蓝胶囊：握把拖拽 + 名称点击选中 + 复制 + 删除（Popconfirm） |
| 大纲树 | `OutlineTree`（搜索过滤保留祖先链 + 点击选中） |
| 页面设置 | BuilderToolbar 内 `PageSettingsModal`（名称/API名称/类型） |
| 历史 | 本地撤销栈（50 步）+ 「已保存/未保存」状态文案（服务端保存点列表不做） |
| 原生提交 | FormRenderer `component="form"` + renderButton `htmlType=submit`（整表校验后触发 onSubmit 动作链） |
| 12 栅格 | FormFieldItem `span`(1-12，缺省 12 整行) |

## 三、踩坑记录

1. **getPropAsNumber 缺省返回 0**：FormFieldItem 初版用 `spanRaw ?? 12`——0 不是 nullish，导致全部
   字段宽度被算成 1 栅格（8.33%）。修复：`spanRaw >= 1 && spanRaw <= 12 ? ... : 12`。
   教训：shared 渲染层所有 `getXxx` 缺省语义要先查实现，不要想当然 undefined。
2. **dnd-kit 胶囊整条作拖拽手柄会吞 click**：把 listeners 挂在胶囊容器上，名称点击无法选中组件
   （PointerSensor 激活约束拦截点击）。修复：独立握把图标挂 listeners，名称单独 onClick 选中。
3. **画布拖拽排序被放置区抢 over**：closestCenter 对大面积 dropzone（容器子区）距离更近，
   dragEnd 拿到 dropzone 而非兄弟节点 → 排序静默无效。修复：自定义 CollisionDetection——
   active 为画布节点时过滤 droppableContainers 只留 `source==='canvas-node'`。
4. **合成事件验证局限**：CUA drag / dispatchEvent(PointerEvent) 都无法激活 dnd-kit 拖拽
   （真实用户输入没问题——Playwright page.mouse 真实事件序列验证通过：BEFORE/AFTER 字段顺序变化）。
   验证拖拽类交互必须用可信输入（page.mouse / 真人）。
5. **THROTTLE_* env 本地不生效**（遗留，非本批次引入）：`ThrottlerModule.forRoot` 在模块装饰期读
   `process.env`，早于 ConfigModule 加载 .env；本地全量 E2E 15 个 spec 各登录一次触发 429
   （回落阈值 10/60s）。CI/Compose 注入真实进程环境变量不受影响。本地跑法：
   `THROTTLE_AUTH_LIMIT=10000 THROTTLE_DEFAULT_LIMIT=10000 node apps/gateway/dist/main.js`。
   建议后续改为 ConfigService 异步注册或 main.ts 顶部 `import 'dotenv/config'`。

## 四、验证

- studio 单测 119 全绿（新增 11 项表单生成器纯函数测试）。
- 全量 E2E（限流解除后）+ 演示应用资产登记页真机实测：生成器重建表单、字段属性编辑、
  胶囊工具条、大纲树选中、真实鼠标拖拽排序（采购日期上移两行成功）。
