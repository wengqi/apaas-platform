# 对抗审查 P1 专项工单（2026-10-23）

> 来源：全项目对抗审查两轮裁决并集（76 条确认）中的全部 30 条 medium。
> 本档是 P1 专项修复的**起跑线工单**（取代主档第四节 prose 形态，逐项带状态跟踪）；
> 裁决原文与证据链见 `ADVERSARIAL-REVIEW-2026-10-23.md`，对话结论以两档并读为准。
> P0 十项已于 a03bdc2 全清推送；P2（36 条 low）另行登记不排期。
>
> **◆ 裁决已全部收齐（2026-10-24）**：P1-02 乐观锁（version 列条件更新，冲突 409）/
> P1-05 字段定向写（只 merge rollup 字段）/ P1-07 看门狗续期 / P1-09 全硬拦（列引用清单）/
> P1-16 Connector 加列 processDefId + 存量回填 / P1-17+18+24 三处 SQL 下推全做（非数值聚合保留内存）/
> P1-21 短 TTL（30s）+ 四类写路径主动失效 / P1-26 阻断（要求先转移所有权）。

## 执行约定（专项会话开跑前读）

1. **基线事实勿重审**：各项「实测证据」均经两轮裁判活体复现固化，直接采信，不复现不推翻；
2. **TDD**：每项先写能红的复现测试再修（项目红线）；新用例编号从 **TC-208** 起，同提交更新 TEST-CASES.md + QA-PLAN；
3. **标尺**：medium=功能缺陷/明确性能瓶颈/一致性问题（对齐裁决书全池标尺，勿升勿降）；
4. **每项修完**：受影响包单测 + typecheck + lint 全绿，随批走 OCR/QA/e2e 闸门后推送 main；
5. **「需裁决」列**：标 ◆ 的项有小设计取舍，开工前向用户要裁决（建议一次性收集）；
6. 完成一项在本档状态列打 ✅ 并补 TC 号。

## 波次① 并发 / 事务（10 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| P1-01 | unique 字段 check-then-write 竞态且 DB 无唯一约束：6 并发实测 6×201 全落库，不变量静默全量破坏 | record.service.ts:978-991；schema.prisma Record 仅 GIN 无唯一索引 | R2-correctness-02 | 按字段建 partial unique index（`(data->>'apiName')` WHERE object_id=…，A-H1 先例），迁移生成 + P2002→409 翻译已有 | | ⬜ |
| P1-02 | 记录更新无锁 read-merge-write 丢失更新：25/25 并发轮字段被陈旧快照无痕覆盖 | record.service.ts:596-673 | R1-correctness-05 | 乐观锁（version/updatedAt 条件更新，冲突 409 重试提示）或事务内行锁 | ◆ 锁策略 | ⬜ |
| P1-03 | applyApproved 无事务：并发审批双 201、同一提交双审计行（实测） | review.service.ts:565-592（getPendingOrThrow:1047 裸 findFirst） | R1-correctness-10 + R2-correctness-04 | $transaction 包裹 + `UPDATE … WHERE status='PENDING'` 乐观锁（期待 1 行） | | ⬜ |
| P1-04 | 定时触发注册 remove+add 窗口：串行换 cron 即双 cron 并存、竞态 49/50 吞注册；rebuild 清理对 BullMQ 5.81.3 纯哈希 key 是死代码 | trigger.service.ts:223-238 | R2-correctness-07 | 注册按环境串行化（RedisLock）+ 清理逻辑按真实 key 形态重写 | | ⬜ |
| P1-05 | Rollup 反向重算以陈旧副本整份写回父记录：并发风暴一轮即中，业务字段陈旧+聚合字段新鲜混合写回 | rollup.service.ts:300-408（recomputeOneParent） | R1-correctness-07↓ + R2-correctness-06 | 字段定向写（只更新 rollup 字段，updateMany 按列合并）或按父记录串行化 | ◆ 写回策略 | ⬜ |
| P1-06 | sequential 中间环节审批不加实例锁不校验状态：与 cancelProcess 并发产生幽灵 PENDING 任务（实测 7/20） | process-engine.ts:740-768（对照 :777/:789 主路径） | R1-correctness-09 | 补 withInstanceLock + 实例状态校验，对齐主审批路径 | | ⬜ |
| P1-07 | 流程实例分布式锁固定 30s TTL 无看门狗：锁级实测 32s 临界区竞争者 30.0s 获锁，互斥被破 | redis-lock.service.ts:12,60-79 | R1-scale-07↓ + R2-scale-02 | 看门狗续期（holder 存活即续 TTL）或锁内墙钟预算超限主动放弃 | ◆ 续期实现 | ⬜ |
| P1-08 | OWNER 行与应用创建非事务：故障窗口产生无主应用（创建者本人 403）；ADR 决策 7 写明「create() 事务内」与实现不符 | application.service.ts:294-307 | R1-devil-03 | application.create + grantOwner 包 $transaction（对齐 ADR 文本） | | ⬜ |
| P1-09 | 字段改名/改类型/删字段零引用防护：静默破坏已发布页面绑定、流程 writeback、行级权限 condition（按 apiName 字符串引用不可传播，实测改名后 bundle 分叉） | object.service.ts:448-497（updateField:425-465 / deleteField:475-497；对照 deleteObject:304-359 四类守卫） | R1-compat-04 | 守卫补「字段引用扫描」（页面 schema/流程 writeback/权限 condition/lookup·rollup·formula·sub_form 引用）+ 已发布态变更策略 | ◆ 硬拦 vs 警告 | ⬜ |
| P1-10 | Formula 在 Rollup 之后计算且父重算不补公式：公式引用 rollup 字段时新建为 null、更新恒滞后一拍（实测 F=200 vs R=150） | record.service.ts:510-526、rollup.service.ts:391-404 | R1-correctness-06 | 计算顺序按依赖方向（先 rollup 后 formula）+ recomputeOneParent 补 formula 重算 | | ⬜ |

