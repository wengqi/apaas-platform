# 流程引擎专项对抗审查裁决与修复工单（2026-10-25）

> 来源：`apaas-adversarial-review` 工作流——6 路红队（安全/正确性/性能/工程/魔鬼代言人/平台契约）+
> 独立裁判四步盲审重验（证据核对/复现执行/逻辑审查/前提溯源）。
> 靶区 `apps/gateway/src/process`，防锚定 shield=`docs/research/`+`docs/adr/`（评审禁读，魔鬼代言人专攻）。
> 终局：50 条报告 → 裁判合并 7 条跨视角重复后逐条重验：**确认 31（7 high / 18 medium / 6 low）、
> 降级 10（机制属实、定性被既有契约/用户裁决否定，均 low）、驳回 2**。14 条由裁判在本机
> gateway/dev 库活体复现，5 条实跑测试套件佐证，其余静态走读（证据链见工作流裁决书产物）。
>
> **计划评审轮（2026-10-25 第二轮，同工作流）**：本档修法文本另经 6 路红队+独立裁判盲审——
> 53 条报告 → **确认 20（2H/17M/1L）/ 降级 16（全部以规格补句·勘误并入）/ 驳回 7（不修，见裁决书产物）**。
> 31 项缺陷定性零推翻，修订均为修法文本级（判定源/闸位置/分支覆盖/顺序约束/权限规格/勘误），
> 以「评审轮」标注内嵌各行；新增工单 PE-32，◆ 表扩项（◆1~7），降级表勘误 2 行。
> 第二轮发现号一律加 R2- 前缀，与首轮裁决号区分。
>
> **本档状态：已裁决（2026-11-08）。** 波次划分与 ◆ 裁决项 9 项 + 降级表 2 项已由用户「全按推荐」一次性收齐（裁决结果见文末 ◆ 表后附块），R-B 开工放行；ADR 级三项（◆4/◆7/◆8）落 ADR-0007。

## 执行约定（专项会话开跑前读）

1. **基线事实勿重审**：各项证据均经裁判活体复现或逐行走读固化（对齐 2026-10-23 全项目审查轮惯例），直接采信，不复现不推翻；
2. **TDD**：每项先写能红的复现测试再修（项目红线）；新用例编号从 **TC-260** 起（R-A 占 TC-238~245、functional 档占 TC-246~259——2026-11-09 二次勘误：批 3 S-01 工具占 TC-256、波次⑥ 顺延 TC-257~259），同提交更新 TEST-CASES.md + QA-PLAN；
3. **标尺**：high=越权/资损/崩溃级；medium=功能缺陷/明确性能瓶颈/一致性；low=工程质量（对齐裁决书全池标尺）；
4. **每批修完**：受影响包单测 + typecheck + lint 全绿，随批走 OCR/QA/e2e 闸门后推送 main；
5. ✅ **◆ 裁决项**（9 项，见文末）+降级表 2 项已于 2026-11-08 收齐（用户「全按推荐」，裁决结果见 ◆ 表后附块与降级表两行标注）；
6. 完成一项在本档状态列打 ✅ 并补 TC 号；
7. 波次间依赖（评审轮重写，原注「②依赖⑤(PE-05)」自指失义作废——PE-05 本身在波次②，R2-security-06/devil-08）：① **②×③** PE-05（approveUsers 实例化）与 PE-06（聚合判定统一读 frozenWorkflowSchema）对 process-engine.ts:688-697 聚合段是相反改写指令，须合并设计、先定读源（R2-correctness-02）；② **④×⑤** PE-13 开重试前 PE-17 幂等守卫须先落地或同批，否则中间态外发副作用最多×3（R2-engineering-03）；③ **④ 内 PE-12/PE-14/PE-04** 同批设计「认领+推进原子性」统一方案（PE-04 守卫与 PE-14 锁外认领同根因，R2-engineering-04）；④ **PE-16×PE-14** 环内校验须在锁内认领之前或与 PE-14 同批，否则单独实施制造 PE-14 同构死局（R2-scale-02）。

