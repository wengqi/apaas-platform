# 流程引擎专题 R3 —— S1 审批超时边界 + S2 失败处理 + §8.1 顺手项（2026-10-15）

> 分支 `feat/process-engine-r3-s1-s2`（基线 main=3917978，PR #31 合并后）。
> 范围来源：台账 G 节（Appsmith 对标 S1/S2 裁决）+ OSS 对比研究文档 §8 采纳清单 + F 节 explain 缝隙。

## 交付清单

### S1 审批超时边界（timer boundary 轻量版）

- **契约**：`UserTaskConfig.timeoutAction`（`NOTIFY` 催办 / `AUTO_APPROVE` 自动通过 / `AUTO_REJECT` 自动驳回），
  与既有 `dueDate`（数值）×`dueUnit`（秒/分钟/小时/天，缺省小时）配套；缺省无动作（dueDate 仅展示）。
- **引擎**：`scheduleTaskTimeout`（BullMQ delayed job，jobId=`task-timeout-<批次>` 幂等可取消）→
  `handleTaskTimeout`（到点且任务仍 PENDING 时：AUTO_* 逐个以系统身份 `completeTask`
  ——**复用单人/会签/或签/依次聚合与推进语义**，驳回走 rejectToNodeId 既有路径；循环按初始待处理数封顶；
  NOTIFY 对待处理受理人发催办站内信）；`cancelTaskTimeout`（completeTask 后批次无 PENDING 即取消，尽力而为）。
- **执行器**：dueDate>0 且配 timeoutAction 时按单位换算毫秒调度；仅 dueDate 不配动作不调度。
- **Worker**：delay 队列新增 `task_timeout` 分发（从任务行恢复租户上下文，批次已删幂等返回）。
- **G3**：auto_reject 要求 rejectToNodeId（含目标节点存在性）+ 枚举校验——发布预检拦坏配置。
- **UI**：搭建面板截止时间下新增「超时动作」下拉（催办/自动通过/自动驳回，含语义提示文案）。
- **端到端实测**：dueDate=5 秒 AUTO_APPROVE → 到点任务自动批准（意见「超时自动通过」）→ 实例 COMPLETED。
  转交升级（第四种动作）本轮不做，台账留观察。

### S2 失败处理（错误出口路由轻量版，§8.2 裁决语义）

- 节点执行失败时若有 label 为 `error`/`失败` 的出边：令牌路由到该分支（补偿/通知/回写由搭建者
  显式画节点），**实例不失败**；NodeExecution 仍留痕 FAILED（错误信息不因路由掩盖）。
  无 error 出边维持实例 FAILED（既有行为）。与 wait_for_condition 的 timeout 出边同构。
- v1 限制：error 出边为**约定式**（边 label 手工命名），画布暂无专用 error 边 UI 入口——
  API/AI 生成 schema 可直接用；画布编辑入口留待后续轮。

### §8.1 采纳三顺手项

1. **边走向留痕**：路由决策（nextNodeIds）落 `NodeExecution.output._routing`——C1 类"为什么走这条边"
   事故可事后归因；TraceViewer 已有 output 消费面。
2. **retryable 分类**：`NonRetryableNodeError`（配置/校验类确定性失败）在 process worker 捕获后不再
   重试，杜绝 `attempts: 3` 空转；user-task 执行器 11 处校验错误转确定性失败。声明式重试 policy 仍不做（§8.2）。
3. 事故 schema fixture 契约测试（✅2）按原排期未并入本轮。

### F 节缝隙：explain() 按 app 域过滤规则

app 级规则（appId 非空）此前不参与过滤——B 应用的「应用级通配规则」会被判到所有应用资源上
（check 与调试 explain 共用路径）。修复：explain 按目标资源自解析所属应用（APPLICATION=targetId、
PAGE/RECORD/PROCESS 查资源表），规则查询加 `OR[appId null ∪ 本应用]`；租户级规则与查不到资源的
行为不变（存量数据零变化）。listVisibleForUser 早已按 appId 归纳，两个权限面语义归一。TDD 5 用例。

## 实测挖出并修复的两个真问题（端到端 5 秒超时实测）

1. **BullMQ jobId 禁止冒号**：`task-timeout:<id>` → `Custom Id cannot contain :`，调度即抛错实例 FAILED。
   改连字符分隔。
2. **超时 job 自我取消死锁**：completeTask 尾部取消超时 job 时，该 job 正被超时 worker 执行 →
   `remove()` 抛 locked by another worker，异常中断审批尾部（任务已批但令牌未推进）。
   取消改尽力而为（try/catch 静默）——delayed job 到点后由幂等 handleTaskTimeout 兜底，重复触发无害。

## 测试与验证

- gateway 842 单测全绿（新增 S2 三用例+路由留痕+S1 调度换算三用例+超时处理三动作/幂等/取消钩子等 15 用例）；
  typecheck（gateway/studio/shared）全过；explain TDD 5 用例。
- 端到端：超时自动通过全链路（API 造流程→发布→启动→5s 到点→自动批准→COMPLETED）实测通过；
  GUI 走查：画布配置面板「超时动作」字段渲染+值回显正确（已发布只读态）。
- AUTO_REJECT/NOTIFY 的运行时动作为单测级验证（复用 completeTask 既有驳回/通知路径），未逐条 GUI 实测
  ——AUTO_REJECT 走的驳回路径与 R5.5 e2e 同源，NOTIFY 站内信链路与通知节点同源。

## 夹具残留

- 本地 dev 库报销应用内「超时边界实测」流程已删除；其两个 FAILED 实例（修复前产物）留库无害。
- dev 库零应用级规则，explain 修复对存量行为无变化（理论缝隙→已闭合）。
