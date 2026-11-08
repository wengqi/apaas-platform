# R-B 批 2 实现记录：functional 波次③ 引擎语义簇（2026-11-08）

- 依据：R-B 裁决轮（2026-11-08）+ 工单档 `ADVERSARIAL-REVIEW-PROCESS-FUNCTIONAL-2026-10-28.md` 波次③（3.4 引擎语义簇，TDD 红先行）
- 范围：functional-04（子流程透传触发上下文）+ functional-02b（超时动作失败显式处置）+ RES-01 悬挂实例收口

## 一、交付内容

**functional-04（子流程透传触发上下文，TC-251）**：
- `sub-process.executor.ts` 构造子实例 triggerContext 时继承父实例的 `triggeredByUser` / `record` / `recordId`（父有则传、无则不传）——子流程内 INITIATOR（发起人审批）、FORM_FIELD（记录字段审批人，user-task.executor 读 `triggerContext.record`）、审批回写（引擎读 `triggerContext.recordId`）三类语义在子流程可用；
- 父实例无来源（定时/API 触发）不透传：子流程 INITIATOR 报清晰错误「实例无发起人（triggerContext.triggeredByUser 缺失）」属合理边界（工单明示）；
- 头注释勘误：摘除 `inputMapping` 失实声明，改为「变量经 inputs 透传，父实例发起人/触发记录随 triggerContext 继承」；显式 inputMapping UI 留观察（◆2 附带确认，YAGNI）。

**functional-02b（超时动作失败显式处置，TC-252）**：
- `process-engine.ts` handleTaskTimeout 的 completeTask catch 分支从「error 日志 + break 静默悬挂」升级为显式失败处置：**NodeExecution FAILED 留痕**（S2 语义，error 含任务 ID 与原因）+ **剩余 PENDING 任务 CANCELLED** + **实例 FAILED**——对齐「无 error 出边则实例 FAILED」聚合语义，消除「任务永久 PENDING、实例永久 WAITING」；
- 典型失败场景：AUTO_REJECT 无 rejectToNodeId（存量配置；增量自 R-B 批 1 functional-02a 起发布预检硬拦）。

**RES-01 收口**：对抗审查遗留悬挂实例 `cmvrx63oj03wllj1jp8gmzdog`（functional-02 复现产物）经运行面 cancel API 处置 → TERMINATED（连带 PENDING 任务取消）。

## 二、验证

- TDD 红→绿：approval-semantics 1 例（三断言：NodeExecution FAILED / 任务 CANCELLED / 实例 FAILED + error 含任务与原因）+ node-executors-advanced 3 例（手动/记录两路透传 + 定时不透传）；process 域 247/247、全量 `pnpm test` 11/11、typecheck 11/11、e2e 全量 **99/99**。
- 实测：RES-01 悬挂实例 cancel API → TERMINATED（结果可见）。
- 无 GUI 变更（引擎语义层）；超时失败处置的运行时可视化（实例列表 FAILED 态+error 文案）属既有监控页能力，TC-252 断言为数据层。

## 三、踩坑

- 挂具顺序坑：`handleTaskTimeout` 循环的「取待处理任务」findFirst 在 try **外**——mock 队列必须先给循环首查 `mockResolvedValueOnce(pendingTask)`，再让 completeTask 内首查拒绝，否则拒收落在 try 外直接炸测试（红测试自身假失败一次）。
- 02b 的实例 FAILED 未设 `finishedAt`（与 :556 S2 既有 setter 口径一致）；analytics 按状态统计不受影响。

## 四、批次状态

- functional 波次①②③ ✅（批 1 d7699a7 + 批 2 本提交）；余波次④（functional-06 任务列表契约，◆3=A 权限面）⑤（functional-03 condition 实现+event 摘除）⑥（functional-08 加签/撤回/转办入口）+ S-01 脏配置扫描脚本；PE-01~32 七波次（开工先读 ADR-0007 与波次依赖 ②×③、④×⑤）。
- TC-251~252 入库 TEST-CASES v3.8（X 节）；QA-PLAN v1.0.23。