## 波次② 流程引擎与出站安全（6 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| P1-11 | safeFetch DNS 二次解析 TOCTOU：校验后 fetch 重新解析，权威 DNS 谎报端到端穿透实证（127.0.0.1 收包） | ssrf-guard.ts:90-118 | R1-security-05〔H〕→R2-security-08〔M〕 | 校验后按已解析 IP 钉连接（undici custom Agent/dispatcher，lookup 固定） | | ⬜ |
| P1-12 | Webhook 防重放时间戳未纳入 HMAC 签名：捕获一次合法签名后刷新时间戳头无限重放（实测启动第二实例） | webhook.controller.ts:64-76 | R2-security-02 | 签名输入改 `${ts}.${rawBody}`；未上线零兼容可直接改契约（含文档与 QA-PLAN） | | ⬜ |
| P1-13 | CSV 导出公式注入（CWE-1236）：=+−@ 开头单元格原样输出，活体复现 | record-import-export.service.ts:88-102 | R1-security-06 | 单元格前缀中和（`'` 前缀），导入路径同步评估 | | ⬜ |
| P1-14 | 依次审批第 2..N 环超时动作静默失效：completeTask 直连 createTask 不经执行器，超时 job 上一环节完成时已取消（实测 15s deadline 27s 仍 PENDING） | process-engine.ts:752-767 | R1-correctness-03 | sequential 下一任务生成后补 scheduleTaskTimeout（复用 S1 通道） | | ⬜ |
| P1-15 | S2 error 出边按 label 字面首匹配：无 case 归一无歧义检测，双 error 边只走首条、label='Error' 不命中→实例静默 FAILED（实测） | process-engine.ts:511-513 | R2-correctness-05 | 归一匹配（trim+lowercase）+ G3 校验器补歧义规则（双 error 边 error 级） | | ⬜ |
| P1-16 | Webhook 应用级广播：连接器与流程无绑定，新增第二个 WEBHOOK 流程后存量 URL 静默多触发（四步复现） | webhook.controller.ts:82-120、schema Connector 仅 webhookToken | R1-compat-02 | 建立绑定关系（流程触发配置带 connectorId 或 schema 加列+回填） | ◆ 绑定形态 | ⬜ |