## 波次① 启动·身份·取消安全（3 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| PE-01 | MANUAL 启动变量整体展开为实例顶层变量直达数据面：终端用户注入 `recordId` 借审批流改写/删除租户内任意记录并击穿金额分级审批（裁判全链实机复现：end_user 注入 `{recordId,amount:100}` → 小额分支绕会签+终审 → 880 万合同被 APPROVED；直接 PUT 该记录 403 负向对照成立） | process.controller.ts:94-108；process.service.ts:326-342；process-engine.ts:218-219、:963-975；object-operation.executor.ts:77-105；record.service.ts:749-771（update where 仅 {id,tenantId} 无 permissionContext） | security-01〔H〕 | 三层组合：① 对非 MANUAL/SCHEDULED 触发类型拒绝手动启动（RECORD_CREATED 也可手动启动已被实证）——评审轮补：判定源钉死 extractTriggerInfo（schema 触发节点 SSOT、顶层列仅回退——顶层列对画布流程不同步且缺省 MANUAL，按列实现则越权链修而存活，R2-engineering-01）；闸位加显式 channel 参数或上提 controller 层判定，禁落 engine.startProcess 字面（开放API/记录/webhook/定时四通道共用该入口，webhook 的 triggerContext 被硬写 MANUAL 与手动同值不可分，R2-compat-02）；同步补运行面手动发起清单过滤（listPublishedProcesses）；② 启动变量防护覆盖引擎保留键全谱（评审轮扩，R2-security-01）：recordId（ref 消费）+ sequentialIndex（nodeId 作用域——注入可跳过依次审批链前 k 名审批人）+ global 作用域 + _joins，键黑名单不可枚举（变量映射改名即绕过）；③ 引擎内记录写（writeback/object-op）校验 recordId ∈ 节点 objectId 配置域+应用域（非触发绑定对象，不封杀跨对象桥梁能力，R2-compat-05），并【强制】携带发起人 permissionContext 行级校验（无行级条件时同对象横向越权不可防，不可作理想项，R2-security-03） | ◆1 | |
| PE-02 | POST /instances/:id/cancel 零归属校验：任意 END_USER 可不可逆终止租户内任意在途审批实例（实机复现：user 取消 admin 会签实例成功，任务全 CANCELLED；同文件 withdrawInstance 有发起人校验坐实系遗漏） | process.controller.ts:153-158（无 targetIdParam→通配即过）；process.service.ts:601-608 | security-02〔H〕 | cancelInstance 补归属校验：发起人 OR 当前受理人 OR 租户/应用 admin，对齐 withdrawInstance/assertTaskMembership 惯例 | | |
| PE-03 | StartInstanceDto.triggeredByUser 客户端可伪造且服务端显式优先不校验（≠caller 不拦），污染「我发起的」、误授撤回权、错投通知、INITIATOR 审批人可定向指派（实机复现：end_user 伪造成 admin 启动，admin 列表被污染并可直接撤回） | process.service.ts:337；process-engine.ts:1866+；dto:68 | security-05〔M〕 | JWT 用户路由强制 callerUserId 覆盖 body 值；显式传入仅保留给服务身份/OpenAPI 通道（A3/G6 语义），通道判定按 auth context 区分；评审轮补：同步修订 A3 落档语义记录（「显式优先」→「用户通道强制覆盖」，AGENTS/知识库/TC 同提交，R2-compat-07） | | |

## 波次② completeTask 定论守卫与加签治理（2 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| PE-04 | completeTask 缺「节点批次已定论」守卫：single 节点定论后 parallel 加签残留任务以相反决策完成得 201（记录 approved→rejected、双终态、中途节点被执行）；或签并发双 curl 双双 201（双 APPROVED 终态+双推进双回写）——首决终结不变量被击穿（两路径均实机复现） | process-engine.ts:683-727（聚合/兄弟取消在锁外）、:806-935（锁回调无 task.nodeId 定论校验）、:898-901、:910→948-986；process.service.ts:949-963（parallel 加签不检查节点 approvalMode） | devil-03〔H〕 | 锁回调开头校验节点定论（nodeExecution 已 COMPLETED 或任务批次已终态→409 或幂等返回——二选一入 ◆3，幂等分支可修正矛盾证据行，R2-engineering-04）；或签补锁内重验（对齐会签 P1-06 修复模式）；parallel 加签对已定论节点拒绝——与 PE-05 联动设计；评审轮补：与现有三处判定（sequential P1-06 锁内重验/countersign stillPending/siblingTasks 聚合）分工对齐，避免第四套重叠（R2-correctness-04） | ◆3 | |
| PE-05 | 运行期「加签(after)」直接改写已发布 ProcessDef.workflowSchema：无 approvalMode 校验/无 G3/无 changelog·审计/无版本，对同节点所有在途+后续实例生效，EXECUTE 持有者可向他人实例静默注入审批权，治理基线（快照）被运行期动作改写；非依次模式改了定义但运行时不消费（只污染） | process.service.ts:966-996（prisma.processDef.update）；消费侧 process-engine.ts:697/766/784 读活表 approveUsers；review.service.ts:1253-1266 基线取活表行 | engineering-02〔H〕 | 加签状态实例化：after 链存实例级（triggerContext/variables 专用键或任务链），不再写 ProcessDef；补审计+changelog；非 sequential 的 after 语义见 ◆2；评审轮勘误（R2-scale-07）：原句「修复后 PE-04 路径①随之收敛」失实——parallel 加签直建任务行（process.service.ts:949-963）不经 ProcessDef，PE-04 的 parallel 守卫须独立做 | ◆2 | |

