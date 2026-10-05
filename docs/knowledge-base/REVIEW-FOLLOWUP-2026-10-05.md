# 评审遗留缺陷清零（第一轮）— 2026-10-05

> 分支 `fix/review-followup-2026-10-05`。上游输入：2026-10-04 双视角全面评审遗留清单
> （memory: full-review-2026-10-04）+ AGENTS.md「下轮」项。
> 方法论：**先核实后修复**——每项先对照当前代码逐条比对（两分支合并后部分结论已过时），
> 再用运行中服务做 API 实测与浏览器回归，确认属实才动代码。

## 一、核实结论（修复前逐项比对）

| 项 | 评审原始描述 | 核实结果 |
|---|---|---|
| A | 表单模板不过滤工作流字段 | ✅ 实锤。`page-template.ts businessFields` 只排系统字段；礼品申请对象 `status`（single_select，pending/approved/rejected）经 API 实测确认会进提交表单 |
| B | 角色审批 UI 硬限单人 | ⚠️ 部分过时：会签/或签已于 10-03 对 USER 类型暴露；**SEQUENTIAL（依次）引擎支持（`user-task.executor.ts` sequentialIndex + completeTask 推进）但 `APPROVAL_MODE_OPTIONS` 从不暴露**，`isMultiApprover` 里的 SEQUENTIAL 分支是死路径 |
| C | 审批弹窗绑定表单可再提交 | ✅ 实锤。`TaskCenter` 按 `boundPageId` 原样渲染 `ApprovalPageRenderer`，无只读处理，amis form 默认 actions 就是提交按钮 |
| D | 审计页 403 静默空态 | ✅ 实锤+实测复现。`audit-log.controller.ts` 类级 `TenantAdminGuard`；`AuditLogs`/`AppAuditLogs` useQuery 无错误态。实测 builder→`HTTP 403 需要管理员权限`（admin 对照 200） |
| E | 裸 cuid + UTC 时间 | ✅ 实锤。ReviewCenter 提交人/时间、ProcessMonitor 触发者/发起人、Environments 操作人/两处时间、AuditLogs 用户列；UTC 根因 = `v.replace('T',' ').slice(0,19)` 字符串截断 ISO（无时区转换），全局扫出 6 处 |
| F | 画布配置面板遮挡保存按钮 | ✅ 实锤。`ConfigSidebar` 在 `CanvasColumn`（relative+overflow:hidden）内部却用 `position:fixed; top:0; zIndex:1000; width:480` 全视口浮层，盖住工具栏右侧保存/发布 |
| G | logout 下拉残留 DOM | 未修。本轮浏览器实测**标准退出路径未复现**（退出后无可见 `.ant-dropdown` 残留、登录表单正常接收点击）；保留观察 |
| H | 发布向导把"新建应用"归入页面组 | ✅ 实锤。`application.service.ts` 四处应用级 ChangeLog 误标 `module:'PAGE'`（entityType 'Application'）；前端 `moduleLabels` 亦无 APPLICATION |

## 二、修复清单（7 项）

