# AI 主线第六轮（R6）—— 新鲜数据驱动的生成质量优化（2026-10-16）

> 用户裁决主线 A（遥测数据驱动生成质量）。方法论：先跑新鲜生成取新数据，再按数据定向优化——
> 不盲改（R6 侦察已证实旧样本全部早于 R5 D2 指南补强，盲改无据）。

## 一、生成轮（外部 agent 姿态，HTTP 直驱 MCP）

- 通道：`/api/v1/mcp` Streamable HTTP（Bearer JWT + Accept 双类型），20 工具全可用——
  ZCode MCP 集成已禁用后，本轮证实 HTTP 直驱完全等效（ADR-0004 外部 agent 口径）。
- 场景：**办公用车管理**（新领域，对象+表单页+台账页+审批流，单波 `submit_app_drafts`）。
- 流程含本轮新特性 dogfooding：ORG 之外的角色审批（candidateGroups）、超时催办
  （dueDate 48 HOURS + timeoutAction notify）、驳回路径（rejectToNodeId→通知节点）、
  发起页绑定（startPageId）、@ref 令牌跨资源引用。

## 二、新遥测基线（本轮前后）

| 指标 | 旧（R5 期样本） | **新（含本轮 6 提交/1 批次）** |
|------|------|------|
| G3 首拦率 | 14.3%（2/14） | **10%（2/20，本轮 0/6）** |
| 一次人审通过率 | 87.5%（7/8） | **88.9%（8/9，本轮 1/1 零返工）** |
| 返工/批准版本 | 0.146 | **0.128** |

## 三、运行时闭环（TC-152 交付定义，全项 GUI 实测）

- 提交（user GUI 表单）→ 记录创建 + RECORD_CREATED 触发 + 发起人注入 ✓
- 审批（builder 任务中心）：无主任务按角色匹配可见、绑定页只读渲染申请内容 ✓
- **批准路**：意见+批准 → writeback approved → 通知「用车已批准」→ 实例 COMPLETED → 我发起的「已完成」 ✓
- **驳回路**：拒绝二次确认 → writeback rejected → 驳回通知 → 实例走 notify_reject→end COMPLETED ✓
- 台账：状态列中文标签 + 日期显示 ✓（修正后）
- 超时催办 job 已随任务调度（到点动作单测+R3 端到端已覆盖，未等 48h）

## 四、实测挖出的指南缺口（R6 核心产出）——已修复并验证

1. **台账单选列中文标签**：AI 按直觉把映射写在列的 `mapping` 键 → 渲染裸值
   （approved/rejected）。amis 渲染器实际读 `type:"mapping"` + `map` 键
   （平台生成器 page-template.ts:190 同款）。→ **方言指南补契约行 + 警告**。
2. **input-datetime 缺 valueFormat**：缺省提交 Unix 时间戳秒 → 台账/轨迹显示裸数字
   （1792456200）。→ **方言指南补契约行**。
   **勘误（2026-10-17 修缮轮）**：本节原记"平台生成器表单带 format/valueFormat（:65）"
   **失实**——当时生成器 page-template.ts:65 只有显示用 `format`，全 studio 无一处
   `valueFormat`（R6 的修复只落在该应用的存量 schema，生成器未修）。生成器与
   seed-procurement 已于修缮轮补上 `valueFormat`（同口径）。
3. 两缺口修复走完整治理链：submit_page_draft v2（PENDING）→ 人审批准 → 应用发布
   v0.1.1 → GUI 复验通过（中文标签+日期字符串+新提交 valueFormat 生效）。
   旧记录时间戳值已 API 修为字符串。

**定性**：两缺口都不是渲染器 bug——是"方言指南没教到的契约"，AI 只能按直觉写。
指南补齐后此类缺陷从源头消失（这正是 D2 指南↔G3 一致性之外的第二类缺口：
**指南↔运行时渲染契约**，本次靠实测闭环发现）。

## 五、遗留与建议

- 一次通过率/首拦率的样本仍偏小（20 提交/9 批次）——建议后续每个真实使用轮自然积累，
  遥测面板已可按 kind 下钻（PAGE 首拦旧样本 28.6% 值得盯）。
- 「指南↔运行时渲染契约」目前靠人工实测发现；可评估给 amis-page G3 增加软告警级
  （warning）规则：crud 列引用 single_select 字段却无 type:mapping、input-datetime
  缺 valueFormat——发布预检提示但不拦截（候选，未立项）。
  **→ 已于修缮轮落地（2026-10-17）**：G3 MISSING_REQUIRED warning 两规则 + 发布预检
  WARNING 通道（不拦截），端到端实测两告警命中；见
  PROCESS-ENGINE-I1-TRIGGER-SCHEMA-2026-10-17.md 与 TC-185。
- MCP HTTP 直驱时 ai-analytics 的 G3 拒绝事件含 issueCodes（traceId 串联）✓。

验证：gateway 842 + mcp 29 全绿；typecheck 过。夹具：办公用车管理应用（v0.1.1 已发布）
留作 R6 回归夹具（3 记录：approved/rejected/待审批 各一）。
