# SPIKE-AMIS-ADOPTION-2026-09-30 — R1.S 两项准入 Spike 结果

> 结论：**双通过，P0 准入（GO）**。证据截图见 `docs/knowledge-base/assets/spike-amis-2026-09-30/`。
> Harness：`/tmp/amis-spike`（vite + React 18 + amis@6.13.0，仓库外，不污染 monorepo 依赖）。

## S1a — amis antd 主题视觉贴合度：通过

- **方法**：同一批 schema 在 `theme: 'antd'` + `locale: 'zh-CN'` 下渲染，覆盖表单控件（nested-select 级联 / tree-select / date-range / radios / switch / input-table 明细 / input-file / input-number 千分位 / textarea / visibleOn 条件显隐）、tabs、crud（筛选+表格+mapping 列）、chart（bar+line）、dialog、drawer、static 查看态。
- **证据**：`shot-antd.png`（首屏表单+查看态+台账）、`s1a-battery.png`（组件面三 tab）、`s1b-case3.png`（审批任务页）。
- **判定**：控件、主色按钮、空态插画、弹窗、必填星号均为 AntD 视觉风格，**达到生产级贴合**；中文 locale 正常。页面零报错（仅 React 18 `findDOMNode` 弃用警告，无害）。

## S1b — LLM 生成 amis schema 合法率：首过 4/5（80%），一轮反馈修正后 5/5（100%）

- **方法**：模拟 AI Agent 一次性生成 5 个采购合同验收场景的页面 schema（提交页/台账 CRUD/审批任务页/详情页/供应商管理页），两种机判手段：① 官方 `amis/schema.json`（draft-07，950KB）+ ajv；② 渲染器 DOM 错误块扫描（"找不到对应的渲染器"/inline Error 块）+ pageerror。
- **数字**：ajv 全 FAIL（原因见下）；**渲染器机判首过 4/5，唯一失败（`static-file`）按错误块给出的 schema 路径一轮修正后 5/5**。
- **重要发现 1：官方 schema.json 与渲染器实际接受度不一致**——对合法的 `type` 字段报 `additionalProperties` 等误报，**不能直接用作 G3 校验合同**。G3 校验器必须自建：以渲染器实际行为为真值 + 平台约束子集（绑定字段存在性、API 域名白名单、动作类型白名单）。
- **重要发现 2：渲染错误只进 DOM 不进 console**——错误块自带 schema JSON 与路径（如 `page/body/0/form/3/static-file/field`），对 agent 自修正闭环极其友好；机判脚本必须扫 DOM。

## 语料陷阱清单（few-shot 示例库第一批）

1. 级联控件是 `nested-select`（不存在 `input-cascader`）；amis 文档文件名折叠连字符但类型名保留（`nestedselect.md` → `type: "nested-select"`、`treeselect.md` → `tree-select`）。
2. `static-file` 不可渲染 → 查看态附件用 `input-file` + `"static": true`。
3. `static: true` 的表单会自动追加"提交"按钮 → 需显式 `"actions": []`。
4. 表格/CRUD 取数用表达式 `'${rows}'`，裸字段名 `rows` 取不到。
5. 官方 schema.json 不可机判（见上）。

## 集成红线（S2 引入 packages/runtime-ui 时必带）

- `amis@6.13.0` 锁版本 + **`mobx@4.15.7` + `mobx-react-lite@2.2.2` + `react-is@18`**（amis 声明 `mobx ^4.5.0` 但代码隐式 import `mobx-react-lite` 未声明；mobx 6/7 与 4 混用即崩 "multiple versions of MobX active"）。
- **React 18 下必须去掉 StrictMode**（双挂载撕毁 amis MST RootStore）。
- 主题/语言引入：`amis/lib/themes/antd.css` + `amis-ui/lib/themes/antd` + `amis-ui/lib/locale/zh-CN`；`render(schema, {}, { theme: 'antd', locale: 'zh-CN' })`。

## 偏差声明（诚实口径）

- 生成者（LLM）已吸收 S1a 的两条反馈（source 表达式、static 按钮），首过 80% 偏乐观；**冷启动真实合法率在 G4 MCP 上线后用真实 agent 回路复测**。
- 蓝图 S1 中"vs 自有 PageSchema 对比"降级为定性结论：自有 v1 方言无机器校验器（这本身佐证了换方言的动机），amis 侧绝对合法率已达门槛，对比项不再阻塞判定。

## 判定

**GO**：按蓝图 P0 立项——S2（runtime-ui 引入 amis + 审批页面渲染链路）→ S3（R1.3 审批语义）→ S4（采购合同应用骨架）→ S5（e2e）。依赖引入遵循项目红线：说明理由 + 更新 lockfile + PR 标注。