## 波次③ 性能（8 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| P1-17 | 图表聚合拉 1 万行进内存且 take 无 orderBy：超限静默截断连 totalRecords 也谎报（实测 sum=10000/真值 12000） | chart-data.service.ts:23,162-171 | R1-scale-05 + R2-scale-08 | 直连对象源复用 G5 SQL 下推（dataflow-sql.ts buildPipelineSql 已有）；超限显式标记过渡方案 | ◆ 下推范围 | ⬜ |
| P1-18 | 业务字段排序回退只取最新 5000 条：旧记录任何页不可达且 total 谎报（6003 条实测 1003 条不可达） | record.service.ts:130,409-433 | R1-scale-04 + R2-scale-06 | 业务字段排序 SQL 下推（类型 cast 排序已有先例）；无过滤裸排序同样走回退需一并处理 | ◆ 下推范围 | ⬜ |
| P1-19 | JSONB path+equals 写路径不走 GIN：unique 查重/rollup 反查 20 万行实测 Seq Scan 55ms vs @> 5ms；record.service:939 注释「GIN 可达」与 record-query.ts:6 矛盾需勘误 | record.service.ts:985、rollup.service.ts:266,359-375 | R1-scale-03 | 等值查询改 `@>` 形态（A-H2 先例）+ 注释勘误 | | ⬜ |
| P1-20 | ProcessTask candidateGroups hasSome 无 GIN：任务中心每请求全租户行过滤；nodeExecutionId 超时路径全表扫 | process.service.ts:619-625、schema 仅 4 索引 | R2-scale-07 | 迁移补 text[] GIN（candidateGroups）+ b-tree（node_execution_id） | | ⬜ |
| P1-21 | 权限决策零缓存：每请求 ~8-9 条语句、组织树全量载入（log 实测，200 节点毫秒级、万节点成天花板） | permission.service.ts:72-219 | R2-scale-05 | 角色/组织映射短 TTL 缓存 + 变更失效点（角色/成员/组织/授权写路径） | ◆ 失效粒度 | ⬜ |
| P1-22 | CSV 导出每页重算 count（O(N²/100)）+ 整表拼内存字符串；导入 5000 行 ≈3.5 万串行往返分钟级（双实测） | record-import-export.service.ts:22-102 | R2-scale-09 | 导出 total 一次计算/游标分页；导入分批并行 + 背压（与 P1-07 联动防打满） | | ⬜ |
| P1-23 | batchCreate 串行 O(N) 放大 + 每行 2 个无背压 fire-and-forget（触发器全量 schema 拉取+同步 startProcess、rollup 全对象扫描） | record.service.ts:806-821、:552-572 | R1-scale-02 | 分批并行化 + 后台任务并发预算（pLimit/队列化）；与波次④ P1-30（元数据缓存）联动收益翻倍 | | ⬜ |
| P1-24 | Rollup/sub_form 聚合全量内存归约：写延迟实测 44→99ms@3000 行线性劣化、批量导入 O(N²) | rollup.service.ts:256-272 | R2-scale-03 | 数值/聚合字段 SQL 下推（SUM/COUNT/AVG/MIN/MAX），非数值保留内存路径 | ◆ 下推范围 | ⬜ |

