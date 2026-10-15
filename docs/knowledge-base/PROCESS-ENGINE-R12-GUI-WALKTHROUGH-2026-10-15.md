# 流程引擎专题 R1/R2 推送轮 —— 推送前 OCR + GUI 走查记录（2026-10-15）

> 分支 `feat/process-engine-topic-r1`（R1 发起人能力 + R2 动态审批人 + 推送前闸门轮）。
> 前置：rebase 到任务中心分支（PR #30，已先合并 main=ffca8ef）+ TC 改号补录（TC-173~176，
> 原 TC-159~162 与 main 嵌入/impeccable 轮撞号）。

## 一、OCR 评审（委托模式，推送前）

范围：`fix/runtime-task-center-2026-10-10...HEAD` 全部 8 个可评审代码文件 + spec。

| 级别 | 发现 | 处置 |
|------|------|------|
| Medium | FORM_FIELD 审批人只校验值非空字符串，不校验用户存在——非空垃圾值会创建无主任务静默挂起（#12 同教训），与 ORG 分支的成员数校验不对称，且与 TC-176 声称语义不符 | ✅ 已修：executor 补 `prisma.user.findFirst`（租户隔离条件），值无效报清晰错误；新增第 4 路单测+成功路断言租户条件；方言指南同步（858cad3） |
| Low | 我发起的列表固定 page=1/50 无截断提示（待办/已办有） | 记录不阻断 |
| Low | status 查询参数直传 cast（与既有 listInstances 同模式） | 非新缺陷 |

无 High/Critical。

## 二、GUI 黑盒走查（TC-173~176，全浏览器实测）

环境：本地 gateway(dist)/studio(5173)/runtime(5174)，builder/user 双账号。
夹具：报销单对象加 `next_reviewer`(user) 字段（API 夹具准备）；user@apaas.dev 加入 QA补测部门（admin API）。

### 通过点

| 用例 | 断言 | 结果 |
|------|------|------|
| TC-174 配置面 | 审批人类型下拉恰 5 项（指定用户/发起人/指定角色/指定组织/表单字段），**无上级主管**（R2 摘除落地）；选「发起人」后审批人选择器消失（免填） | ✅ |
| TC-175 配置面 | 选「指定组织」出现组织下拉，列出真实组织树；选「表单字段」输入框 placeholder=「输入触发记录的字段 apiName（如 legal_reviewer）」 | ✅ |
| TC-174 预检 | INITIATOR 节点（无审批人）预检**暂无问题**，画布标红清除（补选审批模式后）；发布成功 | ✅ |
| TC-173 手动启动 | studio 流程列表「启动实例」→ 实例出现在 builder runtime「我发起的」（审批中）——A3 修复前 triggeredByUser=null 失联 | ✅ |
| TC-174 运行时 | 手动实例「发起人确认」任务出现在 builder（发起人本人）待办；批准成功（待办 36→35）；记录实例的「发起人确认」派给提交人 user | ✅ |
| TC-175 运行时 | 组织成员 user 待办可见「组织复核」并批准（两实例）；**非成员 builder 待办不可见**（角色∪组织匹配负向） | ✅ |
| TC-176 运行时 | user 提交报销单（next_reviewer=builder）→「专人处理」任务 assignee=builder（字段值取人，API+GUI 双验证）；批准后实例 COMPLETED，user「我发起的」可见 COMPLETED | ✅ |
| TC-176 负面 | 手动启动实例走到 FORM_FIELD 节点 → 实例 FAILED，错误：「…仅记录触发（创建/更新）可用，定时/API/手动启动不支持」——清晰错误防静默挂起 | ✅ |
| 单人审批契约 | 未配驳回跳转时「拒绝」按钮禁用（既有契约复验）；空列表挂「去我的应用发起申请」动作（PR #30 融合产物实机正常） | ✅ |

截图：`gui-test-screenshots/tc173-initiator-my-initiated.png`（任务中心我发起的）、
`tc174-176-done-list.png`（已办列表）。注：走查过程性截图未及时留存（夹具流程走查后已删除），
过程断言以走查时会话内 DOM 快照文本为准；实例/任务落库证据在本地 dev 库可查。

### 走查挖出并修复的缺陷

1. **[P1，已修] ORG 审批下拉对 builder 静默为空**：`GET /permissions/orgs` 挂类级
   TenantAdminGuard，builder（流程搭建主力）403→下拉空。复刻角色列表先例
   （role.controller #12 教训同款注释）：组织树/节点读端点放开 JwtAuthGuard，
   写操作与成员/授权明细保留管理员（方法级）。270cc88。复验 403→200 + permission 79 测全绿。

### 走查发现（记录，未在本轮修）

2. **[存量缺口] 画布触发器节点不回写 ProcessDef.triggerType**：新建流程弹窗留空→顶层
   MANUAL；画布上配「记录创建触发」只写 workflowSchema 节点，顶层列不同步 →
   `trigger.service.onRecordEvent` 按顶层列匹配（trigger.service.ts:285,289）→ 记录事件
   永不命中该流程。本人在画布配完触发器后记录不触发即此坑。**非本分支引入**（main 同行为）。
   建议后续轮：画布保存/发布时同步顶层 triggerType，或触发匹配改读 bundle 内 schema 触发节点。
   相关语义：应用级 bundle 快照决定记录触发可见集（流程先于应用发布创建时，需应用发布才入 bundle）。
3. **[观察] 审批模式默认值不落盘**：新 user_task 节点审批模式必须显式选择（引擎执行默认
   single，但 node-check 完整性要求显式配置）——语义自洽（未完成配置即标红），新用户可能困惑，
   可考虑表单初始化时写入默认值。
4. **[存量夹具观察] 已办列表「已批准+拒绝」并存行**（采购合同会签历史数据）：任务级拒绝票与
   实例终态已批准并存（多票聚合语义下可能合法），非本分支产物，留观。

## 三、走查夹具残留（本地 dev 库）

- 报销单对象新增 `next_reviewer`(user) 字段——保留（后续 FORM_FIELD 测试可用，运行时已发布表单不含它）。
- user@apaas.dev 加入 QA补测部门——保留。
- 走查流程已删除（转草稿后删，防记录事件持续触发污染本地 e2e）；app v1.0.2 bundle 仍含其快照，
  记录事件会打一次 startProcess(已删 id) 失败日志，下次应用发布自然清除。
- 测试报销单记录 3 条（走查测试报销单/2/3/4/5）保留。

## 四、验证汇总

- 单测：gateway 826+ / shared 38 / studio 175 / runtime-ui 32 / db 55 全绿（引擎分支 rebase 后）。
- typecheck 11/11。pre-push 四闸待推送时验证。
- 端到端 GUI：见上表 9 项通过。
