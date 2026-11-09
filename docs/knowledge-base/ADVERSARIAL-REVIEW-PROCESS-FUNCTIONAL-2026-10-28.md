# 流程引擎 functional 专项对抗审查：裁决落档 + 修复计划提案（2026-10-28）

> **状态**：裁决已终局（独立裁判盲审重验 9/9 确认，0 降级 0 驳回）；**修复计划已裁决（2026-11-08，5 项 ◆ 全按推荐收齐，见 §四裁决结果），随 R-B 开工放行**。
> **TC 编号勘误（2026-11-08，2026-11-09 二次顺延）**：本档原编回归锚点 TC-240~250 与 R-A 数据面闸门轮（2026-11-07）占用号冲突，顺延为 **TC-246~259**（R-A 占 TC-238~245；批 3 的 S-01 工具占 TC-256，波次⑥ 顺延 TC-257~259）；PE 专项档用例编号自 **TC-260** 起。
> **运行**：workflow `apaas-adversarial-review`（run `dwfrun-88929e8e-f953-496d-b49d-47a2c3197581`），target=`apps/gateway/src/process`，roles=`["functional"]`，focus=功能正确性 + 对象/页面/流程/数据集/权限引用链联动。红队=DeepSeek-V4-Flash，裁判=GLM-5.3（独立盲审：证据核对 / 复现执行 / 逻辑审查 / 前提溯源）。
> **审查时点**：main@6971db9。审查后代码零变化（后续仅 docs 提交），本档全部行号在落档时点仍然有效。

---

## 一、结论

1 路红队（功能可用联动视角）报 9 条发现，裁判逐条独立重验：**确认 9 条（全部 medium，可直接排期）、降级 0、驳回 0**。零误报。裁判对其中 7 条补做了红队未执行的非破坏运行时复现（新建自有资源，零破坏），对每条做了前提溯源（检索五份 ADR 与两份 ADVERSARIAL 台账，均无"裁决为设计"记录，无与 PE 台账同根因重复）。

元评估对评审流程的三条下轮建议（已固化方向，供下次运行改进提示词）：

1. **契约前提自查覆盖知识库全文**而非仅 AGENTS 摘要——functional-02 漏查了 R3 知识库明文记载的预检契约（该记载反成加强证据，但同类漏查可能漏掉豁免裁决致误报）。
2. **非破坏性运行时复现设为默认纪律**——评审标"设计未执行"的 4 条（03/04/05/09）裁判全部实际跑通且零破坏。
3. **证据列举附原始命令输出**——本轮两处转述失真（06 的 findMany 命中 5 处实为 1 处；05 的 TaskCenter 路径笔误），不影响结论。

---

## 二、裁决书归档（9 条确认发现）

### functional-01 删除流程定义级联销毁全部实例史（medium）

**what**：`deleteProcess` 只拦 PUBLISHED 状态、对实例零守卫，而 `process_instances.process_def_id` 外键为 `ON DELETE CASCADE`——删除草稿/已降级流程会永久删除该流程全部历史与在途实例、任务、节点执行记录。

**证据**：`process.service.ts:219-235`（仅 `existing.status === 'PUBLISHED'` 一道闸后直接 `prisma.processDef.delete`）；`schema.prisma:637/672/712` 三处 `onDelete: Cascade`；实测外键 `process_instances_process_def_id_fkey|c`（c=CASCADE）。UI 可达链：ProcessCard.tsx:202 删除菜单 → processesApi.delete；「转为草稿编辑」（ProcessEditorToolbar.tsx:139-148 → processesApi.update，`updateProcess :175-180` 把 PUBLISHED 回退 DRAFT，注释自认临时方案）绕过唯一守卫。

**裁判复现**（评审未做，非破坏）：psql 事务内对 contract_approval（221 实例/380 任务/1009 节点执行）UPDATE status='DRAFT' → DELETE FROM process_definitions → 三类计数全为 0 → ROLLBACK 后 221 实例完好——**级联销毁在 DB 层实证成立**。API 层 HTTP 复现未执行（破坏性）。

**前提溯源**：五份 ADR 与两份 ADVERSARIAL 台账均无"删流程销毁实例史"裁决；P1-30 仅处置 release 行、PE-07 仅闸 ACTIVE release 存在场景，后果面不同非重复；平台自身标准（删对象五守卫 / P1-26 删用户阻断 / P1-09 字段硬拦）反向印证此为缺陷。

