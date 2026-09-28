# 页面模块对齐 — 会话交接文档（2026-09-28 收官）

> 用途：新会话/新目标接续本任务的完整上下文。SSOT 主清单：`docs/knowledge-base/PAGE-MODULE-PARITY-TASK.md`。

## 一、任务与目标

用户目标：页面搭建器对齐飞书 aPaaS v3（实测环境 cmhk-try-dev3.aedev.feishuapp.cn「调研测试应用02/页面1」），功能/交互/布局/组件数量全面对齐，AI 功能豁免。要求每批次测试全绿、提交推送、盯 CI 到全绿；上下文 70% 时交接循环。

## 二、已完成（全部推送且 CI 全绿，分支 feat/identity-cas-ldap）

| commit | 批次 | 内容 |
|---|---|---|
| f7efda2 | A | 底部调试面板（错误检查/控制台REPL/请求时间轴/性能/更多；useDebugStore + schema-issues 纯函数） |
| 24f4d59 | B | 左栏「状态数据」页签（数据请求/自定义变量增删/JS方法/组件状态/URL参数；RuntimeVmBridge 预览态运行时值） |
| 247f095 | C1 | 12 展示组件：图标/图片/标签/链接/二维码/常驻提示/数字/日期时间/人员/文件/Iframe/Markdown（+page/markdown.ts） |
| 76fb6f3 | C2 | 10 输入组件：邮箱/手机号/人员多选/关联多选/图片上传/富文本输入(v1多行)/级联×2/树形×2（+renderers-form-ext.tsx） |
| d2c4769 | C3 | 9 布局导航弹层：分页器/步骤条/折叠面板/轮播图/按钮组/平铺筛选/弹窗/侧拉窗/气泡卡片（+renderers-layout-ext.tsx；物料分组重构为飞书序） |
| 077bed6 | C4 | 10 图表：雷达/面积/散点/条形/瀑布/词云(散点气泡模拟)/组合/进度/矩阵表/指标卡组（ChartType 扩展+renderers-display-ext 追加+「图表」分组） |
| b5d422f | C5 | 筛选/排序/操作日志/树形列表×2 + 复合组件框架（useCompositesStore localStorage 持久化 + 属性面板「保存为复合组件」+ 自定义页签拖拽复用 insertSubtree） |
| 86159d3 | C6 | 业务审批 5：个人中心/系统通知/任务详情/我的任务/审批管理（vm 绑定数据模式） |
| 2a0bb8c | D | 交互补齐：快捷键（utils/designer-shortcuts.ts：Delete删除/Ctrl+Z撤销/Ctrl+Y重做）、胶囊五图标（数据绑定/事件JS定位/复制/删除/隐藏）、左右 resize 手柄（span 12栅格） |
| 8e10e95 | C7 | 收尾 6：HTML展示(DOMPurify)/JSX展示/部门选择×2(TreeSelect)/行政区划级联×2(内置34省级 region-data.ts) + 顶栏「多语」(schema.i18n 文案表) +「全局代码」(schema.globalCss/globalJs 预览与运行时注入) |
| （本批） | E1 | 富文本输入工具条：stores/rich-text-input.tsx（contentEditable + execCommand 八键工具条，DOMPurify 白名单净化写回 vm，选中态高亮 selectionchange 事件驱动，零新依赖）+ 守卫单测 6 + e2e 03 预览态真实 UI 用例 |
| （E2-1） | E2-1 | 行政区划市县级数据：page/region-data-full.ts（民政部口径 34省/342市/3056区县 + 港澳台补齐，直辖市「市辖区」规范化）+ regionOptions(level) 三层级联（province/city/district）+ 渲染器 level 属性 + studio RegionPropsSection（展示层级/占位符）+ 9 单测 + e2e 03 三级选择用例 |
| （E2-2） | E2-2 | 字段半宽并排布局：stores/field-span.ts 纯函数（显式 span > 容器列数折算 > 整行）+ FormColumnsContext（FormRenderer 注入 columns）+ FormFieldItem span<12 inline-block 流式并排 + 6 单测 + e2e 03 同行断言；表单容器「每行列数」1/2/3 列自此真实生效 |

