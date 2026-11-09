# PE 波次①之一实现记录：PE-02 + PE-03（2026-11-09）

- 依据：PE 工单档波次①（启动·身份·取消安全 3 条）；PE-01（三层组合大改）留波次①之二单独批
- 范围：PE-02（cancel 归属校验〔H〕）+ PE-03（triggeredByUser 伪造〔M〕）

## 交付
1. **PE-02**：`cancelInstance` 增 `userId` 参数——复用 `assertInstanceVisible`（超管/租户管理员/发起人/任务参与人，M-2 既有口径）做归属校验，非归属者 403；`userId` 缺省=内部调用不受限（定时/系统路径兼容）；controller 传 `req.user.id`。对齐 withdrawInstance 惯例（工单指定修法）。
2. **PE-03**：`startInstance` 发起人注入改 `callerUserId ?? req.triggeredByUser ?? null`——JWT 用户通道 caller 强制覆盖 body 伪造值；显式值仅保留给无 caller 的服务身份通道（OpenAPI 直调 engine.startProcess 不经本方法；webhook 两者皆不传不受影响）。**A3 语义修订（R2-compat-07）**：R1 轮「显式传入优先」→「用户通道强制覆盖」，本记录即落档点（R1 档 PROCESS-ENGINE-TOPIC-R1-INITIATOR-2026-10-11.md 的 A3 节以本记录为准）。
3. 测试：process-start-instance.spec 8/8（PE-03 重写「显式优先」锚定为 caller 覆盖 + 新增服务身份保留/PE-02 四路：403/发起人/受理人/内部调用）——旧锚定测试语义被 PE-03 推翻，修订理由即工单本身（伪造向量为缺陷）。

## 验证
全量 `pnpm test` 11/11 + typecheck 11/11；TC-260（PE-03）/TC-261（PE-02）入库 TEST-CASES v3.11；QA-PLAN v1.0.26。

## 余
波次①之二：PE-01（◆1=a+c 三层：controller 闸 extractTriggerInfo 判定+保留键全谱剥离+引擎写 permissionContext 强制+listPublishedProcesses 过滤）——单独批 TDD。

## 追记：波次①之二——PE-01 层①②（2026-11-09，本提交）

- **层① 手动启动闸**：assertManualStartable（判定源 extractTriggerInfo，MANUAL/SCHEDULED 放行，其余 400）；controller startInstance 调用点先行；不落 engine.startProcess（webhook 硬写 MANUAL 与手动同值不可分，R2-compat-02）。
- **manualStartable 投影**：listPublishedProcesses DTO 增字段；AppView 发起谓词从顶层列 triggerType 改读 manualStartable——原顶层列对画布流程不同步（I-1 缺陷遗产）=假 MANUAL，正是越权入口本体。
- **层② 保留键剥离**：ENGINE_RESERVED_VARIABLE_KEYS = recordId/sequentialIndex/global/_joins，startInstance 变量入口剥离（◆1=c「服务端忽略保留键全谱」；b 命名空间方案按裁决留升级路径——若 TDD 实测 c 护不住新保留键消费点再升）。
- **层③ 未做（另批）**：引擎内记录写（object-op/writeback）recordId ∈ 节点 objectId 配置域+应用域校验 + 发起人 permissionContext 行级强制——两 primal 攻击向量已由层①②闭合（假 MANUAL 闸+保留键剥离），残余面=引擎内部写通道（配置错误/跨对象桥梁），按工单独立批次 TDD。
- 验证：spec 12/12（闸 3 形态含「无触发节点+顶层列 RECORD_CREATED 回退负向」/剥离/投影）+全量 11/11+e2e 99/99（AppView 谓词改源后 runtime 页面回归全绿）；TC-262/263 入库 v3.12。

## 追记：波次①之三——PE-01 层③（2026-11-09，本提交）

- object_operation update/delete 写前 `assertWritableTarget`：①recordId ∈ 节点 objectId 配置域+应用域（跨对象/跨应用 NonRetryable）；②发起人 permissionContext 强制携带（explain 取 ALLOW 规则 mergedCondition/fieldScope 注入写内核 WHERE）。
- **裁决语义修正**：初版「无 EDIT 硬拒」被 e2e 16/20/21 实证打破审批回写契约（发起人通常仅 CREATE）——按裁决括号项修正为携带语义，无规则残余明示（R2-security-03 原文「不可作理想项」）。writeback 豁免域校验（recordId 引擎生成非注入）。
- 验证：node-executors 46/46（+5，含既有 2 例夹具随域校验前置修正——红线 1 理由=防呆语义保留仅消息/夹具变更）+process 270/270+gateway 1068+e2e 99/99（采购链修复实证）。TC-264 入库 v3.13。

## 追记：波次②③合并批一站——PE-06 冻结单源化（2026-11-09，本提交）