### functional-02 超时 AUTO_REJECT 未配 rejectToNodeId 静默失效（medium）

**what**：超时动作 AUTO_REJECT 在节点未配 rejectToNodeId 时能通过发布预检；到点后引擎逐任务调用 completeTask 抛「未配置驳回跳转」，catch 后 break——超时 job 已消费且零重试，任务永久 PENDING、实例永久 WAITING_USER_TASK，「超时自动驳回」静默失效。

**证据**：三方断链——① UI 仅文案提示零校验（UserTaskConfigForm.tsx:103-107/:367-375）；② 发布闸只跑 collectNodeIssues + collectErrorEdgeConflicts（process.service.ts:267-292），node-check.ts:23-35 对 user_task 仅校验审批人/审批模式，全 shared 无 timeoutAction×rejectToNodeId 规则；③ 引擎 catch 后仅 error 日志 + break（process-engine.ts:1415-1421），**注释 :1416「发布预检已拦」为不实陈述**；completeTask 无 rejectToNodeId 抛 400（:637-642）。超时 job 实测 `attempts:0`。

**裁判复现**：新建流程（AUTO_REJECT+2 秒+无 rejectToNodeId）→ publish 放行（ok:true PUBLISHED）→ start → 7 秒后实例仍 WAITING_USER_TASK、任务仍 PENDING、Redis job 32ms『成功完成』attempts:0 无 failedReason——静默失效完整坐实。

**前提溯源**：R3 知识库 `PROCESS-ENGINE-R3-TIMEOUT-ERROR-2026-10-15.md:18` 明文记载「auto_reject 要求 rejectToNodeId——发布预检拦坏配置」的设计契约，**实现从未落地**（违背已文档化设计，加强证据）。与 PE-14（delayQueue attempts）根因不同：本条 catch 吞错，即使配 attempts 也不重试。

### functional-03 触发条件 condition 与触发事件 event 全链零消费（medium）

**what**：触发器节点的「触发条件 condition」与「触发事件 event」在画布暴露并原样落进 node.data，但记录触发匹配只读 triggerType/objectId——两字段全链零消费者，条件/事件设置完全不生效，流程对不满足条件的记录也会启动。

**证据**：UI 暴露 event Radio + condition textarea（TriggerConfigForm.tsx:13/:79-96）经 NodeConfigPanel.tsx:84-86 原样落盘；extractTriggerInfo 仅提取 triggerType/objectId/cron（trigger.service.ts:71-79）；匹配仅比较 triggerType/objectId（:391-399）；shared 契约仍声明 condition「满足才触发」（shared/src/process/index.ts:226-230）；MCP 方言指南无该字段教学。

**裁判复现**：新对象+流程（condition='amount>1000'）发布后 ① POST amount=1 记录（不满足）→ 实例照样创建并 COMPLETED；② event 改 UPDATE 后再发布，POST created 事件 → 实例数 1→2——**condition 与 event 双双被完全无视**。

**前提溯源**：PE-30 只登记 shared 嵌套 TriggerConfig 死契约（修法删死契约，不覆盖画布扁平字段功能失效）；I-1/BACKLOG 未裁决为设计。**实施层核实补充**：event 取值 CREATE/UPDATE/DELETE（TriggerConfigForm.tsx:84-86）与 triggerType 取值 RECORD_CREATED/RECORD_UPDATED/RECORD_DELETED 语义重复；condition 是自由文本表达式（placeholder `amount > 1000`），与平台 JsonLogic JSON 子集（R5-D1 SSOT）形态不同。

### functional-04 子流程不透传发起人与触发记录上下文（medium）

**what**：sub_process 节点构造的触发上下文只带 inputs/_parent，不透传 triggeredByUser 与 record/recordId——子流程内的「发起人」（INITIATOR）或「表单字段」（FORM_FIELD）审批人节点必然抛 NonRetryableNodeError 使子实例 FAILED，审批回写静默跳过。

**证据**：sub-process.executor.ts:55-66 仅构造 `triggeredBy:'SUB_PROCESS'` + inputs；头注释 :5-6 声称的 `inputMapping` 执行体零实现（UI 亦无映射入口）；startProcess 把 triggerContext 原样落库（process-engine.ts:222）、startSubProcess 直通无注入（:463）；INITIATOR/FORM_FIELD 缺失即 throw（user-task.executor.ts:46-55/:85-91）；writeback 读 variables['recordId'] 缺失仅 warn 跳过（:963-970）。**实施层核实补充**：记录触发链路的 triggerContext 已带 record/recordId/triggeredByUser（trigger.service.ts:409-418）——透传源完备。

