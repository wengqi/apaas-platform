# 全项目对抗审查裁决汇总与修复排期（2026-10-23）

> 来源：全局 workflow `apaas-adversarial-review`（`~/.zcode/workflows/apaas-adversarial-review.dwf.ts`）
> 两轮全项目运行。本档是两轮裁决的**并集去重权威清单**与修复排期——按记录准确性红线，
> 对话中的审查结论以本档为准。完整裁决书原文存两次运行的 verdict-report artifact（运行卡片可查）。

## 一、运行配置与结果

| | 第一轮（2026-10-22） | 第二轮（2026-10-23） |
|---|---|---|
| 运行 ID | dwfrun-f3845ad2 | dwfrun-3efcb954 |
| 模型 | 全角色 GLM-5.3-Flash（AmendWorkflow 续跑丢 args 的意外配置） | 1M 上下文分摊：裁判=GLM-5.3、安全/魔鬼=DeepSeek-V4-Pro、正确性=MiniMax-M2.1、工程=DeepSeek-V4-Flash、性能/契约=GLM-5.3-Flash |
| 文档屏蔽 | 未生效（同上） | docs/research/、docs/design/、docs/adr/（魔鬼代言人例外，必读专攻） |
| 发现→裁决 | 48 → 确认 40（8H/16M/16L）/ 降级 4 / 驳回 4 | 54 → 确认 48（5H/18M/25L）/ 降级 3 / 驳回 3 |

**并集去重**：两轮共确认 88 条，跨轮同一缺陷合并 12 对 → **唯一确认 76 条（9 high / 31 medium / 36 low）**；降级并集 5 条；驳回并集 7 条。跨轮校准亮点：

- **升档**：R1-correctness-07（降级：50 并发零命中自愈）→ R2-correctness-06 确认 medium（并发风暴一轮即中，Rollup 重算覆盖并发人工修改）；R1-compat-06（降级：前提未验证）→ R2-compat-03 确认 low（以 1d92102 决策别名提交为反例实锤「钉版本承诺被穿透」）。
- **校准降档**：R1-security-01（high）→ R2-security-04（medium，页面读泄露为元数据级——数据 API 有闸）；R1-security-05（high）→ R2-security-08（medium，需攻击者控制 DNS 的前提），但 R2 完成了端到端穿透实证。

## 二、口径与限制

1. **没再报 ≠ 已修复**：每路限 10 条 + 视角随机性，两轮并集才是完整待办。
2. **两轮独立命中的缺陷可信度最高**（跨模型池复现）：runSync 冻结、API key 跨应用越权、seed 静默回滚、页面读绕过、DNS TOCTOU、归属闸审计缺口、图表截断、排序窗口。
3. 全部 confirmed 条目经裁判活体复现（API 建夹具/并发探针/HTTP 监听）或代码走读核验；驳回条目均给出拦截证据（三条同根因：只读 service 层想象路由层，漏看 `@apaas/db` ALS 租户注入）。
4. 裁判在 dev 栈做过活体操作（建流发布/并发风暴/临时改 log_statement 后还原），报告声称清理完毕——**实际抽查发现残留**（见第六节）。

## 三、P0：安全越权与数据丢失（9 高危 + 1 顺手，建议单轮收口）