- ②×③ 波次依赖地基（PE-05 实例化×PE-06 读源对聚合段是相反改写指令，先定读源）：completeTask 聚合判定/驳回路由/等待条件恢复/恢复推进四处统一改读 `instance.frozenWorkflowSchema ?? processDef.workflowSchema`。
- 分叉回归测试：冻结 sequential [u1,u2,u3] × 活表被改 single → u1 通过后 u2 任务照生成、令牌不推进（改前读活表则 single 直通推进——红→绿）。
- 验证：process 271/271+全量 11/11+typecheck+e2e 99/99。TC-265 入库 v3.14。PE-04/05 下一批在此读源上实施。

## 追记：波次② PE-04（2026-11-09，本提交）

- completeTask 锁回调双守卫（◆3=409 拒绝不幂等）：①nodeExec COMPLETED→409（single 定论后 parallel 加签残留任务链）；②锁内本任务状态重验→409（或签 claim/聚合窗口双决策链）。残余=single 推进入 worker 异步标记前毫秒窗口（B2 令牌锁兜底）。
- parallel 加签拒已定论节点（400）——直建任务行不经 ProcessDef，守卫独立（R2-scale-07 勘误）。
- 验证：+2 例 TDD 红→绿（reject 用例先被 rejectToNodeId 预检拦截改 approve——守卫在锁回调，位次在预检之后）；process 273/273+e2e 99/99。TC-266/267 v3.15。

## 追记：波次② PE-05（2026-11-09，本提交）——波次② 2/2 全清

- after 加签实例化：存实例 variables `_addSign:<nodeId>` 完整有序名单（插当前 sequentialIndex 后）+writeAudit+changelog；ProcessDef 零写入（治理基线/冻结快照不可被运行期改写）。引擎 completeTask 顺序分支实例级名单优先消费（冻结定义回退）。非 sequential after→400 指引 parallel（原只污染）。
- 语义修正：PE-06 冻结读源后原活表写对在途实例已不生效（加签链断裂）——本单恢复能力同时完成治理化；旧「写回定义」锚定测试被 ◆2 推翻改写（红线 1 理由=工单本身）。
- 验证：process 273/273+全量 11/11+e2e 99/99。TC-268 v3.16。

## 追记：波次③ PE-07（2026-11-09，本提交）——◆4/ADR-0007 出口

- ACTIVE release 硬闸（PUT 降级/delete 400 指向退役路径）；主动退役端点 release/retire（ACTIVE→DEPRECATED+changelog，DEPRECATED 仍可调）；archive ARCHIVED 写入点（ACTIVE 先退役；PUBLISHED 归档取消定时注册 I-1 同口径；归档≠删除——删除仍过 PE-04 实例守卫）。
- **契约变更（ADR-0007 §一）**：G6 迭代改「先退役再编辑再发新 major」——e2e/19、20 三处已改 retire 先行（14/14 过）。UI 退役/归档入口待后续轮。
- 验证：+4 例 TDD 红→绿（trigger mock 补 onProcessUnpublished）+process 277/277+全量 11/11+e2e 99/99。TC-269/270 v3.17。

## 追记：波次③ PE-08 层①（2026-11-09，本提交）——波次③ 2/2 全清

- 触发环发布预检静态硬拦：shared collectTriggerLoopIssues（环①对象操作写回触发对象/环②RECORD_UPDATED×回写），publishProcess 400 直出环清单，画布可同源标红。
- **诚实登记**：运行时链深防护（◆5 打包项：ALS 跨 BullMQ 传播+链深环境变量+显式失败面）为后续子项——ALS 上下文不过队列边界，需触发上下文穿透 trigger/engine/record 三模块的设计 spike；环源已被静态硬拦封死（两形态），存量经 S-01 脏配置扫描兜底。
- 验证：shared 23/23（+4）+process 278/278（+1）+全量 11/11+e2e 99/99。TC-271 v3.18。

## 追记：波次④ PE-11（2026-11-09，本提交）

- delayQueue 队列工厂补 defaultJobOptions（QUEUE_DEFAULT_JOB_OPTS 共享常量，引擎 DEFAULT_JOB_OPTS 同源收敛）：attempts=3+指数退避+removeOnComplete/Fail——三类作业一次失败不再永久搁浅实例，completed 作业不再永久滞留 Redis。
- R2-compat-08：defaultJobOptions 仅对新入队 job 生效（在途一次性窗口自然消化）；存量滞留清理脚本登记后续。
- 验证：queue-defaults.spec 新建+process 279/279+全量 11/11+e2e 99/99。TC-272 v3.19。

## 追记：波次④ PE-14（2026-11-09，本提交）

- completeTask 主路径锁失败（非业务错误）回滚认领：任务恢复 PENDING（decision/completedAt 清零）保持可重试；业务 409（PE-04 守卫/实例终态）不回滚防复活。部分方案（裁决=移入锁内或失败回滚，采后者；移入锁内统一方案随 PE-12 批评估；顺序分支内层锁同暴露登记）。
- 验证：approval-semantics +1 例（自建引擎挂具注入 withLock 拒绝）+process 279/279+全量 11/11+e2e 99/99。TC-273 v3.20。