**裁判复现**：父流程（手动启动、有发起人）→ sub_process 指向 INITIATOR 审批子流程，子实例实测 FAILED，error 文案与预测一字不差；**父实例连带 FAILED（sync 传导，后果比评审描述更重）**。writeback 跳过为代码走读（initialVariables={...triggerContext,...inputs} 无 recordId，链路明确）。

**前提溯源**：R1/R2 动态审批人专题文档『子流程』零命中；correctness-09 只裁决『回写失败不阻断』；发布预检/G3 对该组合零拦截。

### functional-05 删页面/删通知模版不扫流程引用（medium）

**what**：删除页面与删除通知模版都不扫流程节点引用——页面被 user_task.pageId 引用时删后审批页在新 bundle 下 404 且申请内容被清空；模版被 notification.templateId 引用时删后通知节点抛错，审批已通过但实例落 FAILED。时序特征：「删除当刻不坏、重发应用后引爆」。

**证据**：删除侧零引用扫描（page.service.ts:431-451、process.service.ts:1124-1131）；引用侧 getTask 读冻结 schema pageId（process.service.ts:742-747）、getRuntimeById 只查 bundle 缺失即 404（page.service.ts:261-271）、notification 执行器缺模板即 throw（notification.executor.ts:61-68）→ 无 error 出边则实例 FAILED（process-engine.ts:519-558）；前端盲批：TaskCenter.tsx:272-273 boundPageId 有值即传空数组不回退展示申请内容；UI 两处删除一次确认零提示（PageList.tsx:148、NotificationTemplateManager.tsx:88-95）。

**裁判复现**：模版腿端到端——删模板 {deleted:true} → 审批 approve 返回 {completed:true} → 实例实测 FAILED（error 文案一致）；页面腿时序——页入 bundle 读 200 → 删页零守卫 → 删后仍 200（旧 bundle）→ 重发应用后 404「页面不存在或未发布」且任务 boundPageId 仍指向已删页。前端盲批效果为代码走读（未做 GUI 走查）。

**前提溯源**：无删页/删模版裁决记录；P1-09 字段全硬拦与删对象五守卫反向印证「引用即硬拦」标准。**实施层核实补充**：触发节点 startPageId（R6 发起页面绑定，TriggerConfigForm.tsx:18）同为页面引用，删后「发起」按钮同病，应并入扫描面。

### functional-06 监控页任务 Tab 的 processDefId/assignee 被后端静默丢弃（medium）

**what**：流程监控页「任务」Tab 传给服务端的 processDefId 与 assignee 被后端静默丢弃，列表永远只是「我自己的全部任务」——按所选流程过滤无效，且不存在任何按流程查看任务的端点。

**证据**：三层断裂——前端传参并纳入 queryKey（ProcessMonitor.tsx:68-76，制造按流程隔离假象）；api 层声明并全量发送（api/processes.ts:106-110/386-395）；后端 controller 只收 status/page/pageSize（process.controller.ts:164-181，NestJS 静默忽略多余 query），service where 仅 tenantId+本人 assignee/邮箱/candidateGroups+status（process.service.ts:615-700），无 processDefId。全库仅此一个任务列表端点。

**裁判复现**：GET /tasks?status=pending 20 条，加 `&processDefId=does-not-exist-xyz` 或 `&assignee=nobody-xyz` 均仍 20 条同首条——荒谬参数零影响。

**前提溯源**：PE-24/PE-26 为同端点不同缺陷（pageSize 上限/status 枚举 500），非重复。**实施层核实补充**：listTasks 的「本人」范围含邮箱与 candidateGroups（角色∪组织）匹配（:618-648），放开按流程查询需重新划定权限面。

### functional-07 user_task 驳回配置默认态自相矛盾（medium）

**what**：驳回配置三种口径并存的"化石"——面板显示值把 undefined 压成「允许驳回」（`=== false ? 'false' : 'true'`），驳回目标节点输入框仅在 `allowReject === true` 时渲染（从未手动切换下拉就永远无法填写），回写区却是宽松 `!==false`。新建节点在默认态下无法配置驳回目标，运行面驳回按钮因此默认禁用。