## 波次④ 治理与运维（6 条）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 需裁决 | 状态 |
|---|---|---|---|---|---|---|
| P1-25 | 归属闸 403 零审计或反记 ALLOWED：实测 403 在审计里显示「权限检查通过」（误导取证） | design-access.guard.ts:38-42、app-access.service.ts:45,56、all-exceptions.filter.ts:34-42 | R1-engineering-01 + R2-engineering-03 | 两级闸拒绝统一写 PERMISSION_DENIED（ACCESS 类）；无 @RequirePermission 的设计路由补审计面 | | ✅ TC-208（design-access.guard.spec 3 例；writeAudit 静态通道，gate=DESIGN_ACCESS） |
| P1-26 | 删用户级联孤儿化应用：OWNER 行级联消失，应用从非管理员视角消失零告警（实测；admin 可转移救回） | user.service.ts:164-169（membership.user Cascade） | R2-engineering-06 | 删除前置守卫：名下有 OWNER 应用 → 阻断（要求先转移）或自动转 admin + 审计 | ◆ 阻断 vs 自动转移 → ✅ 裁决=阻断 | ✅ TC-209（user.service.spec 3 例；按 role=OWNER 精确统计） |
| P1-27 | 依赖监控三缺：无 dependabot、CI 无 audit；实弹 143 条通告含 3 critical（markdown-it@12.3.2 经 amis@6.13 进 runtime-ui 渲染链 GHSA-vfgh-jcmw-g37q） | .github/（仅 pr template+ci.yml） | R1-engineering-05 | dependabot.yml + CI audit 步骤（critical 阻断策略）；critical 项与 P2-devil-04（amis fork 决策）联动评估 | | ✅ TC-210（dependabot.yml 周更 + scripts/audit-gate.mjs + .github/audit-baseline.json 基线 7 条带 chain 归因 + CI audit job；正负两向实测） |
| P1-28 | AutoNumber 计数器创建失败泄漏跳号：计数器递增在 lookup 校验/create 之前、无事务无回收（实测 22→25 永久跳号） | record.service.ts:496-537、auto-number.ts:135-139 | R2-correctness-01 | 计数器递增与记录写入同事务（或失败路径回收）；注意跳号本身业界通行，缺陷在结构性无原子性 | | ✅ TC-211（create 全链入 $transaction + tx 客户端透传 auto-number；record.service.spec 钉事务内序） |
| P1-29 | 删对象不扫其他对象 lookup/sub_form/rollup 字段引用：删除后引用方存量记录写路径被 400 永久卡死、rollup 静默归 null（实测） | object.service.ts:304-359（对照既有四类检查） | R1-correctness-02 | 守卫补第五类检查：扫描全应用 fields config 中的 lookup.targetObjectId / sub_form.childObjectId / rollup 关系字段 | | ✅ TC-212（object.service.spec 3 例；rollup 经 relationFieldId 间接引用被扫描覆盖） |
| P1-30 | 删流程不清理 API release 行：发现端点继续 advertise 已删流程、调用引擎层 400 悬空（实测；processDefId 无 FK） | schema.prisma:1108、design-process.controller.ts:110-116、process-api-release.service.ts:118-124 | R1-compat-07 | 删除流程时级联处置 release 行（置 ARCHIVED 或级联删）+ listByApp 校验 processDef 存活 | | ✅ TC-213（级联删=$transaction[deleteMany+delete]；listByApp 存活过滤兜底；状态枚举无 ARCHIVED 故选级联删） |

## 建议推进顺序

1. **先波次④**（治理 6 条：多为小改，P1-27 dependabot+audit 半小时级；P1-25 审计补齐面小价值高）；
2. **再波次②**（流程引擎 6 条：出站安全 TOCTOU/HMAC/CSV 注入是安全债，P1-16 需裁决先收）；
3. **然后波次①**（并发/事务 10 条：P1-01/03/08 无裁决直接做；P1-02/05/07/09 带 ◆ 先收裁决）；
4. **最后波次③**（性能 8 条：P1-19/20 纯索引/形态改先做；P1-17/18/24 三个 ◆ 下推范围一次裁决；P1-23 与 P1-30 联动做收益最大）。

## 开工前一次性收集的裁决清单（8 项 ◆，2026-10-24 已全部裁决）

P1-02 锁策略（乐观锁 vs 行锁）/ P1-05 Rollup 写回策略（字段定向 vs 串行化）/ P1-07 看门狗实现形态 / P1-09 字段变更硬拦 vs 警告 / P1-16 webhook 绑定形态 / P1-17+18+24 SQL 下推范围（一次裁决）/ P1-21 权限缓存失效粒度 / P1-26 删用户阻断 vs 自动转移。

裁决结果：P1-02=**乐观锁**（version 列条件更新，冲突 409 提示重试）；P1-05=**字段定向写**（只 merge rollup 字段，不触碰其他字段）；P1-07=**看门狗续期**（持锁周期续 TTL）；P1-09=**全硬拦**（命中任一引用即 400 并列出引用清单，与删对象守卫先例一致）；P1-16=**Connector 加列 processDefId**（+存量回填）；P1-17/18/24=**三处全做**（图表聚合/业务字段排序/rollup 数值聚合下推，非数值聚合保留内存路径）；P1-21=**短 TTL（30s）+ 主动失效**（角色/成员/组织/授权四类写路径清租户级键）；P1-26=**阻断**（名下有 OWNER 应用即 400，要求先转移所有权）。
