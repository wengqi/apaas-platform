# 状态矩阵 — 2026-09-27

> 承接 STATUS-MATRIX-2026-09-25。本批次：**Phase 2.12 表单页面设计器飞书对齐重构**
> （实测飞书 aPaaS v3 搭建器 → 设计器外壳 / 表单生成器 / 字段属性面板 / 大纲树 / 画布内排序）。

## 一、本批次交付清单（Phase 2.12）

| # | 能力 | 对应飞书 | 实现 |
|---|---|---|---|
| 1 | 设计器外壳对齐 | 顶栏（设置/历史/刷新页面/预览/提交）+ 左栏页签 + 960px 页面卡 | 顶栏重构（页面设置弹窗/撤销重做/刷新页面/已保存·未保存状态文案/**画布缩放移入顶栏**）；左栏「组件/大纲树」页签 + 页面列表；画布灰底 960px 白卡零占用 |
| 2 | 物料面板飞书式分组 | 常用/布局/数据展示/数据输入/通用 × 4 列图标卡 | `DESIGNER_GROUPS` 重分组（组件元数据 COMPONENT_META 不变），可折叠组头 + 搜索过滤 |
| 3 | **表单生成器** | 表单生成器弹窗（来源对象 + 字段表格 + 自动生成数据请求） | `form-generator/` 纯函数（mapping/generate，11 单测）+ `FormGeneratorModal`：字段勾选/标题编辑/输入组件映射（候选可换）/必填锁定/拖拽排序 → 生成字段节点 + 提交按钮 + `vm.record` 变量 + onSubmit=create_record 接线；入口：表单属性面板 + 表单空态文案链接 |
| 4 | **字段级属性面板** | 内容/校验/交互/风格/尺寸 分组 + form data key | `FieldPropsSections`：内容（标题/占位符/默认值/选项编辑器/行数/显示时间/多选）、校验（必填/最大长度/最值/精度）、交互（只读/禁用/隐藏）、尺寸（宽度 12 栅格 span）+ 字段 API 只读展示；PropertyPanel 重构为面包屑 + 单列滚动分组（事件/数据绑定/样式并入） |
| 5 | **画布内拖拽排序** | 节点拖拽排序 | store `reorderSibling`（同父校验）+ EditNode 接入 useSortable（胶囊握把为拖拽手柄）+ 自定义碰撞检测（画布节点拖拽只与同级节点碰撞，规避大面积放置区抢命中）；真实鼠标事件验证通过 |
| 6 | 飞书式选中工具条 | 蓝色胶囊（类型名 + 操作图标） | 胶囊工具条：握把（拖拽）+ 名称（点击选中）+ 复制 + 删除；选中 1.5px #1456f0 边框 |
| 7 | 大纲树 | 可搜索组件层级树 | `OutlineTree`：层级缩进 + 类型标注 + 搜索过滤（保留祖先链）+ 点击选中联动 |
| 8 | 共享渲染层增强 | 表单原生提交 + 字段栅格 | FormRenderer `component="form"`（原生提交 + 整表校验）；renderButton 支持 `htmlType=submit`；FormFieldItem 支持 `span`(1-12，缺省整行，向后兼容) |
| 9 | 表单页模板对齐 | — | generateFormPageTemplate 与生成器行为统一（提交按钮 + onSubmit 接线） |

**兼容性**：PageSchema/ComponentNode 契约零变更；新增 props（span/apiName/onSubmit/htmlType）全部可选，旧页面默认渲染结果不变。
**不做**（按 ADR-0002）：AI 组件/智能填表、移动端独立配置、多语、全局代码、服务端保存点历史。

## 二、质量指标（本批次后）

| 指标 | 数值 |
|---|---|
| 单元测试 | studio 119 全绿（新增表单生成器 11 项：映射/行初始化/生成结果/提交按钮） |
| E2E | 全量 Playwright 回归（含 03-page-builder / 10-demo-app 等真实 UI 路径）；另有真实鼠标拖拽排序实测通过 |
| lint / typecheck / build | 全绿（0 warning 容忍） |
| Schema 兼容 | 旧页面零迁移；演示应用资产登记页用新设计器实测（生成器重建字段 + 排序 + 属性编辑） |

## 三、文档

- 设计文档：`docs/design/DESIGN-page-builder-feishu-parity-2026-09-27.md`（飞书实测记录 + 差距矩阵 G1-G10 + 映射与验收）
- ROADMAP：Phase 2 新增 2.12 ✅ + 修订记录 2026-09-27 条目
- 知识库：`docs/knowledge-base/PAGE-DESIGNER-FEISHU-PARITY-2026-09-27.md`

## 四、已知差距（后续可选）

1. 字段半宽（span<12）暂只缩窄单行，不做左右并排（需布局引擎，飞书为绝对/弹性定位引擎）
2. 跨容器拖拽移动（当前仅同层排序）
3. 服务端保存点历史（飞书「历史记录」列表，当前为本地撤销栈 50 步）
4. 双端独立配置、多语、状态数据/代码页签（按定位暂缓/不做）

## 五、遗留问题（非本批次引入，建议单独处理）

- **THROTTLE_* 环境变量本地不生效**：`app.module.ts` 的 `ThrottlerModule.forRoot([...])` 在模块装饰期读 `process.env`，早于 ConfigModule 加载 .env——本地跑全量 E2E（15 spec 各登录一次）会触发 429（阈值回落 10/60s）。CI/Compose 因真实进程环境变量注入不受影响。建议改为 ConfigService 异步注册或 main.ts 顶部 `import 'dotenv/config'`。