**证据**：UserTaskConfigForm.tsx:383（显示值 undefined→'true'）、:396（`=== true` 才渲染目标选择器）、:470（回写区 `!==false`）——同文件三口径；全 studio 无 allowReject 默认值注入；引擎硬闸 rejectToNodeId 才能驳回（process-engine.ts:637-642）；运行面禁用条件 allowReject!==false && rejectConfigured===true（TaskCenter.tsx:231、TaskModalFooter.tsx:34-39）。

**裁判复现**：API 实证——现成 PENDING 任务（节点 allowReject 键不存在）getTask 返回 allowReject=True + rejectConfigured=False，「显示允许但不可驳回」在数据层坐实。「切换两次才出现输入框」为代码走读（条件渲染逻辑必然）。

**前提溯源**：#16（2026-10-03）裁决「默认允许」时引擎仅 `===false` 一道闸、当时自洽；2026-10-06 产品裁决新增 rejectToNodeId 硬闸未回改表单——两裁决叠加缝隙。注释 :381-382 自称的口径在新硬闸下已失实。

### functional-08 加签/撤回端点在、全产品无入口（medium）

**what**：R1.3 交付的加签与撤回只有后端 REST 端点，两个前端全仓零调用点——宣称的审批能力在业务侧不可达（加签须改流程重发、撤回只能 admin cancel）。

**证据**：端点在（process.controller.ts:224-240 add-sign / :242-255 withdraw，注释自认 R1.3）；两前端 add-sign/addSign/withdraw 及中文文案 grep 零命中；MCP/OpenAPI 零暴露；e2e/16 撤回用例系 API 直调非 UI 驱动；TEST-CASES 无对应用例；runtime-ui tasksApi.delegate 为死方法（定义 :88-90 无引用，转办仅 studio 监控页可达）。

**裁判核实加强**：中文文案『撤回/加签』亦零命中（排除文案别名入口）。唯一弱化：STATUS-MATRIX:12 措辞是「加签/撤回**端点**」与实际一致，「文档失实」半句按矩阵措辞打折，主体断言（能力业务侧不可达）完全成立。

**实施层核实补充**：后端能力完整且权限语义齐备——withdrawInstance 校验发起人（process.service.ts:896-905，403「仅流程发起人可撤回」，仅 RUNNING/WAITING_USER_TASK 可撤）；addSign 权限=当前任务受理人（assertTaskMembership :936）；runtime-ui「我发起的」Tab 已存在（TaskCenter.tsx:213，2026-10-10 交付）——**本条是纯前端入口缺失，修法零后端改动**。

### functional-09 定时触发不填 Cron 可保存可发布、静默永不触发（medium）

**what**：画布触发器选「定时触发」但不填 Cron 可以保存并发布成功，后端发布闸不校验，注册阶段静默跳过——流程显示已发布却永不触发。

**证据**：画布 Cron 的 Form.Item 只有视觉红星无校验（TriggerConfigForm.tsx:119，`component='div'` 直写无 rules——非受控用法 rules 本就不会跑）；对照 TriggerConfigModal.tsx:72-81 同字段有 rules（两入口口径不一）；发布闸不校验 cron；onProcessPublished 在 `!info.cron` 时直接 return 无日志（trigger.service.ts:317）。

**裁判复现**：SCHEDULED 无 cron 流程发布返回 200 PUBLISHED，Redis 中该 defId 的 repeatable job 零注册（scan+zrange 双查）——「已发布却永不触发」坐实。

**前提溯源**：PE-10 是注册写入失败无补偿（Redis 抖动），本条是输入缺失无校验，修法互不覆盖；TriggerConfigModal 入口的 rules 反证产品本意要求 cron。

---

## 三、修复计划（提案态）

### 3.0 设计原则与既有事实

- **发布预检规则统一落 `node-check.ts`**（shared 跨端 SSOT）：新增规则自动同时接入画布标红（studio「检查」）与发布硬闸（gateway publishProcess :267-276），无需双处改动。注意 `nodeIncompleteReason(type)` 目前是按 type 的静态文案，组合规则需要 reason 随 data 动态化（接口小改，两侧消费方同步）。
- **「引用即硬拦」为平台既有标准**（删对象五守卫 / P1-26 删用户阻断 / P1-09 字段硬拦 / P1-TC-228 字段引用改名改类型删除 400）——删除守卫类工单按此标准实现 409 + 引用清单。
- **后端审批能力完备**（withdraw=发起人语义 / addSign=任务受理人语义 / 「我发起的」Tab 已在）——F-08 不动后端。
- **不发明新语言**（ADR-0003 数据集轮先例）——F-03 的 condition 若实现，形态对齐平台 JsonLogic 子集 SSOT（R5-D1），不新造表达式解析器。

