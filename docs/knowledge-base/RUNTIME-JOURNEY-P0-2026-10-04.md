# 运行态业务用户旅程 P0 — 反馈环补完（2026-10-04）

> 方法论转折点：双视角评审（产品+技术，2026-10-04）验证 ADR-0003 方向成立后，
> 主线从「AI 生成应用」（交付半截已通）切到「业务用户使用应用」（运行半截）。
> 评审结论"小白最短路径反馈环三断"构成本轮全部工作。

## 反馈环三断 → 三修

### ① 审批结果自动回写（最深断点）

- **缺陷**：小白搭"表单+审批流"最短路径，审批通过后记录状态字段永远停留原值——
  申请人永远不知道结果。
- **修复**：
  - 引擎（process-engine.ts `completeTask`）：节点决策定论后（聚合完成+令牌推进
    成功）调 `writebackApprovalResult`，经 RecordService 写内核回写触发记录
    （部分 merge + 公式/Rollup 重算 + 记录事件——记录更新触发器可被联动）。
  - 配置：`node.data.writeback = { field, approveValue, rejectValue }`；
    UserTaskConfigForm 新增「审批结果回写」段（开关+对象下拉默认取触发器绑定
    对象+字段下拉排除系统字段+单选字段渲染选项下拉存存储值）。
  - 边界：非记录触发（手动/API/定时）无 recordId 上下文→跳过留痕；回写失败
    不阻断审批推进但 logger.error 显式留痕。
  - 画布可见性：节点摘要追加 `回写: <field>`。
- **测试**：approval-semantics.spec 新增 5 用例（通过/驳回/无记录上下文/未配置/
  失败不阻断）；引擎构造器新增第 7 参（RecordService forwardRef），三个 spec
  助手同步补 mock。

### ② 表单页成对生成台账页

- **缺陷**：新建页面向导只引导表单页，申请人提交后没有任何地方看进度。
- **修复**：CreatePageModal 表单页+关联对象时默认勾选「同时生成台账页」；
  PageList.createMutation 成对创建（`<slug>_ledger`，buildPageTemplate
  list_page），台账失败不回滚主页面、显式提示手动补救。
- **打磨**：台账单选/多选列加 amis `mapping`（此前显示存储值 approved），
  中文标签已验证。

### ③ 审批人体验

- **绑定表单渲染修复（同族契约断裂第三现）**：UI 把审批页绑定写入
  `formKey`——引擎 getTask 读 `pageId`，**UI 搭建的流程审批页绑定一直静默
  失效**（seed/MCP 流程写 pageId 所以 e2e 全绿——降级路径无反向用例的教训
  再现）。修：UI 改写 `pageId`（契约对齐），getTask 保留 formKey 回退修在途
  实例冻结 schema。
- **流程变量折叠**：11 行原始 JSON 曾全量铺在审批动作之前；改 antd Collapse
  默认收起（"流程变量（技术详情）"）。
- **创建人姓名**：getTask 解析 `created_by` → `recordCreatorName`，申请内容
  不再显示裸 cuid。

## 端到端实测（全绿）

提交"无线鼠标"→ 实例 WAITING_USER_TASK → 审批弹窗（绑定表单渲染+变量收起）
→ 批准 → 实例 COMPLETED → **记录 `{"status":"approved","gift_name":"无线鼠标"}`**
→ 台账显示「已批准」中文标签。修复前记录（机械键盘）无 status，前后对比清晰。

## 同批修复（评审按钮级缺陷，详见 full-review-2026-10-04 记忆）

runtime 预览跨域（VITE_RUNTIME_BASE_URL）/ 流程预览死按钮（ProcessPreviewModal）/
通知模板双层契约断裂（bodyTemplate + variables @IsArray）/ BUILDER 补
DATA_MODEL:EXECUTE / 行级权限 appId 贯穿 / 监控详情弹窗错误态 / 云函数骨架
预填 / studio 25 处 onError 透出后端消息 / runtime 404 语义文案。

## 遗留（下轮）

- 审批弹窗绑定表单建议过滤为详情页或只读渲染（绑提交表单时审批人可再提交）
- R10 裸 cuid 多处（监控触发者/环境操作人/审核中心提交人）+ 审核中心 UTC 显示
- 三个拦路虎：附件存储（MinIO）/ 全局选项集 / 身份对接 R1.1 落地
- 技术治理并行约束：ALS fail-closed → 锁看门狗 → k6 压测（多副本部署前必须）
- dev 环境预览语义产品化（预览=发布到 dev 或恢复活表兜底，待决策）
- 工具坑：ZCode evaluate 把多语句箭头函数当表达式不求值（探针必须 IIFE 表达式）