1. **A 提交表单排除流程回写字段**：`page-template.ts` 新增 `collectWritebackFields`（unknown 防御式收窄，不与 WorkflowSchema 具体类型耦合）+ `buildPageTemplate` 第四参 `excludeFields`（仅 form_page 消费；台账 list_page 不过滤——台账正要展示审批状态列）。`PageList` 建表单页前拉取应用全部流程 schema 提取回写字段，排除时 toast 提示业务标签。**排除范围=应用级是正确语义而非疏漏**：ProcessDef 触发器只按 triggerType 全应用匹配（无对象绑定列），审批后回写的对象就是"触发记录"——任何对象的表单都可能喂出触发记录，跨对象字段重名（status）同样受保护。**方言层防线未动**：AI 生成的表单仍可能包含回写字段，属下轮 amis 方言指南补强项。
2. **B 暴露依次审批**：`APPROVAL_MODE_OPTIONS` 增加 `SEQUENTIAL`；nodeMetadata 摘要经 `toOptionLabel` 复用数组自动生效。
3. **C 审批查看态**：runtime-ui 新增 `approval-readonly.ts` `makeAmisPageReadonly`（深拷贝；form→`static:true`+actions 清除 submit/reset 且显式置空数组防 amis 默认提交按钮；crud→features 去 create），`ApprovalPageRenderer` 渲染前统一变换。绑定页面无需强制改成详情页。
4. **D 审计显式错误态**：`AuditLogs`/`AppAuditLogs` useQuery 解构 `error/isError`，失败渲染 Alert（服务端 message + 重试），不再静默空表。
5. **E 裸 ID/UTC 收敛**：新增 `utils/user-display.ts`（`useUserNameMap` 复用 qk.users 缓存 / `displayName` 未命中回退原值兼容服务身份 / `formatDateTime` dayjs 本地时区）。应用点：ReviewCenter、ProcessMonitor 列（签名加 userNameMap）、Environments、AuditLogs、VersionHistoryModal、ProcessCard、ApiKeys。
6. **F 面板定位**：`ConfigSidebar` `fixed`→`absolute`——父容器 CanvasColumn 本身 relative 且面板尺寸不超出容器，无裁剪回归（BUG-05 的根因是 body portal 事件委托，非定位方式），只盖画布不盖工具栏。
7. **H APPLICATION 模块**：shared `ChangeSet` module union + `changelog.service` union + `application.service` 四处 → `'APPLICATION'`；`PublishWizard` moduleLabels 补"应用"。已落库历史行不改（零兼容原则）。
8. **收尾**：审批弹窗裸 cuid 任务 ID 从主信息区移入"流程变量（技术详情）"折叠区（评审项 #2 最后一处）。

## 三、验证证据

- **单测**：page-template.spec +5（回写字段提取/表单过滤/台账不过滤/全排除边界）；approval-readonly.spec +5（static/清 actions/默认按钮防复发/crud/嵌套 tabs/非对象输入）；publish-services.spec +1（APPLICATION 分组）。全仓 gateway 723 / studio 124 / runtime-ui 20 / db 55 / shared 17 全绿；typecheck/lint 全绿。
- **API 实测**（修复前取证）：builder `GET /audit-logs` → 403 `需要管理员权限`；admin → 200；礼品对象字段实锤 status single_select。
- **浏览器回归**（vite preview + 重建 dist）：
  - D：builder 打开应用内审计页 → 显式 Alert"审计日志加载失败/需要管理员权限/重试" ✅
  - F：流程编辑器选中节点 → 配置面板顶边从工具栏下方开始，保存/发布按钮可见可点 ✅
  - B：审批人类型=指定用户 → 审批模式下拉四项含"依次(按顺序逐个审批)" ✅（未设置类型时仍过滤为单人——既有联动正确）
  - C：真实提交礼品申请→admin 任务中心开弹窗 → 绑定表单查看态渲染（无提交按钮），批准/拒绝决策按钮正常 ✅
  - G：退出登录后无 `.ant-dropdown` 残留、登录表单可点（未复现，不修）✅

## 四、遗留 / 下轮

- **审批弹窗数据域映射 UX**：绑定页为提交表单时，控件 name 与流程变量顶层 key 不对齐会显示"-"（本轮截图实测），申请内容仍靠下方结构化区兜底——与"绑定详情页建议"同属审批页绑定体验，待产品化。
- **方言指南补强**：amis_page 方言指南应教 AI"提交表单不得包含流程回写字段"（对 AI 生成路径的防线）。
- **G logout 残留**：标准路径未复现；若再现按"Dropdown popup 容器随路由卸载"排查。
- **a11y**（amis 表单 accessible name）：低优先级保留。
- **E2E**：本轮以单测+浏览器手工回归覆盖；反馈环 e2e（驳回分支+回写+通知断言）仍是上轮遗留建议。

## 五、工程坑

- `rg SEQUENTIAL` 搜不到引擎支持——引擎统一小写 `sequential`（面板大写经 `toLowerCase()` 归一化），跨层搜枚举先确认大小写口径。
- studio 构建再次 Abort trap 6（16GB 机器、默认堆）——`NODE_OPTIONS=--max-old-space-size=6144` 后 81s 通过；与 [[studio-build-heap-override]] 同源。
- TS 数组协方差：`WorkflowNode[]` 不能赋给 `WorkflowNodeLike[]`（data 类型方差）——跨类型纯函数参数用 unknown + 运行时收窄，别建"最小结构"接口硬碰具体类型。
- 关联 [[full-review-2026-10-04]] [[roleplay-journey-r2-2026-10-03]] [[qa-ux-review-2026-10-03]]。