| # | 缺陷 | 位置 | 裁决号 | 修法方向 | 状态 |
|---|---|---|---|---|---|
| P0-1 | 通知节点 WEBHOOK 渠道裸 fetch 出站 SSRF（recipients 支持 {{record.*}} 插值=终端用户可控 URL，可指向内网/云元数据） | notification.executor.ts:133-141 | R2-security-01〔H〕 | 出站改经 safeFetch + AbortSignal 超时 | ✅ 已修复（safeFetch+outboundTimeoutMs；notification-executor-webhook.spec 4 例；TC-200） |
| P0-2 | 应用级 API 密钥的 appId 在开放 API 数据面不强制（verify 丢 appId，A 应用 key 可触发 B 应用流程） | api-key.service.ts:106-112、open-api.controller.ts:52,113-117 | R1-compat-01 + R2-security-03〔H〕 | verify 回传 appId + 控制器比对身份绑定应用 vs 路径 appId | ✅ 已修复（verify 回传 appId + assertAppScope 403；open-api.controller.spec 4 例 + api-key.service.spec 2 例） |
| P0-3 | 云函数 runSync 在网关主线程同步执行（4.5s 忙循环实测 /health 冻结 4513ms，~12 次/min 可近持续冻结全进程） | cloud-function.runner.service.ts:112 | R1-scale-01 + R2-security-05〔H〕 | 换 isolated-vm 异步 run / worker 外移（项目有 worker_threads 先例） | ✅ 已修复（runSync→await script.run 异步 API；真实 ivm 集成测试实证忙循环期间宿主事件循环保持响应 ≥50 tick；runner spec runSync 炸雷桩防回归） |
| P0-4 | 云函数并发信号量「移交等待者」路径永久泄漏槽位（每次净 -1），排队超时无定时器永不触发，突发后执行入口永久停摆 | cloud-function.service.ts:224-253 | R2-scale-01〔H〕 | 修移交分支计数不对称 + 主动超时定时器 | ✅ 已修复（等待者获取不再二次扣减/移交即占用计数不变 + 排队 setTimeout 主动超时；顺带修 M-8「排队超时 429」注释承诺落空——acquire 移入 try + acquired 标志防 finally 误释放；单测实证 4 波 5 并发后 slots 守恒 4、超时主动拒绝） |
| P0-5 | 生产启动路径每次重启重跑 demo seed，upsert 全量覆盖采购验收应用并重新发布（运行期修改被静默回滚） | entrypoint-gateway.sh:24-26、seed.ts:245,265、seed-procurement.ts:524,650,703,831 | R2-engineering-01〔H〕 | demo/procurement 内容仅在显式 env 开关下执行；顺修 `\|\| echo` 吞错 | ✅ 已修复（seed.ts 生产模式默认跳过 demo/验收内容，SEED_DEMO_CONTENT=true 显式开启 + .env.example 同步；entrypoint 撤 `\|\| echo`，seed 失败随 set -e 立即终止启动） |
| P0-6 | 敏感环境变量运行面明文下发浏览器（设计面脱敏、运行面 ${env.*} 全量替换实测泄明文） | environment-resolver.service.ts:82-94,130-149 | R1-security-02〔H〕 | **用户裁决（2026-10-23）**：G4 发布预检页面引用 sensitive 升 error 硬闸（页面走连接器取凭据，否决服务端代理——浏览器侧消费敏感值本身是反模式）+ 运行面页面路径替换跳过 sensitive（纵深防御，占位符保留） | ✅ 已修复（DeployPreflightDto.sensitivePageRefs + deploy 400 硬拦 + resolve({excludeSensitive})；env spec 3 例 + resolver spec 2 例） |
| P0-7 | 云函数 host 侧日志数组无上限（实测 3s 灌 14.7GB，isolate 128MB 管不到 host 堆 → OOM DoS） | cloud-function.runner.service.ts:67-73,124-140 | R1-security-04〔H〕 | logs 容量上限 + 失败路径不回传全量 | ✅ 已修复（MAX_LOG_LINES=200 + 单行 2000 字符截断 + logsTruncated 丢弃计数入 shared 契约；真实 ivm 集成测试 300 行实测封顶） |
| P0-8 | 删对象守卫只统计当前环境，FK 级联清掉全部环境 records（实测 dev 记录 1→0，对称场景 dev 删 prod 同样成立） | object.service.ts:313-315,361 | R1-correctness-01〔H〕 | 守卫 count 跨环境全量统计（绕过 $extends 注入） | ✅ 已修复（record count 改 $queryRaw 显式 SQL——不经 $extends 拦截、不过滤 environment_id；spec 钉住 SQL 形态 + setup.ts 补 $queryRaw mock 通道） |
| P0-9 | 运行面数据端点（chart-data/records 族）对 DRAFT/未发布应用照常供数，ADR-0005 决策 12 的 blanket 404 被保留端点证伪 | chart-data.service.ts、record.controller.ts | R1-devil-01〔H〕 | **用户裁决（2026-10-23）**：双门判定（设计面可访问 OR 已发布+运行面可见，两者皆否 404），读写同门；ADR-0005 补勘误（决策 10「形态不动」非语义豁免） | ✅ 已修复（DataAppAccessGuard 挂 record/chart-data 全路由 + ADR 勘误；app-access spec 8 例 + guard spec 6 例） |
| P0-10（顺手） | 运行面页面三读端点零授权（零角色用户实测读到任意应用完整 amis schema 与 ?env=dev 未发布内容） | page.controller.ts:17-48、page.service.ts:215-265 | R1-security-01〔H〕+ R2-security-04〔M〕 | 补可见性归纳（assertRuntimeVisible，不可见/未发布 404） | ✅ 已修复（page.controller 三路由接入 AppAccessService.assertRuntimeVisible；app-access spec 覆盖） |

## 四、P1：一致性与性能（30 条 medium，四波次）

> **已展开为可执行工单档**（逐项带状态/裁决号/修法/需裁决标记/推进顺序建议）：
> `ADVERSARIAL-REVIEW-P1-BACKLOG-2026-10-23.md`。P1 专项修复以工单档为起跑线与状态跟踪处，本节不再重复维护。

## 五、P2：卫生与前瞻（36 条 low，登记观察不排期）

