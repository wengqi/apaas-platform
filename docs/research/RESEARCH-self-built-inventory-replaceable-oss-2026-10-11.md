# 自研模块 × 可替换组件盘点（2026-10-11）

> **状态：草稿/提案**（红线 6：未裁决内容不得作为正式结论引用）。
> 背景与动因：用户「不造轮子」原则（2026-10-11，待升格 ADR）——内部基建用业界开源、产品本体自研、少自研 bug。本文把平台全部自研面摊开，逐一判定「产品本体 vs 可替换」，给出候选与建议，**待用户裁决后转正**。
> 方法：`git ls-files` 实测行数（非测试代码）+ 各模块文件构成核实 + 已落档裁决对齐（见 §1）+ 关键候选 npm 现状核实（§5 标注证据）。

---

## 0. 结论摘要

1. **平台几乎没有"重复造轮子"**。基建底层已系统性采用业界开源：amis（界面方言）、flowgram.ai（流程画布，35+ 子包）、BullMQ（队列）、isolated-vm（云函数沙箱）、expr-eval（公式求值）、json-logic-js（条件求值）、ldapts（LDAP）、Prisma、pino、passport/JWT、@nestjs/throttler、RAQB（条件构建器 UI）、csv-parse/stringify、nodemailer、bcrypt。自研面集中在这些库之上的**产品语义层**。
2. 自研 ~61k 行产品代码（非测试，gateway 30.5k + studio ~30k + runtime-ui 2.7k + db 0.7k + shared）中，**约 95% 属产品本体**（方言/治理轨道/流程引擎/权限下推/AI 工具面/多环境版本模型）——与 ADR-0003「运行时权限层、治理轨道、Schema 合同层是自研资产」的定性一致，替换它们等于换产品。
3. 真正的"可替换组件"（C 类）仅 **1 处且不建议现在换**：自研 Redis 锁（101 行）——单 Redis 部署语义与 node-redlock 的 SET NX PX+Lua 一致，建议**触发条件式升级**（多副本部署时换 node-redlock quorum），现在替换零收益。
4. 真正的缺口不是"换轮子"而是"缺轮子"（D 类，3 项）：**附件/文件存储**（平台当前无任何文件能力，飞书对齐差距）、**Excel 导入导出**（当前仅 CSV；候选 ExcelJS，npm 活跃 vs SheetJS npm 版冻结 0.18.5 + CVE）、**关键词搜索强化**（pg_trgm + GIN，PG 内置扩展零新组件，解决 AGENTS.md 已知残留风险"LIKE 无法用 GIN"）。
5. 明确**不采纳**的 OSS 候选（防重复提案）：casbin（无 ORM 下推语义）、Kafka/RabbitMQ（BullMQ 已覆盖）、Meilisearch/Typesense（新组件违背单二进制轻量部署）、完整 OTel SDK（语义已对齐，运维级增强 YAGNI）、MinIO 自建（2025-2026 社区版大幅阉割，见 §5.3）。
6. **不推翻任何既有裁决**：流程引擎自研+抄语义（RESEARCH-process-engine-oss-comparison §8）、amis 单方言（OSS-SELECTION-VERIFICATION-2026-09-30）、AI 外部 agent 形态（ADR-0004）、自定义组件沙箱 iframe（C9）全部维持。本盘点与 Appsmith 候选 C1–C9 不重叠（那些是能力增项，本文是基建替换审视）。

---

## 1. 盘点口径与已有裁决对齐

**代码范围**：`git ls-files '*.ts' '*.tsx'` 排除 spec/test，非测试行数。总 94.8k 行含测试，产品代码 ~61k 行。

**四类分类标准**：

| 类别 | 定义 | 处置 |
|------|------|------|
| **A 产品本体** | 自研即产品（方言/治理/引擎/工具面），OSS 无对应物或替换=换产品 | 保留 |
| **B 薄封装** | 底层已是成熟 OSS，自研仅为集成/胶水层 | 保留（封装即集成成本） |
| **C 可替换候选** | 自研了业界已有成熟 OSS 等价物 | 逐项评估（本轮唯一审视区） |
| **D 缺口** | 业界有 OSS 而平台完全缺失的能力 | 补齐候选（另立排期） |

