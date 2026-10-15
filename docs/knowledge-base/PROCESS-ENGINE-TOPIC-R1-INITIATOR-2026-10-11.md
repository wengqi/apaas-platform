# 流程引擎专题 R1：发起人能力（A3 + A1）实现记录

> 日期：2026-10-11 ｜ 分支：`feat/process-engine-topic-r1`（基于 fix/runtime-task-center-2026-10-10 HEAD）
> 台账：`docs/knowledge-base/PROCESS-ENGINE-BACKLOG-2026-10-11.md`（A3→C6、A1→C7 已移档）
> 方法：TDD——4 处失败单测先行（红）→ 实现 → 全绿（gateway 40/40、shared 8/8）

## A3 MANUAL 启动注入发起人

- **缺陷**：`ProcessService.startInstance` 的 triggerContext 仅取调用方显式传入（原 `req.triggeredByUser ?? null`），而 studio 手动启动只传 `{processKey, variables}` → UI 启动的实例无发起人：「我发起的」（`GET /instances/mine`）不可见、审批定论兜底通知无收件人、INITIATOR 节点无发起人可用。
- **修复**：服务端注入——`triggeredByUser = req.triggeredByUser ?? callerUserId ?? null`（显式传入优先；用户身份上下文兜底；内部调用 null 兼容）。
  - `process.service.ts` startInstance 增加第 4 参 `callerUserId`；
  - `process.controller.ts` 传 `req.user.id`；
  - **OpenAPI 不受影响**：`open-api.controller.ts` 直调 `engine.startProcess`（不经过本方法），服务身份场景保留显式语义。
- **单测**：`process-start-instance.spec.ts` 三路——显式优先 / 兜底 callerUserId / 两者皆无 null。

## A1 INITIATOR 发起人审批人类型（四件套 + 指南）

- **契约**：`packages/shared/src/process/index.ts` 新增 `UserTaskAssigneeType`（USER/ROLE/ORG/SUPERVISOR/FORM_FIELD/INITIATOR），`UserTaskConfig.assigneeType` 显式化——UI 此前已写该字段但契约未声明、引擎未消费；显式化同时为 A2（ORG/SUPERVISOR/FORM_FIELD 接线）铺路。
- **执行器**：`user-task.executor.ts` 读 `data.assigneeType`（大小写归一），INITIATOR 时受理人 = `instance.triggerContext.triggeredByUser`；**缺失报清晰错误**（不静默创建无主任务——防复现 #12 流程挂起），错误信息提示定时/API 触发需显式传发起人。
- **G3 校验器**：`workflow.validator.ts` validateUserTask——`isInitiator` 短路放行 single 模式（无 assignee/candidateGroups 不再报错）；非 INITIATOR 回归对照不变。
- **node-check**（跨端 SSOT）：`hasAssignee` 增加 `assigneeType === 'INITIATOR'`——画布标红与发布预检一致放行。
- **studio**：`UserTaskConfigForm.tsx` 下拉新增「发起人」（次位），与 SUPERVISOR 同走免填路径；approvalMode 自动限单人；节点副标题经 `nodeMetadata` 复用 ASSIGNEE_TYPE_OPTIONS 自动获得中文标签。
- **方言指南**：`mcp-server.factory.ts` workflow 指南补「发起人审批（INITIATOR）」节（三种触发路径的发起人来源 + 适用场景），指南↔G3 一致性测试不受影响（未新增规则码）。
- **单测**：executor 两路（受理人=发起人 / 缺失报错）+ validator 放行与回归对照 + node-check INITIATOR 完整性。

## 活文档同步（同提交）

- `docs/testing/TEST-CASES.md`：TC-173（A3）/ TC-174（A1）入库，变更记录 v1.6（2026-10-15 rebase 轮改号：原编 TC-159/160 与 main 嵌入/impeccable 轮撞号）；
- `docs/testing/QA-TEST-PLAN-PROMPT.md`：矩阵 2 user_task 行 assigneeType 5→6 种；
- `PROCESS-ENGINE-BACKLOG-2026-10-11.md`：A1/A3 移入 C6/C7，排序更新为 A2→S1/S2→B→D；
- `AGENTS.md` 当前阶段：专题状态 📋→🔄，新增 R1 收官条目。

## 验证与遗留

- 红绿证据：4 failed（A3 兜底/executor ×2/validator INITIATOR）→ 全绿；回归对照用例（显式传入、null 兼容、非 INITIATOR 拦截）全程绿。
- **A2 未在本轮处理**：ORG/SUPERVISOR/FORM_FIELD 引擎端仍未接线（UI 写入的编码/字段名仍会被当用户 ID 字面用）——按台账排序下一轮先实测（E2）再裁决实现或摘除；assigneeType 显式化契约已就位。
- **S1/S2 未启动**：超时边界与失败处理策略按台账 G 节待排期。