### 3.1 波次总览

| 波次 | 工单 | 主题 | 规模 | 依赖 |
|---|---|---|---|---|
| ① | functional-02a / 07 / 09 | 发布预检规则 + 表单口径统一 | M | 无 |
| ② | functional-01 / 05 | 删除守卫（流程定义/页面/通知模版）+ 盲批回退 | M | 无（可与①并行） |
| ③ | functional-02b / 04 | 引擎语义：超时兜底 + 子流程透传 | M | ①（02a 预检先行） |
| ④ | functional-06 | 任务列表契约（processDefId/assignee） | S | ◆3 |
| ⑤ | functional-03 | 触发条件/事件语义 | M | ◆2 |
| ⑥ | functional-08 | 审批操作 UI 入口（加签/撤回/转办） | M | 无 |
| 横切 | S-01 / RES-01 / DOC-01 | 存量扫描 / 残留清理 / 文档同步 | S | — |

建议顺序：①②并行起跑 → ③ → ④⑤⑥（⑤⑥取决于 ◆ 裁决）。每波次独立提交（fix/feat + 文档同步同提交），推送前四闸 + OCR + QA 走照常。

### 3.2 波次① 发布预检与表单口径簇

**functional-02a（发布预检 + UI 校验 + 注释勘误）**

- 修法：
  1. `node-check.ts` user_task 增组合规则：`timeoutAction === 'AUTO_REJECT'` 且无 `rejectToNodeId` → 不完整，reason「已配置超时自动驳回但未配置驳回跳转节点」；
  2. `nodeIncompleteReason` 改造为可携带 data 的动态 reason（接口签名 `(type, data?)`，全部消费点同步）；
  3. UserTaskConfigForm.tsx 超时动作选 AUTO_REJECT 且无 rejectToNodeId 时即时校验提示（选人下拉与驳回目标同区块联动）；
  4. process-engine.ts:1416 失实注释勘误（预检落地后该注释才重新为真——勘误文案以落地后事实为准）。
- 影响面：只拦「配了 AUTO_REJECT 未配目标」的节点（存量面小，S-01 扫描清单兜底）。
- 验证：shared node-check 单测（新规则命中/放行/对照 AUTO_APPROVE 免 rejectToNodeId）+ publishProcess 预检集成单测 + studio 表单单测。
- 回归锚点：**TC-246**（AUTO_REJECT 无 rejectToNodeId 发布硬拦，画布标红同源）。

**functional-07（驳回配置口径统一）**

- 修法：UserTaskConfigForm.tsx:396 渲染条件 `data.allowReject === true` → `data.allowReject !== false`（与 :383 显示值、:470 回写区同口径）——默认态即显示驳回目标选择器；:381-382 注释更新为三口径统一后的事实。
- **不加发布硬闸**：运行时语义「未配 rejectToNodeId = 该节点不可驳回」合法（TaskCenter rejectConfigured 机制 + tooltip 已按此降级），硬闸会拦截存量合法配置。引擎 :637-642 硬闸不动。
- 验证：studio 表单单测（undefined 默认态渲染目标选择器 / 显式 false 隐藏 / 切换数据清理）。
- 回归锚点：**TC-247**（新建 user_task 默认态可直接配置驳回目标，运行面按钮随配置点亮）。

**functional-09（Cron 发布闸 + 注册防御）**

- 修法：
  1. `node-check.ts` trigger 增规则：`triggerType === 'SCHEDULED'` 且无 `cron` → 不完整，reason「定时触发未配置 Cron 表达式」；
  2. TriggerConfigForm.tsx cron 输入占位/预设保持，画布侧依赖同源标红（非受控 Form 无 rules 可挂，不加假校验）；TriggerConfigModal.tsx 已合规不动；
  3. trigger.service.ts:317 `!info.cron` 分支补防御日志（预检落地后为防御层：`定时触发缺 cron，未注册 job: ${apiName}`）。
- 验证：shared 单测 + publish 集成单测（SCHEDULED 无 cron 发布 400 且错误信息含 reason）。
- 回归锚点：**TC-248**（SCHEDULED 无 cron 发布硬拦；有 cron 正常注册 Redis job）。

### 3.3 波次② 删除守卫簇

**functional-01（删除流程定义实例守卫）**