## 波次③ 冻结 schema 单源与发布契约（3 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| PE-06 | 审批语义读「活表 schema」与令牌推进读「frozenWorkflowSchema」不同源：已发布流程被保存新 schema 后在途实例的会签/依次/驳回语义立即漂移；驳回闸门（冻结）与驳回路由（活表）分属两份 schema；对已离场节点重复注入下游令牌；该分叉零测试覆盖（238 例全绿证明） | 读取分裂：process-engine.ts:688-697（聚合判定）、:859（驳回路由）、:1110/:1222（恢复）读活表 vs :341-342、:626-642、:1358 读冻结；写入面 process.service.ts:172-201 允许对已发布流程原地覆盖且不检查在途实例；mock-factories.ts:197-215 实例默认无 frozenWorkflowSchema | engineering-01〔H〕 | completeTask 聚合判定/驳回路由/两条恢复路径统一改读 instance.frozenWorkflowSchema；completeTask 锁回调补 task.nodeId 活跃性校验（对照 :1057/:1105 恢复路径已有）；mock 工厂默认带 frozenWorkflowSchema 补分叉回归测试；评审轮补：frozenWorkflowSchema 为 null 时保留 ?? 活表回退，勿裸读（R2-engineering-09） | | |
| PE-07 | PUBLISHED 流程一次任意字段 PUT 即静默降 DRAFT（注释自认临时），而「请先归档」守卫指向全库不可达的 ARCHIVED 死状态；守卫被一次常规保存解锁后 DELETE 级联销毁 processApiRelease（钉 major 对外调用随即 404，G6「旧 major 仍可调用」承诺被击穿，全链实机复现）；降级同时记录/定时自动化静默停摆 | process.service.ts:173-180（PUT 降级）、:221-235（删除守卫+级联删 release）；schema.prisma:1141-1144（枚举无 ARCHIVED 下线态）；resolve→404：open-api/process-api-release.service.ts:152-166 | compat-03〔H〕 | 存在 ACTIVE release 的流程：禁止 DELETE 与 DRAFT 化（硬闸，错误信息指向下线路径——评审轮注：该路径现库不存在，随 ◆4 必带子项落地，R2-compat-01）；ARCHIVED 语义与 release 下线联动见 ◆4；与 P1-30（release 级联删）已登记修法合并重审；评审轮补：非 API 流程（记录/定时，恒无 release 行）降级时补 UI 提示面（R2-engineering-02 残余） | ◆4 | |
| PE-08 | 记录触发流程可自触发成无界级联：引擎写库必发记录事件（P1-5 设计），触发匹配零环/深度/来源防护，发布预检无触发环分析——自指流程无限生成实例与记录直至共享 PG/队列耗尽（链路由既有 e2e-14 固化+trigger.service.spec 佐证） | trigger.service.ts:368-446（匹配无防护）；process.service.ts:264-292（预检无环分析）；object-operation.executor.ts:24-28 | devil-01〔H〕 | 发布预检补触发环静态分析（RECORD 触发节点 objectId × 本流程对象操作节点+审批回写对象闭环检测——评审轮扩：writeback×超时 AUTO_APPROVE 可全自动成环，绕过仅扫对象操作节点的检测面，R2-scale-04；处置见 ◆5）；运行时链深防护的传播机制/失败面/上限见 ◆5（评审轮注：triggerContext 系全新构造不继承上游，链深传播须穿 trigger/engine/record 三模块或走 ALS；拒绝点在记录已提交后，失败面不得为一行日志——须告警/通知/补偿，防静默丢审批，R2-engineering-06） | ◆5 | |

