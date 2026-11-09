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