**已有裁决（不重复盘点，直接引用）**：
- 流程引擎 6.3k：自研+抄语义，Temporal 引入触发条件已白纸黑字（`RESEARCH-process-engine-oss-comparison-2026-10-11.md` §8，feat/process-engine-topic-r1 分支，未合 main）
- 界面层 amis 单方言：formily（停更）/lowcode-engine（停滞）/tiny-engine（Vue 栈）/NocoBase（付费墙）已核实排除（`docs/knowledge-base/OSS-SELECTION-VERIFICATION-2026-09-30.md`）
- AI 形态：外部 agent 经 MCP，不内置 chat（ADR-0004）；Appsmith 内置 AI EOL 为反面印证
- 自定义组件：沙箱 iframe 桥接（C9 立项，A/B 不采纳）

---

## 2. gateway 模块矩阵（非测试 ~30.5k 行）

| 模块 | 行数 | 自研子系统（实测文件证据） | 底层 OSS | 类别 | 建议 |
|------|------|---------------------------|----------|------|------|
| process | 6320 | 引擎内核 process-engine.ts(1693) + 21 节点执行器 + 触发器 | — | **A** | 已裁决自研（引用 §1） |
| record | 2296 | 写内核/约束校验/record-query(172)/rollup(409) | csv-parse, csv-stringify | **A** | 保留；Excel 见 §6 D2 |
| review | 2282 | 版本模型+治理轨道+批次+收编+回调 webhook | — | **A** | 保留（治理闸门=产品论核心） |
| permission | 1983 | RBAC+ABAC+audit-log+调试 explain | — | **A** | 保留；casbin 不采纳理由见 §5.1 |
| mcp | 1899 | AI 工具面（批量提交/@ref 令牌/治理对接） | @modelcontextprotocol/sdk | **A** | 保留（ADR-0004 一等公民） |
| dataset | 1853 | dataflow-sql(220) + jsonlogic-to-sql(196) + 物化/刷新租约 | PostgreSQL | **A** | 保留（产品 DSL 执行器，无对应 OSS） |
| schema-contract | 1692 | G3 五校验器 + amis 类型注册表 | — | **A** | 保留（AI-first 结构性保障，ADR-0004） |
| application | 1422 | 应用/发布编排 | — | **A** | 保留 |
| object | 1307 | 对象建模 + formula-engine | **expr-eval** | **A**(B内核) | 保留 |
| connector | 1233 | connector-call(267) + 凭证加密 + webhook | fast-xml-parser | **A** | 保留；C3 存量数据对接是能力增项 |
| identity | 1082 | CAS 客户端(97) + 目录同步(283) + SSO | **ldapts** | A/B | 保留（见 §5.4 CAS 生态） |
| environment | 931 | 多环境指针/部署历史/G4 变量闸 | — | **A** | 保留 |
| cloud-function | 721 | runner(148) 预算/超时/并发 | **isolated-vm** | **B** | 保留 |
| page | 665 | 页面 CRUD + G3 硬闸 | — | **A** | 保留 |
| observability | 657 | 四分类事件 + AI 质量聚合 | **pino**/nestjs-pino | **A** | 保留；OTel 语义对齐=长期项（§5.5） |
| common | 570 | **redis-lock(101)** + **ssrf-guard(136)** + trace ALS + 异常过滤器 | @nestjs/throttler | **B/C** | 锁=C1 触发式升级；ssrf-guard 保留（§5.2） |
| auth | 562 | JWT+登录防爆破+租户上下文 | passport, @nestjs/jwt, bcrypt | **B** | 保留 |
| open-api | 489 | X-API-Key + /open/* 触发 | — | **A** | 保留 |
| tenant | 460 | 租户管理 | — | **A** | 保留 |
| shared(gateway) | 444 | 守卫/拦截器 | — | **B** | 保留 |
| notification | 293 | 站内信 + 邮件 | **nodemailer** | **B** | 保留 |
| service-identity | 258 | 服务身份 | — | **A** | 保留 |
| queue | 223 | process.processor | **BullMQ** | **B** | 保留 |
| config | 100 | Joi env schema | **joi** | **B** | 保留 |

## 3. 前端矩阵

| 包/目录 | 行数 | 自研子系统 | 底层 OSS | 类别 | 建议 |
|---------|------|-----------|----------|------|------|
| studio components | 17989 | 流程画布方言层(8237: serializer/EventBridge/配置面板/字段绑定) + 对象建模(4461) + 权限(1345) + 数据集(1273) + page-builder(1098, amis-editor 封装) | **flowgram.ai(35+ 子包), amis-editor, RAQB, Monaco, dnd-kit, reactflow** | **A** | 保留（方言适配层是产品本体；底层已全 OSS） |
| studio pages | 8156 | 搭建器页面 | antd, React Query, zustand | **A** | 保留 |
| studio api/constants/utils | 3410 | api 层契约适配 | axios, pinyin-pro | **A** | 保留（D-011 教训：契约适配单点化） |
| runtime-ui | 2747 | AmisRenderer + fetcher(ok 契约/toast 兜底) + 任务中心 + 我发起的 | **amis**, echarts | **A** | 保留 |
| db 包 | 669 | Prisma Client + 租户注入(133) + ALS(110) + 慢查询 hook(59) | **Prisma** | **B** | 保留 |
| packages/shared | 32 文件 | **JsonLogic 可译子集 SSOT + node-check + schema-diff + qk** | json-logic-js | **A** | 保留（双向锚定契约，ADR-0004） |

---

## 4. C 类明细——唯一真正"造轮子"审视区

### C1. Redis 分布式锁（`apps/gateway/src/common/redis/redis-lock.service.ts`，101 行）
- **现状**：`SET NX PX` + 唯一值 + Lua 解锁，带降级为进程内互斥（单测覆盖）。AGENTS.md 风险条目："多副本部署需确认 Redis 锁可用"。
- **候选**：node-redlock（mike-marcacci/node-redlock，Redlock 算法标准实现，仍维护；2026-01 仍被业界博客引用为现行最佳实践）。
- **核实结论（2026-10-11）**：单 Redis 部署下，我们自研实现与 node-redlock 的单实例路径**语义一致**（node-redlock 单实例也是 SET NX PX+Lua）。Redlock quorum 的价值只在多 Redis 节点防单点故障场景。
- **建议**：**触发条件式替换**——现在不换（零收益）；多副本部署立项时替换为 node-redlock（quorum），同步复核 Kleppmann 批评（fencing token）是否适用于我们的锁用途（流程引擎互斥是幂等性保护而非正确性关键，Redlock 语义足够）。防重复提案：把触发条件写进本节。

### C2. SSRF 守卫（`common/net/ssrf-guard.ts`，136 行）
- **现状**：出站 URL 解析 + 内网地址段拦截 + DNS 解析后复核，带单测（open-api OCR 轮加固）。
- **候选核实**：Node 生态无广泛采用的标准等价库（各厂均为自研安全组件）。
- **建议**：保留。安全关键组件自研+单测是正解，替换候选不存在。

### C3. schema-diff（`packages/shared/src/review/schema-diff.ts`）
- **候选**：json-diff/deep-diff 类通用库——只产出通用 diff 结构，不满足审核中心结构化展示（按字段语义分组的 UI 契约）。
- **建议**：保留。

### C4. CAS 协议客户端（`identity/cas-auth.provider.ts`，97 行）
- **候选**：passport-cas 等库均多年未更新（Node 生态 CAS 客户端贫瘠）。
- **建议**：保留。97 行协议实现 + 可插拔 AuthProvider 接口（ADR-0002）已是设计意图。

---

## 5. 明确不采纳候选（防重复提案清单）

### 5.1 casbin / node-casbin（权限引擎）
**不采纳理由（架构性不匹配）**：casbin 是应用层策略决策引擎（match 函数在内存执行）；本平台权限层的核心资产是 **JsonLogic 条件 → Prisma where 下推**（condition-translator 经 db 租户注入层翻译，`@>` GIN 索引命中）。换 casbin = 放弃行级过滤下推，回到内存过滤，性能与租户隔离架构倒退。ADR-0003 已定性该层为自研资产。

### 5.2 Kafka / RabbitMQ（消息队列）
BullMQ（Redis 后端）已覆盖延迟任务/重试/定时触发器/清理，且与现有 Redis 共用基建。引入独立 MQ 违背单二进制轻量部署哲学（同类裁决先例：Temporal 拒绝理由）。

### 5.3 MinIO（自建对象存储）——**候选需谨慎**
核实（2026-10-11）：MinIO 社区版 2025-05/06 删除全部 Web 管理台；2026-04 起**只发源码不再提供预编译二进制**（GitHub 官方声明），AGPL。社区 forks 活跃但分化。若 D1 附件存储立项：优先**纯 S3 兼容协议适配层**（企业环境已有 S3/MinIO/Ceph 则直连，平台不绑实现）；自建候选 SeaweedFS（Apache-2.0）/ RustFS（Apache-2.0，MinIO 社区精神后继）/ Garage。

### 5.4 目录同步 / CAS 商用替代
无通用 OSS（企业身份集成天然 per-company）；ldapts + 自研同步管道（283 行）+ JIT/离职禁用/审计已是 M1 交付。飞书对接属 ADR-0002 可插拔接口扩展。

### 5.5 OpenTelemetry 完整 SDK
观测语义已对齐（四分类 SSOT + traceId 全链路 pino ALS + AI 质量面板）。完整 OTel 引入是运维级增强（exporter/collector/采样策略），服务规模未到，**YAGNI**。触发条件：多副本可观测性排障需求出现时重评。

### 5.6 Meilisearch / Typesense（独立搜索引擎）
新组件违背单二进制哲学。关键词搜索强化的正确路径是 **pg_trgm + GIN**（PG 内置扩展，D3，见 §6）。

---

## 6. D 类缺口（缺轮子，非换轮子）

| # | 缺口 | 现状证据 | 候选 | 核实结论 | 建议优先级 |
|---|------|----------|------|----------|-----------|
| D1 | 附件/文件存储 | 平台无任何文件能力（multer 仅 devDep；飞书对齐差距——附件是表单基本能力） | S3 兼容适配层（含直连企业已有存储）；自建见 §5.3 | MinIO 社区版阉割已核实 | **中**（表单完整性 + 验收应用真实性） |
| D2 | Excel 导入导出 | record-import-export 仅 CSV（csv-parse/stringify） | **ExcelJS**（npm 活跃，样式/流式写强）；SheetJS npm 版冻结 0.18.5 + CVE-2023-30533/CVE-2024-22363（修复仅自家 CDN） | 已核实（2026-10-11） | 中（随附件轮或独立小轮） |
| D3 | 关键词搜索强化 | records?keyword= LIKE contains；AGENTS.md 残留风险"LIKE/范围类条件无法用 GIN" | **pg_trgm + GIN**（PG 内置，零新组件） | PG 内置能力 | 低（小改动，可随任意轮顺手） |

> D 类与流程引擎专题（S1/S2）、Appsmith 候选 C1–C9 的排序关系待用户裁决（见 §7）。

---

## 7. 待裁决问题（grilling 输入）

1. **C1 触发条件式替换**是否接受？（现在不动 redis-lock，多副本立项时升 node-redlock quorum + fencing 评估，条件写入文档防重复提案）
2. **D 类缺口要不要立项排期**？若立项，D1（附件存储，建议 S3 适配层先行）/D2（ExcelJS 导入导出）/D3（pg_trgm）与流程引擎 S1/S2、Appsmith C1–C9 的相对顺序如何排？
3. **"不采纳清单"（§5）是否需要升格 ADR**（与「不造轮子」原则合并成一份"组件选型与自研边界 ADR"）？——防重复提案的强约束形态。
4. 本盘点落档后，「不造轮子」原则本身是否转正 ADR（用户记忆中标注"待升格"）？

---

## 8. 证据来源

- 本地实测（2026-10-11，main @ fbcdd51）：`git ls-files` 行数统计、各模块文件清单、`apps/gateway/package.json` / `packages/studio/package.json` / `packages/runtime-ui/package.json` 依赖清单、`grep` 定位（expr-eval→object/formula-engine.ts、redis-lock→common/redis/）
- 已落档裁决：`docs/adr/0003`、`docs/adr/0004`、`docs/knowledge-base/OSS-SELECTION-VERIFICATION-2026-09-30.md`、`docs/research/RESEARCH-process-engine-oss-comparison-2026-10-11.md`（feat/process-engine-topic-r1 分支）、`docs/research/RESEARCH-appsmith-benchmark-platform-direction-2026-10-11.md`（同分支）
- 外部核实（2026-10-11 主会话 WebSearch）：
  - node-redlock：[mike-marcacci/node-redlock](https://github.com/mike-marcacci/node-redlock)、[Redis 分布式锁官方模式](https://redis.io/latest/develop/clients/patterns)
  - MinIO 社区版阉割：[Cloudron forum](https://forum.cloudron.io)、[Pepitedata（2025-12 持续阉割报道）](https://pepitedata.com)、[rmoff.net 2026-01 替代品综述](https://rmoff.net)
  - Excel 库：[pkgpulse 2026 对比](https://www.pkgpulse.com/guides/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026)、[mfyz 三库实测](https://mfyz.com/nodejs-excel-library-comparison)、[SheetJS Prototype Pollution issue](https://github.com/SheetJS/sheetjs/issues)