## 波次④ 可靠性：搁浅实例族（6 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| PE-09 | 子流程完成 resumeParentAfterSubProcess 持子锁再取父锁，嵌套锁 10s 超时被 catch 仅记日志——父实例子流程节点永久卡 WAITING_USER_TASK，无 sweeper | process-engine.ts:412-422、:1636-1671、:1676-1680；redis-lock.service.ts:28 | correctness-02〔M〕 | 父恢复改队列解耦（子实例完成投递独立恢复 job，不持子锁取父锁）；吞错改可重试路径 | | |
| PE-10 | publish 后定时触发注册 fire-and-forget：Redis 抖动→注册失败仅一行日志，流程呈 PUBLISHED 但 cron 永不触发，UI 无感知，仅重启重扫可自愈（P1-04 账本只在 add 成功后写入，失败无痕迹） | process.service.ts:302-305；trigger.service.ts:306-324（无内部重试） | correctness-03〔M〕 | 注册改发布事务后同步执行+失败重试；重试耗尽处置=登记 register_failed 态可手动重试（评审轮改推荐，R2-devil-02：原主选项「回滚发布状态→DRAFT」会制造 PE-07 硬闸禁止的「ACTIVE release+DRAFT」非法态；与 P1-04 账本联动） | | |
| PE-11 | delayQueue 三类作业（延时恢复/等待条件轮询/审批超时）未传 attempts/removeOnComplete 且队列无 defaultJobOptions：BullMQ 缺省零重试，一次失败永久搁浅实例；completed 作业永久滞留 Redis（实测 completed zset 63→64 跨多日滞留） | process-engine.ts:1148-1152、:1250、:1280-1291；queue.module.ts:24-26 | engineering-03〔M〕 | delayQueue 工厂补 defaultJobOptions（attempts:3+backoff+removeOnComplete），与 processQueue 的 DEFAULT_JOB_OPTS 收敛为共享常量；存量滞留清理一次；评审轮补：BullMQ 选项入队时刻固化，defaultJobOptions 仅对新入队 job 生效——升级时刻在途 job 一次性窗口接受自然消化（R2-compat-08） | | |
| PE-12 | 实例先落库后入队、无补偿无对账：队列瞬断→孤儿 RUNNING 实例；completeTask 决策事务提交后 add 失败→用户 500 重试撞认领 400 的死局；健康端点纯静态不探 PG/Redis/BullMQ；全库无 reconcile/sweeper | process-engine.ts:220-232→:239、:889-902→:934、:1070；health.controller.ts:10-13 | engineering-04〔M〕 | 入队失败补偿（事务内 outbox 或 add 前置+失败回滚实例状态）；health 端点探测依赖；sweeper 巡检孤儿实例（与 PE-13 恢复端点联动） | | |
| PE-13 | 无 error 出边的执行器异常先置实例 FAILED 再 throw：BullMQ attempts:3 重试进门即因非 RUNNING 早退全部空转——瞬时依赖失败=审批永久失败，且全库无 retry/resume 路由（S2 语义被前置 FAILED 击穿） | process-engine.ts:503-571（先 FAILED 后 throw）、:323-326（非 RUNNING 早退）；process.processor.ts:90-105 注释与引擎自相矛盾 | engineering-05〔M〕 | 无 error 出边异常先 throw 不置 FAILED（交给 attempts 重试），耗尽后在 processor 侧 final-failure 回调置 FAILED（写明判定点 isFinalFailure/attemptsMade）；补 admin 恢复端点（retry/resume，权限规格见 ◆6）；评审轮补（R2-scale-01）：processor 对 NonRetryableNodeError 分支须同步落 FAILED——其吞错前提=「引擎已置 FAILED」恰被本修法摘除，否则全库 9 处抛出点（均在 user-task.executor）从 FAILED 留痕变永久 RUNNING 搁浅，倒退 R2 轮防静默挂起工作 | ◆6 | |
| PE-14 | completeTask 任务认领在实例锁外先行生效：锁等待 10s 超时抛 500 后任务已 APPROVED 终态但令牌永不推进，重试 400（认领阻断），S1 超时兜底只查 PENDING 救不了（实机复现：持锁 60s→500→400→实例永久 WAITING_USER_TASK） | process-engine.ts:647-662（锁外认领）、:806；handleTaskTimeout :1366-1370 仅查 PENDING | scale-06〔M〕 | 认领移入锁内，或认领后加锁失败即回滚任务状态保持可重试；与 PE-12/PE-04 同批统一「认领+推进」原子性设计（评审轮扩批，见执行约定 7③）；评审轮可选补：锁续期失败现静默不中止临界区（fencing 缺口），至少补观测（R2-correctness-03） | | |

## 波次⑤ 环境·语义·版本（5 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| PE-15 | 审批超时（task_timeout）恢复只 set 租户不 set 环境上下文：dev 实例超时自动审批按 prod 字段定义重算 rollup/formula、以 prod 口径触发后续流程（击穿 R1.4 环境隔离） | process.processor.ts:128-138（仅 runWithTenant）；writeback→record.service.ts:780/820-836/879→trigger.service.ts:421-430 | engineering-07〔M〕 | task_timeout job 载荷带 environmentId，processor 恢复用 runWithEnv（对齐 executeNextNode :291-298 模式）；评审轮补：载荷缺 environmentId 时（升级时刻在途存量 job）从实例行 environmentId 取 fallback（R2-compat-08） | | |
| PE-16 | 依次审批 2..N 环任务在 completeTask 内联创建绕过执行器用户校验：审批人被删/停用→无人可见 PENDING，实例永久搁浅，代审批/改派均 400，唯一出路破坏性取消（实机全链复现；对照 FORM_FIELD 动态审批人有存在性校验，同链口径分裂） | process-engine.ts:777-788（approveUsers[nextIndex]! 直建）；user-task.executor.ts:100-110 对照 | engineering-08〔M〕 | 环内建任务前校验用户存在+有效（复用执行器校验）；失效→清晰错误+任务处置路径（改派或可见告警）；评审轮补（R2-scale-02）：校验点位置=锁内、认领与 sequentialIndex 推进之前（或与 PE-14 同批）——插在锁外认领之后会制造 PE-14 同构「已认领却推进失败→重试 400」死局 | | |
| PE-17 | 节点副作用与状态推进非原子+attempts=3 at-least-once：副作用先行、状态事务与令牌推进分立三段、无「已执行未推进」去重守卫——重试/stalled 重投整段重执行节点，外发副作用×2 | process-engine.ts:439-448→:471→:477-490→:381-391；B4 仅跳 WAITING | devil-06〔M〕 | 节点执行两段标记（执行行 PENDING→副作用→COMPLETED）+重入守卫（已 COMPLETED 未推进→续推进不重执行）；与 PE-13 重试语义联动 | | |
| PE-18 | 顶层 decision 别名被每审批节点无条件覆写：并行多审批时「最后完成者」成全局 decision，实证「别名≠路由」自矛盾终态（业务走批准终点而 variables.decision=REJECTED）——方言指南教的 {"var":"decision"} 在多审批 schema 下是陷阱 | process-engine.ts:838-842（R5.5 兼容层） | devil-08〔M〕 | 别名收敛为节点命名空间注入（迁移窗口+方言指南修订+冻结快照求值层兼容），处置见 ◆7 | ◆7 | |
| PE-19 | ProcessDef 无版本历史（schema 原地覆盖、publish 同行自增），实例不记录执行版本，DTO 返回「当前」版本号——实测同一实例重发布后版本 2→3 漂移而冻结 schema 未变；历史实例审计失真+无回滚锚点 | schema.prisma:585-609；process.service.ts:193-201、:294-300、:1173 | engineering-06〔M〕 | 轻量：实例行加快照版本列（toInstanceDto 读快照值）；ProcessDefVersion 全历史表牵动 G6，见 ◆8 | ◆8 | |