- **前瞻契约（compat 9 条全 confirmed）**：钉版本承诺文本过度承诺（R2-compat-03，吸收 R1-compat-06）；`/api/v1/apps` 语义翻转无废弃窗口（R2-compat-02）；I-1 语义变化的未文档化升级后果（R2-compat-01）；JsonLogic `===` SQL 侧无严格语义（R2-compat-04）；embed 协议版本单向静默断裂（R2-compat-05）；G3 规则无祖父化机制（R2-compat-07）；开放 API 废弃零信号（R2-compat-08）；云函数契约无版本锚（R2-compat-09）；**amis 上游 14 个月零发布且 fork 预案零工件（R2-devil-04——建议升格为显式 ADR：fork/迁移触发条件）**。
- **治理观察（devil 7 条）**：验收口径「真实业务应用」不可证伪（R2-devil-01）；AI 第一公民零外部采样（R2-devil-02）；AI 质量基线小分母宣布趋势（R2-devil-03）；人审=自我审批 100% 自审史（R2-devil-06）；CAS 从未对真实环境验证（R2-devil-05）；三微服务骨架 113 行无退役标准（R2-devil-08）；遥测死锁框架（R2-devil-07，降级）与失败预测聚合（R2-devil-09，降级）不计入。
- **测试覆盖债**：MCP 归属断言零测试（R1-engineering-02 + R2-engineering-07）；成员移除 owner 闸 controller 层零触达（R2-engineering-08）；待审汇总 `'all'` 默认值脚枪（R2-engineering-09）；归属回填 SQL 零回归网（R2-engineering-10）；归属 UI 零前端测试（R1-engineering-06）；守卫锚定测试不锚顺序（R1-engineering-07）；锚定正则单引号盲区（R1-devil-02）。
- **工程卫生**：refresh token 30d 无吊销（R2-security-07）；登录错误消息三重 oracle（R1-security-08）；webhook token 无轮换（R1-compat-09）；webhook URL 三处口径不一（R1-compat-04b）；DEPLOY.md 完整性（R1-engineering-04 + R2-engineering-02）；/design 迁移无兼容别名+镜像无标签（R2-engineering-04）；契约测试缺位 86 处 as（R1-compat-08 + R2-compat-06）；批删事件 payload 缺 created_by（R1-correctness-08）。
- **扩展性储备**：onRecordEvent 每写全量拉 schema（R2-scale-04）；全应用元数据扫描每写 2 查（R2-scale-10）；EnvironmentResolver 无界缓存+多副本失效缺口（R1-scale-06）；audit/observability 表零清理（R1-scale-08）；wait 节点 60s 自轮询（R1-scale-09）。

## 六、降级待人工复核（5 条）

| 发现 | 裁决号 | 裁判理由 | 建议 |
|---|---|---|---|
| chart-data dataset 通道无行级 ABAC | R1-security-03〔premise〕 | 行级条件对聚合行结构性不可应用；真实缺口是数据集级 ACL 维度缺失，需产品决策 | 立项「数据集 ACL」产品议题，不按安全缺陷排期 |
| approveBatch 无事务部分落地 | R2-correctness-03 | 「永久孤儿」被实测推翻（重批/驳回可恢复，有意设计） | 登记改进项：批准链事务化与 P1① applyApproved 合并处理 |
| 删字段静默降级 | R1-correctness-04 | 实测修正：公式从残值继续计算（比 null 更隐蔽），非全面归 null | 并入 P1① 字段引用防护一起做 |
| 审核队列遥测死锁 | R2-devil-07 | 两处支柱不实；弱化为 devil-02 推论 | 并入 devil 族治理议题 |
| 「一年后失败」原因排序 | R2-devil-09 | 预测性聚合不可重验 | 归档 |

## 七、驳回登记（7 条，防重复排查）

| 发现 | 裁决号 | 驳回理由 |
|---|---|---|
| 权限 OR 并集击穿 | R1-security-07 | 把 :258-259 陈旧注释当实现；活体验证条件规则照常拒绝；注释勘误记 low |
| 无任何回滚方案 | R1-engineering-03 | 漏检 docs/DEPLOYMENT.md §6/§7 完整备份回滚手册 |
| 未钉 major 静默切换 | R1-compat-03 | latest-tracking 是文档化契约本身 |
| I-1 语义翻转是兼容破坏 | R1-compat-05 | 是台账登记缺陷 C9 的既定修复 |
| 跨租户成员写入（×2 同族） | R2-engineering-05 / R2-security-06 | 漏看 @apaas/db ALS 租户注入中间件（User ∈ TENANT_SCOPED_MODELS），实跑 404 拦截 |
| listInstances 横向越权枚举 | R2-correctness-08 | 所述端点不存在（404），设计面路由有双重门，实测 403 |

## 八、裁判复现夹具残留（2026-10-23 抽查实况，已清理）