- 修法：deleteProcess 在 PUBLISHED 拦截之后、事务之前，统计 `process_instances.count({ where: { processDefId } })`，> 0 → 409 `CONFLICT`（消息含实例计数与处置指引「该流程存在 N 条实例（含在途审批），删除将连带销毁全部执行历史；如需下线请使用取消/归档」）。
- **◆1 守卫强度待裁决**：方案 A（推荐）=存在任何实例即硬拦（与删对象五守卫/P1-09 标准一致，审计历史不灭失；历史清理留「归档」能力后续立项）；方案 B=仅在途（RUNNING/WAITING_USER_TASK）硬拦、仅历史实例可放行（删前二次确认提示销毁规模）。
- 「转为草稿编辑」降级链路（updateProcess :175-180）不改：降草稿不删数据，实例守卫仍有效覆盖删除路径。
- 验证：单测（有实例 409 / 无实例放行 / release 行级联保持 P1-30 行为）。
- 回归锚点：**TC-249**（删流程定义存在实例时 409，无实例正常删除）。

**functional-05（删页面/删通知模版引用守卫 + 盲批回退）**

- 修法：
  1. deletePage（page.service.ts:431）删除前扫描同租户流程（PUBLISHED + DRAFT 活表）workflowSchema：user_task 节点 `pageId` 引用 + trigger 节点 `startPageId` 引用（R6 发起页面，同根因并入）→ 命中 409，消息列出引用它的流程名清单；
  2. deleteTemplate（process.service.ts:1124）删除前扫描 notification 节点 `templateId` 引用 → 同上；
  3. TaskCenter.tsx:272-273 盲批修复：boundPageId 有值但审批页加载失败时回退展示 triggerData（申请内容），ApprovalPageRenderer 失败态文案保留并追加「可查看下方申请内容」。
- 范围声明：本单聚焦流程引用链（裁决书确认面）；应用导航菜单/页面间跳转对页面的引用为**扩展观察项**，不在本单（后续轮按「引用即硬拦」标准补扫）。
- 验证：单测（引用存在 409 含清单 / 无引用放行 / DRAFT 引用同样拦截）+ e2e 反验（删模版腿：审批通过后实例不再 FAILED）。
- 回归锚点：**TC-250**（删除被流程引用的页面/模版 409；无引用可删）。

### 3.4 波次③ 引擎语义簇（TDD 红先行）

**functional-04（子流程透传触发上下文）**

- 修法：sub-process.executor.ts 构造 triggerContext 时透传父实例 triggerContext 的 `triggeredByUser` / `record` / `recordId`（父实例有则透传、无则不传——定时/API 触发父流程时 INITIATOR 报清晰错误是合理边界）；头注释 :5-6 摘除 `inputMapping` 失实声明，改为「变量经 inputs 透传，父实例发起人/触发记录随 triggerContext 继承」。
- **◆2 附带确认**：显式变量映射 UI（inputMapping 真实现）本轮不做（YAGNI，继承语义覆盖主链路），留观察。
- 验证：单测三路——手动触发父流程 → 子流程 INITIATOR 解析成功；记录触发父流程 → 子流程 FORM_FIELD 解析成功且 writeback 有 recordId；定时触发父流程 → INITIATOR 报清晰错误（不静默）。
- 回归锚点：**TC-251**（子流程内 INITIATOR/FORM_FIELD 审批与回写闭环）。

**functional-02b（超时动作执行失败兜底处置）**

- 修法：process-engine.ts:1415-1421 catch 分支从「error 日志 + break」升级为显式失败处置——NodeExecution 留痕（S2 语义）+ 任务置 CANCELLED + 实例置 FAILED（error 信息含任务/原因），对齐 S2「无 error 出边则实例 FAILED」聚合语义与人工 cancel 路径的状态口径；消除「任务永久 PENDING、实例永久 WAITING」静默悬挂。
- 实施时按 S2 聚合代码路径对齐（TDD 先红：AUTO_REJECT 无 rejectToNodeId 的存量流程超时到点 → 实例 FAILED 而非悬挂）。
- 回归锚点：**TC-252**（超时动作执行失败实例显式 FAILED，不再静默悬挂）。

### 3.5 波次④ 任务列表契约（◆3）

**functional-06**