## 波次⑥ 性能与数据面（7 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| PE-20 | 批量操作 filter 路径无行数上限，与文件头「受 BATCH_MAX_ROWS(500) 约束」注释矛盾：广匹配全量 ID 载入+锁内串行完整更新（对照同目录 object-operation 筛选删除有 take 500） | batch-operation.executor.ts:11、:100、:115（对照 :70-72/:148-150 与 object-operation.executor.ts:111-115） | scale-02〔M〕 | filter 路径 findMany 补 take=BATCH_MAX_ROWS（超限报清晰错误），兑现头注释契约 | | |
| PE-21 | 记录事件触发热路径每事件全量拉取应用全部已发布流程完整 workflowSchema 并逐个 JSON 解析（实测 13 流程≈25KB/事件），update/delete 路径无预算直连，批量删除逐行放大 | trigger.service.ts:380-399；触发面 record.service.ts:703/868/939/1082 | scale-04〔M〕 | 发布时物化触发摘要（triggerType/objectId/cron 投影列，I-1 SSOT 约束下的反规范化），匹配先投影后按需载 schema；可选进程内短 TTL 缓存；评审轮补：投影=活表加列（保留 status 过滤语义，I-1 匹配集语义不变），降级/删除路径同步维护投影列，勿独立摘要表（R2-compat-06） | | |
| PE-22 | 流程执行全局共享 worker 每副本硬编码 concurrency:5、单 job 锁内串行跑完整条令牌链（含 10s 超时 HTTP 节点）——单租户一个扇出流程可占满执行池拖停所有租户（实测单 job 110s 独占佐证） | process.processor.ts:108、:155；process-engine.ts:290-299、:346-392；ssrf-guard.ts:184-186 | scale-05〔M〕 | 本轮：concurrency 环境变量化；逐 token 重入队/租户公平调度牵动大，见 ◆9（对齐 AGENTS「水平扩展前压测 BullMQ」风险登记） | ◆9 | |
| PE-23 | 「我发起的」按 triggerContext JSONB path 过滤无索引：EXPLAIN 实测 Seq Scan 逐行抽取，运行时门户常规入口每次 2×扫描（平台对 records 已有 @>+GIN 先例 A-H1 未应用） | process.service.ts:575-590；schema.prisma:641-644 仅四索引 | scale-08〔M〕 | 表达式索引（(trigger_context->>'triggeredByUser')）或 jsonb_path_ops GIN，迁移生成 | | |
| PE-24 | 流程域三列表（任务/我的实例/实例列表）pageSize 直接 parseInt 透传无上限：实测 pageSize=100000 全量返回 386 条含触发快照（同参数 /notifications 被裁 50 的同库约定背离） | process.controller.ts:124-130、:172-178；process.service.ts:533/587/679 | scale-09〔M〕 | 三端点 Math.min 封顶（评审轮补：封顶值明示——50 对齐 in-app-message 或 100 对齐 record，定一个入 TDD 断言，R2-correctness-09）；任务列表 triggerContext 收敛投影须保留 inputs/record 白名单键（TaskCenter 申请内容渲染消费面、OCR M1 已显式接受，裁掉即申请内容回归裸 key/空态，R2-scale-09） | | |
| PE-25 | 循环容量两界自相矛盾：loop 执行器允许 1000 迭代，引擎按全实例 NodeExecution 总行数 1000 判死（每迭代节点+体各一行）——600 元素合法循环实测跑完后被 FAILED「检测到循环执行」，副作用已写无补偿、诊断误导 | loop.executor.ts:70-75 vs process-engine.ts:84、:329-338（每次执行无条件建行 :439-448） | devil-05〔M〕 | 预算口径统一：MAX_NODE_EXECUTIONS 改 per-node 计数（评审轮补：检查点须移入 while 循环内复查——现检查仅在 job 进门执行一次，纯同步循环单 job 一气跑完永不复查，默认 1000 迭代×10s HTTP≈2.8h 独占 worker 槽+实例锁；per-node 上限与 DEFAULT_MAX_ITERATIONS 须协同勿同值，R2-scale-05/correctness-01），或 loop 发布/执行前按 maxIterations×(体节点数+1) 前置校验预算并给出真实上限提示 | | |
| PE-32 | 实例列表两 findMany 无列投影：frozenWorkflowSchema（单行 ~25KB，量级锚 PE-21 实测）与无界 variables/triggerContext 逐行解压传输后被 toInstanceDto 丢弃——「我发起的」Seq Scan 路径（PE-23）逐行放大，MB 级无用传输；PE-23/24/28 均不覆盖此入口（评审轮新增） | process.service.ts:527-536（listInstances）、:581-590（listMyInstances）无 select；toInstanceDto :360-405 对 frozen/variables 零消费 | R2-scale-06〔M〕 | 两路径补 select 投影（对 DTO 零消费列收敛，零契约破坏）；PE-23 索引回表行宽同步受益 | | |