**组件总数 86/86（去重口径）对齐完成**；物料分组=飞书序（常用/导航/布局/数据展示/数据输入/通用/弹层/图表/业务/审批）。单测 gateway 530 / studio 168 / db 42 / shared 39 全绿，e2e 61/61。

另有更早批次（本会话前段）：表单页面设计器重构（表单生成器/字段属性面板/大纲树/顶栏，commit 0d0e90b 之前数个），设计文档 `docs/design/DESIGN-page-builder-feishu-parity-2026-09-27.md`。

## 三、剩余事项（可选增强，非阻塞）

1. **双端独立配置**：移动端画布独立配置（ADR-0002 明确暂缓）。
2. **服务端保存点历史**：飞书「历史」为服务端保存点列表，本地用撤销栈(50)+保存状态文案替代。
3. **跨容器拖拽**：画布内仅同层排序。
4. **状态数据/代码页签深化**：代码页签未做；状态数据已做五分组。
5. **PR #3 已合并**（2026-09-28，merge commit 536ddb4）；E2 批次在 feat/page-parity-e-batch 分支（PR #4）推进。

## 四、关键踩坑（务必遵守）

1. **THROTTLE_* env 本地不生效**：ThrottlerModule 装饰期读 process.env 早于 ConfigModule 加载 .env → 本地全量 e2e 登录 429。本地跑法：`THROTTLE_AUTH_LIMIT=10000 THROTTLE_DEFAULT_LIMIT=10000 node apps/gateway/dist/main.js`（CI 不受影响）。根治建议 main.ts 顶部 dotenv 预加载。
2. **shared dist 时序**：改 shared 源码后必须 `pnpm --filter @apaas/shared run build` 再 typecheck studio/runtime-ui（studio 引用 dist）。
3. **getPropAsNumber 缺省返回 0**（不是 undefined）：shared 渲染层取值先查实现。
4. **dnd-kit**：拖拽手柄与点击选中分离（手柄挂 listeners）；合成事件/CUA 验不了拖拽，必须 Playwright page.mouse 真实事件；画布拖拽需自定义 CollisionDetection 过滤（只撞同级 canvas-node，否则大面积放置区抢命中）。
5. **新组件实现套路**：三包 types.ts/api/pages.ts ComponentType 同步（shared/stores/types.ts、studio/api/pages.ts、runtime-ui/api/pages.ts）→ shared renderers-*-ext.tsx 渲染器 → component-renderer.tsx RENDERERS 注册（Record 全量键，类型强制补齐）→ studio constants COMPONENT_META + DESIGNER_GROUPS → constants/pageComponents.spec.ts 守卫断言（总数+分组）→ 重建 shared → 门禁 → e2e。
6. **飞书环境**：ZCode 内建浏览器直接打开页面1 URL（有登录态）；「页面正在被编辑」弹窗点「继续编辑」；红线：不点发布/提交。
7. **测试基建**：e2e webServer 用预构建产物（gateway dist + studio vite preview）；本地手动起服务后 playwright 复用。验证拖拽用临时 spec + page.mouse。

## 五、相关文件索引

- 主清单 SSOT：docs/knowledge-base/PAGE-MODULE-PARITY-TASK.md
- 设计文档：docs/design/DESIGN-page-builder-feishu-parity-2026-09-27.md
- 重构记录：docs/knowledge-base/PAGE-DESIGNER-FEISHU-PARITY-2026-09-27.md
- 状态矩阵：docs/knowledge-base/STATUS-MATRIX-2026-09-27.md
- 记忆：form-designer-feishu-parity-2026-09-27（进度+套路+坑）、watch-ci-after-push（盯CI约定）
- 关键新代码：studio components/page-builder/{form-generator,builder-toolbar,bottom-panel,LeftPanel,OutlineTree,StateDataTab,BottomPanel}、stores/page-builder/{debug,composites}、utils/{schema-issues,state-data,designer-shortcuts}；shared stores/renderers-{display,form,layout,data}-ext.tsx、page/{markdown,global-code,region-data}.ts