- 修法：controller listTasks 声明 `processDefId` / `assignee` query 参数；service where 增加 `instance: { processDefId }` 过滤；assignee 参数语义按 ◆3 裁决定。同步对齐 PE-24（pageSize 上限）既有修法避免同端点二次踩。
- **◆3 权限面待裁决**：方案 A（推荐）=请求携带 processDefId 或 assignee（非本人）时要求租户级 BUILDER/ADMIN（真「流程监控」语义，监控页产品意图）；方案 B（最小）=processDefId/assignee 仅叠加在「本人」范围内（监控页语义修正为「我在该流程的任务」，零权限风险但不满足跨人监控）。
- 回归锚点：**TC-253**（processDefId 过滤生效；荒谬参数不再静默全量返回）。

### 3.6 波次⑤ 触发条件/事件语义（◆2）

**functional-03**

- **◆2 处置方向待裁决**：
  - **方案 A（推荐）——实现 condition + 摘除 event**：
    1. condition 形态定为 **JsonLogic JSON 子集**（对齐 R5-D1 SSOT 与数据流 filter 同形态；UI textarea 提示改 JsonLogic 示例，非法表达式保存/发布时校验拒绝——复用 D1 校验器，不新造表达式解析器）；
    2. extractTriggerInfo 提取 condition → TriggerInfo；onRecordEvent 匹配 filter（:391-399）增加求值：JsonLogic evaluate against recordData，求值异常视为不触发并留 warn 日志；
    3. UI 摘除 event Radio（与 triggerType 语义重复、全链零消费、还能制造 RECORD_CREATED×event=UPDATE 矛盾配置；存量 node.data.event 字段留着无害）；
    4. MCP 方言指南补 condition 节（含最小示例与值域边界）；shared TriggerConfig 死契约处置与 PE-30 汇合（同一提交对齐，避免双轨）。
  - **方案 B——全摘除**：condition 与 event 一并删 UI 入口（SUPERVISOR 先例：无数据源能力不放假入口），功能缺口显式留观察。
- 回归锚点（方案 A）：**TC-254**（condition 满足触发/不满足不触发/非法表达式校验拒绝）+ **TC-255**（event 摘除后 triggerType 语义唯一）。

### 3.7 波次⑥ 审批操作入口

**functional-08**

- 修法（零后端改动）：
  1. runtime-ui TaskModalFooter 加「加签」操作（选人 + after/parallel 位置，消费 POST /tasks/:taskId/add-sign，权限=任务受理人，与既有 complete 按钮同面板）；
  2. runtime-ui「我发起的」列表（TaskCenter.tsx:213 Tab）行操作加「撤回」（仅 RUNNING/WAITING_USER_TASK 行显示，消费 POST /instances/:instanceId/withdraw，后端 403/400 语义直接透出）；
  3. **◆4 转办死方法处置**：方案 A（推荐）=审批弹窗一并补「转办」入口（消费既有 delegate 端点，R1.3 三件套对齐）；方案 B=删除 tasksApi.delegate 死方法（转办维持 studio 监控页单入口）。
- 验证：runtime-ui 单测 + GUI 走查（加签→新任务出现→审批推进；发起人撤回→实例 CANCELLED；非发起人撤回 403 显式化）。
- 回归锚点：**TC-257**（发起人在「我发起的」撤回在途实例）/ **TC-258**（受理人加签生成新任务并推进）/ **TC-259**（转办入口按 ◆4 裁决=审批弹窗补转入库）。【2026-11-09 二次勘误：批 3 的 TC-256 被 S-01 扫描工具占用，波次⑥ 顺延 TC-257~259】

### 3.8 横切工单

| 单 | 内容 | 说明 |
|---|---|---|
| S-01 | **存量脏配置扫描**（read-only 脚本，◆5） | 扫活表 PUBLISHED 流程：AUTO_REJECT 无 rejectToNodeId / SCHEDULED 无 cron /（若 ◆2 选 A）condition 非法 JsonLogic。输出清单人工处置——发布预检只拦未来提交，存量脏配置在下次提交时被打回，提前扫描避免「重发布才爆炸」。**◆5 待裁决**：A 做（推荐）/ B 不做（靠提交时拦截）。 |
| RES-01 | **dev 库裁判复现残留清理** | 本轮审查在 dev 库留下：functional-02 悬挂实例（cmvrx63oj03wllj1jp8gmzdog，若波次③先落地可由 TC-252 处置路径收口）及裁判新建的 judge 对象/流程/实例/模版。悬挂实例建议 cancel；judge 流程删除会撞 functional-01 新守卫（守卫落地后按其指引处置或 SQL 人工清）。非紧急，随波次收尾。 |
| DOC-01 | **文档同步（随各波次同提交）** | TEST-CASES.md（TC-246~258 按波次入库，v3.6+）；QA-TEST-PLAN-PROMPT.md（发布预检新规则行 + 任务中心矩阵）；workflow 方言指南（F-02 契约追平实现 / F-03 condition 节）；PROCESS-ENGINE-BACKLOG 台账登记本批新知；AGENTS.md 当前阶段轮次条目随实施落档更新。 |