## 波次⑦ low 清偿（6 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 状态 |
|---|---|---|---|---|---|
| PE-26 | listTasks/listMyInstances status 非法枚举值裸 cast 触发 500 而非 400（实机双端点亲测） | process.service.ts:651-663、:573-579 | correctness-07〔L〕 | 枚举白名单校验 400（含大小写映射归一） | |
| PE-27 | 超时 NOTIFY 催办对已删 assignee 直接 createMany 产生永无人读孤儿站内信（实机复现） | process-engine.ts:1372-1389 | correctness-08〔L〕 | 催办前 assignee 存在性校验 | |
| PE-28 | 每 job include 同时装载冻结 schema+processDef 全行两份 JSON（体量随实例×节点放大；冻结本身系 R1.4 设计成本，双份装载属投影缺口） | process-engine.ts:318-321、:341-342 | scale-10〔L〕 | execute 路径 include 投影收敛（活表 schema 仅 completeTask 路径需要） | |
| PE-29 | queue 目录 3 源文件零 spec；process spec 中 frozenWorkflowSchema 仅出现 null（分叉零覆盖，PE-06 类缺陷存活缝隙）；writeback 有专测（裁决已勘误该子主张） | apps/gateway/src/queue/*；mock-factories.ts:197-215 | engineering-09〔L〕 | ProcessProcessor 单测（NonRetryable 分类/scheduled 分支/env 恢复）+frozen 分叉回归（随 PE-06 补） | |
| PE-30 | WorkflowSchema 无 schemaVersion（全库零引用）；TriggerConfig 嵌套形状系无消费者死契约，引擎实际消费画布扁平形状仅注释维系（含事件词汇 CREATE vs created 对不上） | packages/shared/src/process/index.ts:66、:222-231；trigger.service.ts:54-59 | compat-02〔L〕 | schema 加 schemaVersion 字段（写入端默认 1）；死契约删除或标注实际消费形状 | |
| PE-31 | WorkflowSchema 写入端仅 @IsObject、发布预检对未注册节点类型 default return false 放行——坏形状/未知类型全链绿灯发布、首实例才 FAILED；node-check 清单与 NodeExecutorRegistry 无锚定测试（node 实测未注册类型过预检） | dto/process.dto.ts:20/37；node-check.ts:68-69；node-executor.registry.ts:94-103 | compat-05〔L〕 | collectNodeIssues 对未注册类型改 error 级；补 node-check↔registry 双向锚定测试（R5 D2 模式） | |

## 降级 10 条处置清单（复核后多为文档化接受，可选硬化项单独裁决）

| 裁决号 | 原定性 | 降级依据（裁判溯源） | 处置建议 |
|---|---|---|---|
| correctness-01 | 运行面 start 无应用归属校验=越权 | 【评审轮勘误，R2-devil-03】原依据失实：ADR-0005 决策 8 语义方向相反（可用哪些应用由角色权限经 listVisibleForUser 归纳，start 不做归纳）；2026-10-23 勘误明示「路由形态不动≠运行时语义豁免」；P0-9/P0-10 已确立运行面双门原则，唯独 process start 未补且 31 工单+9◆ 无处置 | **【已裁决 2026-11-08 = a】** a) 增列工单：start 补应用可见性归纳（isInternal/未发布应用流程可被启动+引擎系统上下文读写其数据），并入 R-B 波次；b) 留权限轮统一处理（否） |
| security-04 | /apps/:appId/processes 返回全量 workflowSchema（含 http_request 节点 headers——凭证可能入内） | 【评审轮勘误，R2-engineering-07】清单可见性系 ADR-0005 决策 10 裁决设计，但 payload 字段投影无契约背书（决策 10 只裁「只回已发布」）；原行 low 定级与「建议排期」自相矛盾 | **【已裁决 2026-11-08 = a】** a) 升级正式工单：运行面投影 DTO（不下发设计级 schema 含 url/headers），并入 R-B 波次；b) 维持降级（否） |
| security-06 | /processes/analytics 全租户开放 END_USER | 知识库明文 carve-out（租户级治理读留运行面） | 残余硬化：角色闸或按可见应用收敛（可选） |
| security-07 | http_request 变量覆盖 url/method 重定向 | 发布闸强制 data.method/url（实机验证发布被拒），data 恒胜 inputs，headline 不可达 | 残余硬化：发布预检禁 connectorId/headers/body 变量绑定（可选小修） |
| correctness-04 | trigger 应用级匹配跨对象误触发 | I-1 修复刻意保留的存量兼容语义（注释+spec+知识库三重固化） | 残余硬化：发布预检强制 RECORD_* 触发节点绑定 objectId（防呆，建议采纳） |
| correctness-05 | buildEvalScope 同名输出覆盖不稳定 | global 优先被逐次强制+57 例 spec 钉死，行为确定性成立 | 文档修订：注释补 node-vs-node 维度语义说明 |
| correctness-09 | 回写失败仅日志记录与流程不一致 | 「不阻断」系 2026-10-04 交互评审显式设计（测试钉死） | 残余硬化：补偿通道+审批人可见告警（与 PE-17 联动，可选） |
| engineering-10 | SCHEDULED 发布注册写死 prod+fire-and-forget | 主体与 PE-10（correctness-03）同题；多副本竞争主张被 RedisLock+P1-04 测试反证 | 并入 PE-10；残余=dev 新发布静默不触发的 DX 提示 |
| compat-01 | G6 版本承诺不冻结引擎行为 | 承诺对象=API 契约+schema 数据冻结（三处文档核实）；两枚「实锤」均为平台红线强制的缺陷修复 | 前瞻项不排期：未来引擎行为版本分派机制（若语义有意变更） |
| compat-04 | DEPRECATED 无治理终态/sunset | floating-latest 系自文档化语义；永久可调=承诺本体 | 可选治理硬化：发现端点补 status/sunset 元数据 |

驳回 2 条（不修，留档防重报）：correctness-06（前提引用失实——`EnvironmentKey` 实为 `dev|prod` 两成员，硬编码清理覆盖全部环境）、correctness-10（自反性发现——推演自行得出竞态已被 P1-6 闭合）。

## ◆ 开工前裁决项（9 项，建议一次性收集）

| ◆ | 项 | 选项 |
|---|---|---|
| 1 | PE-01 启动变量治理口径（评审轮重写） | a) 仅禁非 MANUAL 触发类型手动启动（判定源/闸位见工单行）；b) 变量命名空间隔离 inputs.*——评审轮证据：键黑名单不可枚举、变量改名即绕过，b 系唯一根治（排除理由仅迁移面大）；c) 服务端忽略引擎保留键全谱（recordId/sequentialIndex/global/_joins）+节点 objectId 域校验+【强制】发起人 permissionContext（含 OpenAPI/G6 通道覆盖口径）。建议维持 a+c（c 为扩展版）；若开工 TDD 实测 c 护不住（如新的保留键消费点），升 b |
| 2 | PE-05 加签(after) 语义 | 实例化存储后保留 after 链形态（推荐，用户语义不变）vs 仅保留 parallel（after 下线）；评审轮注：存储位置三路径（triggerContext 冻结/variables 活引用/任务链——parallel 直插 ProcessTask 有先例）行为差异随开工 TDD 定，与 PE-06 读源联动（执行约定 7①） |
| 3 | PE-04 已定论节点的 parallel 加签处置（评审轮扩） | 拒绝加签（400，推荐）vs 允许但任务即时取消；另裁：定论守卫命中时 409 vs 幂等返回（幂等分支可修正矛盾证据行，评审轮新增） |
| 4 | PE-07 已发布流程编辑工作流（评审轮扩） | a) 维持 PUT→DRAFT 快捷迭代+ACTIVE release 存在时硬闸（最小改动）；b) 新建版本式编辑（牵动大，与 ◆8 联动）；**必带子项（评审轮新增，R2-compat-01）**：release 下线/退役路径——现库无任何退役端点、ARCHIVED 无写入点，缺此项则硬闸落地=不可编辑·不可删除·不可退役的单向门，G6 新 major 迭代被掏空；落地=主动退役端点（ACTIVE→DEPRECATED）+ARCHIVED 写入点，PE-07 硬闸错误信息指向该路径 |
| 5 | PE-08 触发环防护（评审轮扩） | 预检静态分析：拒绝发布（硬拦，推荐）vs 警告放行（检测面含 writeback×触发 objectId 闭环）；运行时链深：上限默认 3 须给数值依据+环境变量化（常量管理规范）；传播机制选型（triggerContext 承载/ALS/记录行深度列——跨三模块）；失败面设计（告警/通知/补偿，非静默丢审批） |
| 6 | PE-13 失败语义与恢复（评审轮扩） | 重试耗尽置 FAILED+admin 恢复端点（retry 从失败节点重投，推荐）vs 仅人工 DB 介入；恢复端点权限规格（评审轮新增，R2-engineering-05）：归属校验=发起人/受理人/租户·应用 admin（对齐 PE-02 口径）+targetIdParam，禁落运行面通配 EXECUTE 惯例（否则任何 EXECUTE 用户可重投他人实例），锚定断言随 TDD |
| 7 | PE-18 decision 别名（评审轮补成本信息，R2-engineering-08） | a) 废弃顶层别名→节点命名空间（迁移窗口+指南修订）——须知：G6 release 冻结快照永不修改且承诺永久可调、在途实例 frozen schema 不可变，迁移窗口管不了这两类；MCP 指南（mcp-server.factory.ts:486）正教 {"var":"decision"}，存量快照停注入后 decision 边恒 undefined→条件边全不匹配→流程静默终结；选 a 须带求值层兼容（别名注入对冻结快照保留）或确认零存量后快进；b) 保留别名+指南禁用多审批裸引用。原推荐 a 维持，裁决前须知上述成本 |
| 8 | PE-19 版本锚点 | 实例快照版本列（轻量，推荐先做）vs ProcessDefVersion 全历史表（牵动 G6 与回滚能力，另立专项） |
| 9 | PE-22 执行池公平性 | 本轮仅 concurrency 配置化（推荐）vs 同轮做逐 token 重入队/租户公平调度（建议留压测轮，对齐 AGENTS 风险登记） |

### ◆ 裁决结果（2026-11-08，用户「全按推荐」收齐，R-B 开工放行）

| ◆ | 裁决 |
|---|---|
| 1 | **a+c**：仅禁非 MANUAL 手动启动（判定源 extractTriggerInfo/闸位显式 channel）+ 保留键全谱忽略（recordId/sequentialIndex/global/_joins）+ 节点 objectId 域校验 + 发起人 permissionContext 强制行级校验；TDD 实测 c 护不住新保留键消费点时升 b |
| 2 | **保留 after 链**（实例级存储，不再写 ProcessDef）；存储位置三路径随开工 TDD 定，与 PE-06 读源联动 |
| 3 | **拒绝加签 400 + 定论守卫 409**（对齐 P1-01 原子认领/P1-06 锁内重验的显式拒绝惯例；评审轮留白的幂等分支不采纳） |
| 4 | **a + 退役子项必带**：维持 PUT→DRAFT 快捷迭代 + ACTIVE release 硬闸 + 主动退役端点（ACTIVE→DEPRECATED）+ ARCHIVED 写入点（防单向门掏空 G6 迭代）——**已落 ADR-0007** |
| 5 | **打包**：预检静态分析硬拦（检测面含 writeback×触发 objectId 闭环）+ 运行时链深默认 3 环境变量化 + **ALS 传播**（租户/环境上下文已走 ALS，跨三模块成本最低）+ 达上限实例显式 FAILED + 告警通知（非静默丢审批） |
| 6 | **按工单全做**：重试耗尽 processor 侧置 FAILED（NonRetryableNodeError 分支同步落 FAILED 防搁浅）+ admin retry 恢复端点（归属校验=发起人/受理人/租户·应用 admin + targetIdParam，禁落运行面通配 EXECUTE） |
| 7 | **a + 冻结快照求值层兼容必带**：顶层 decision 别名对新 schema 废弃→节点命名空间；已发布 release/在途实例（frozen schema）永久保留别名注入；MCP 方言指南同批修订停教裸引用——**已落 ADR-0007** |
| 8 | **实例快照版本列先做**（发布时钉值，toInstanceDto 读快照值）；ProcessDefVersion 全历史表牵动 G6 回滚另立专项——**已落 ADR-0007** |
| 9 | **仅 concurrency 配置化**；逐 token 重入队/租户公平调度留压测轮（对齐 AGENTS 风险登记） |

> 评审轮新增（R2-engineering-10）：◆4（已发布流程可变性）、◆7（方言契约变更）、◆8（版本历史牵动 G6）系 ADR 级架构决策——裁决后须落 ADR（新增或修订既有），工单表回引 ADR 号；其余 ◆ 为实现级裁量。**✅ 三项已于 2026-11-08 落 ADR-0007（docs/adr/0007-published-process-mutability-decision-alias-version-anchor.md）。**

## dev 库复现残留清理清单（裁判复现遗留，建议开工前清一次）

- 越权演示数据：受害记录 `cmvncbvbe01lhlj1jat4so656`（880 万合同，被 APPROVED）、攻击实例 `cmvncc4kd01lxlj1jhzhwzse1`（COMPLETED）
- `judge_*` 前缀流程族与实例：judge_devil03*（或签双终态）、judge_eng06（锁超时）/judge_eng06_verattr（版本漂移实例 cmvndo4ns01twlj1jcf0z8nvz）、judge_eng08_seq、judge_c08_notify（含 1 条孤儿站内信）、judge_compat03、judge_d08_decision_alias、judge_delay_retention、judge_devil05_loopbudget（FAILED 实例 cmvndri0x01utlj1jb0y33p9w）、judge_sec07_httpvar（DRAFT）
- 已删除的一次性 victim 用户（engineering-08/correctness-08 复现用）
- Redis：`bull:delay-queue:completed` 集 64 条滞留作业
- devil-05 复现的 1203 行执行记录随实例删除级联

## 修复与既有工作的关系

- P1-06（sequential 推进入锁+状态校验，TC-225）已覆盖 sequential 中间环节的并发窗口，但 devil-03 的或签并发与定论守卫缺口独立存在（approval-semantics.spec 仅会签有并发测试）——PE-04 补齐时不重做 P1-06；
- P1-30（release 级联删）与 PE-07 合并重审：级联删在有 ACTIVE release 硬闸下退居二线；
- P1-04（定时注册 RedisLock 串行+账本）是 PE-10 的前置既有件，本轮补发布路径失败补偿；
- 波次⑤ PE-17/PE-18 与 R3（S1 超时/S2 错误出边）语义相邻，修完须回归 S1/S2 既有单测（approval-semantics 37 例、超时路径）；
- e2e/22 本地 isInternal 假警为既知问题，与本轮无关。