裁判报告声称「夹具清理残留 0」，实查 dev 库发现残留并已于同日清理完毕（单事务执行，九项验证全部归零）：

| 类型 | 对象 | 处置 |
|---|---|---|
| 活体凭证 | service_identities：`cp07-probe`、`裁判跨应用key` 均 ACTIVE（该表无应用 FK，应用删除不级联） | 已删除（2 行） |
| 已发布流程 | `裁判SSRF复现流` 等 4 条 PUBLISHED（挂 `裁判复现-app03`） | 随应用级联删除（含 21 条实例） |
| 账号 | judge-no-role@apaas.dev（ACTIVE） | 已删除（roles/members 级联） |
| 应用 | `裁判复现-app03`、`裁判孤儿应用B`、`裁判MCP闸应用C`（含 3003 条探针记录） | 已删除（ON DELETE CASCADE 级联对象/记录/页面/函数/连接器） |
| 独立记录 | 6 条 RACE2-* 竞态探针记录（挂 QA 应用「全字段类型」对象下，非裁判命名） | 已按 id 精确删除 |
| 站内信 | 9 条裁判通知探针消息 | 已删除 |

审计膨胀（audit_logs 自 10-22 起 +4.3 万行，对应 R1-scale-08 写放大实测）保留不清理——它是 scale-08 的量化证据。

## 九、流程改进项

1. **裁判三条提示词建议反哺 workflow**（全局文件用户自管）：发现模板强制「可达性声明」（实际路由+守卫链+复现是否执行）——直接针对本轮 3 条驳回的同根幻觉；high 主张必须量化（行数×字节/QPS/时延）；devil 视角强制根因去重声明。
2. **ESLint 静态守卫**：gateway src 禁裸 `fetch(`（白名单 ssrf-guard.ts），no-restricted-syntax 先例=setInterval 禁令。
3. **AmendWorkflow 丢 args 教训**已入记忆：args 重要时全新 CreateWorkflow 或硬编码；启动后以 log「模型分配/shield」两行核对生效。
4. **修复后的复验方式**：按模块定向复审（cloud-function + open-api + page），不整项目重跑。

## 十、执行状态

- 2026-10-23（一）：P0-1 已修复（notification.executor.ts 出站改经 safeFetch + outboundTimeoutMs；新增 notification-executor-webhook.spec.ts 4 例；gateway typecheck 0 错；TC-200 / QA-PLAN 锚点同步）。
- 2026-10-23（二）：裁判复现夹具残留已清理（单事务：2 key + 6 RACE2 记录 + 9 站内信 + 1 账号 + 3 应用级联，九项验证归零）。
- 2026-10-23（三）：**P0-2 / P0-6 / P0-9 / P0-10 已修复**（用户裁决 P0-6=G4 硬闸+运行面跳过、否决服务端代理；P0-9=双门判定+ADR 勘误）。要点：①运行时可见性单应用判定下沉 AppAccessService（isRuntimeVisible/assertRuntimeVisible/assertDataAccess），与 ApplicationService 集合归纳同语义、各自有测试钉住（模块零业务依赖防循环约束下的取舍，已在本档登记）；②DataAppAccessGuard 挂 record/chart-data 控制器全路由（appId 解析顺序：params.appId > objectId > recordId > body.recordIds 批量去重）；③每请求新增 1~2 次元数据查询（scale-05 同带，已知）。验证：gateway 全量单测 **935/935**（基线 903 + 新增 32）、typecheck 0 错。
- 2026-10-23（四）：**P0-3 / P0-4 / P0-5 / P0-7 / P0-8 已修复——P0 十项全清**。要点：①云函数 runSync→异步 run（真实 ivm 集成测试实证忙循环期间宿主事件循环 ≥50 tick 响应）+ host 日志 200 行封顶/logsTruncated 契约；②信号量移交计数修复 + 排队主动超时 + M-8「429」注释承诺落空顺带修正（acquired 标志防误释放）；③生产 seed 默认跳过 demo/验收内容（SEED_DEMO_CONTENT 开关）+ entrypoint 撤吞错；④删对象守卫 $queryRaw 跨环境统计。**踩坑两个**：ZCode PostToolUse ESLint prefer-const --fix 在多段编辑间隙把闭包内递增的 `let droppedLogLines` 静默改成 const → 运行时 "Assignment to constant variable"（集成测试咬出，已加 eslint-disable 注释）；gateway 测试基建 mockPrisma 是只读 get 陷阱 Proxy，属性赋值被遮蔽（setup.ts 正规加 $queryRaw 通道）。验证：gateway 全量 **940/940**、shared 44/44、db 55/55、根 typecheck 11/11 包。待推送前 OCR/QA/e2e 闸门。
- 剩余：无——P0 批次十项全部完成。P1 四波次（30 条）与 P2（36 条）按本档排期另行推进。