---

## 五、◆ 裁决结果（2026-11-08，用户「全按推荐」收齐，R-B 开工放行）

| ◆ | 项 | 裁决 |
|---|---|---|
| 1 | functional-01 删除实例守卫强度 | **方案 A**：存在任何实例即硬拦（对齐删对象五守卫/P1-09 标准，审计历史不灭失；历史清理留「归档」能力后续立项） |
| 2 | functional-03 触发条件/事件语义 | **方案 A**：实现 condition（JsonLogic 子集复用 D1 校验器）+ 摘除 event UI；MCP 方言指南同提交补 condition 节；shared TriggerConfig 死契约与 PE-30 同提交对齐 |
| 3 | functional-06 任务列表权限面 | **方案 A**：携带 processDefId/assignee（非本人）时要求租户级 BUILDER/ADMIN（真「流程监控」语义） |
| 4 | functional-08 转办死方法处置 | **方案 A**：审批弹窗补「转办」入口（消费既有 delegate 端点，R1.3 三件套运行时对齐） |
| 5 | S-01 存量脏配置扫描 | **方案 A**：做 read-only 扫描脚本输出清单人工处置（避免「重发布才爆炸」） |

### 3.9 契约变更清单（供 commit 标注）

- **发布预检新增拦截**（破坏性面向脏配置）：AUTO_REJECT 无 rejectToNodeId、SCHEDULED 无 cron → 发布 400（存量 S-01 清单兜底）。
- **删除端点新增 409**：deleteProcess（有实例）、deletePage/deleteTemplate（被流程引用）——UI 错误透传依赖现有 toast。
- **API 表面扩展**：GET /tasks 新增 processDefId/assignee 参数（◆3 定权限面）；event 字段摘除（若 ◆2 选 A）为 UI 层变更，node.data 存量字段无害保留。
- 无数据库迁移。

---

## 四、◆ 待裁决项汇总（开工前收齐）

| # | 议题 | 方案 A（推荐） | 方案 B |
|---|---|---|---|
| ◆1 | functional-01 删除流程定义守卫强度 | 存在**任何实例**即硬拦（与删对象五守卫标准一致，审计史不灭失；历史清理留归档能力后续立项） | 仅**在途**实例硬拦，仅历史可删（删前确认提示销毁规模） |
| ◆2 | functional-03 触发条件/事件处置 | 实现 condition=JsonLogic 子集 + 摘除 event（对齐「不发明新语言」与 D1 SSOT；配 S-01 扫描） | 全摘除 condition+event（零风险，功能缺口留观察） |
| ◆3 | functional-06 按流程查任务权限面 | processDefId/assignee 查询要求租户级 BUILDER/ADMIN（真监控语义） | 仅叠加在「本人」范围内（最小改动，零权限风险） |
| ◆4 | functional-08 转办死方法 | 审批弹窗补「转办」入口（R1.3 三件套对齐） | 删除 tasksApi.delegate 死方法（维持单入口） |
| ◆5 | 存量脏配置扫描 | S-01 read-only 扫描脚本出清单（避免重发布才爆炸） | 不做，靠提交/发布时硬闸拦截 |

裁决落地后本档随首波次提交更新为「已裁决」态（沿用流程引擎专项先例：裁决写入工单档，不另开文档）。

---

## 五、未覆盖面

- 本轮仅 functional 单视角（功能可用 + 引用链联动），**非穷尽式审计**：安全/正确性/性能/兼容等视角未启用，需要时另行开轮。
- 裁判复现以非破坏运行时验证 + 代码走读为准，未运行项目自身测试套件；functional-01 的 API 层 HTTP 复现因破坏性未执行（DB 事务回滚式已闭环）。
- F-05 的前端盲批效果、F-07 的「切换两次」交互死结为代码走读结论（逻辑必然），随波次实施后由 GUI 走查补证。
- 数据集/权限引用链在 focus 中声明但本轮发现集中在对象/页面/模版引用；数据集（@ref:dataset）引用删除面未在本轮覆盖，列为 functional 视角复查候选。
