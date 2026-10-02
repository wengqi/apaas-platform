# R1.7 第二轮：画布 amis-editor 重写（2026-10-02）

> 承接 [DROP-LEGACY-RUNTIME-2026-10-02](./DROP-LEGACY-RUNTIME-2026-10-02.md)（删旧优先①），
> 本批次为②：搭建器画布切换 amis-editor，页面搭建唯一方言落地。

## 变更

- **画布唯一实现 = amis-editor**：`PageBuilder` 重写为「顶栏（保存/脏态/重置/代码抽屉/
  runtime 预览）+ amis-editor 画布」；v1 三栏画布（dnd-kit）从 UI 摘除（文件随 ③ 删除）
- **依赖**：studio 新增 amis/amis-core/amis-ui/amis-editor/amis-editor-core @6.13.0 +
  mobx@4.15.7 + mobx-react-lite@2.2.2（与 runtime-ui 同版本锁，防双 mobx——红线）
- **StrictMode 红线扩展到 studio**：main.tsx 移除 StrictMode（amis-editor 基于
  mobx-state-tree，双挂载撕毁 RootStore）
- **v1 schema 生产入口关闭**：studio PageList 建页统一产出 amis 空页 scaffold；
  gateway `generateDashboardSchema`（v1 仪表盘模板）删除，create 无 schema 时产出
  amis 空页；**create 路径补 G3 硬闸**（与 update 对齐，此前 create 不校验）
- **e2e/03 处置**：dashboard 模板断言改为 amis scaffold；6 个 v1 画布 UI 用例转
  fixme（随 ③ 物理删除）；新增「amis 画布挂载」冒烟

## amis-editor 集成踩坑（本次实证）

1. **导出形态**：amis-editor 通过 `export * from 'amis-editor-core'` 转发命名导出，
   **不转发 default**——必须 `import { Editor }`，再经本地模块转默认导出供 React.lazy
2. **pnpm 严格布局**：`amis-editor-core/lib/style.css` 样式引入要求 amis-editor-core
   为直接依赖（传递依赖不可 import）
3. **i18n-runtime 发布包损坏**：声明 `module: es/index.js` 但包内只有 `lib/`——vite
   alias `i18n-runtime → i18n-runtime/lib/index.js` 兜底
4. **构建 OOM**：amis-editor 体量巨大，vite build 默认堆上限不够——build 脚本加
   `node --max-old-space-size=8192`
5. **脏态误报**：编辑器挂载时会规范化 schema 并触发 onChange——「初始化 1s 吸收窗口」
   （窗口内 onChange 刷新基线不计脏，事件驱动无定时器），窗口外按内容比对计脏
6. **保存 payload 白名单**：gateway update DTO 只收 {name, schema, isPublished}——
   多传 type/objectId 被 class-validator 白名单 400（wire 字段名是 `slug` 不是
   `apiName`，studio PageMeta 类型已修正并标记 apiName 废弃）

## 人工验证记录（browser-use）

加载不误报脏 → 点击添加 Markdown 组件置脏 → 保存成功提示 → DB 落库含 markdown 组件；
预览链接带 slug 正确跳 runtime。

## 遗留（③）

- v1 搭建器文件树物理删除（~17k 行：组件注册表/渲染器/属性面板/store/templates）
- `isAmisPage` 方言合同退役 + G3 单路径（v1 schema 不再被接受）
- e2e/03 fixme 用例删除
