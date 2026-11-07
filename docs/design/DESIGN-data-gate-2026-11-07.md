# DESIGN: R-A 数据面写路径闸门（未知字段白名单 + 按类型校验值）

- 日期：2026-11-07
- 依据：ADR-0006 §一.2（裁决：未知字段拒绝 400 + 明确错误 + 按字段类型校验值，否决静默剥离）
- 范围：**仅 R-A 数据面闸门小轮**。R-B（PE-01~31，等 9◆+2 降级裁决）、R-C（页面新轨）、R-D（流程中心）不在本文档。
- 状态：已评审（独立对抗评审 2026-11-07：修订后批准，3 BLOCKING + 7 建议已全部采纳，见 §6）

## 1. 现状事实（2026-11-07 代码级核实）

1. **写入口全部收敛 RecordService**（除 seed 直连 Prisma，不经闸门——搭建期数据，可接受）：HTTP 单条 create/update（`record.controller.ts:105/:129`）、HTTP 批量三端点（`:164/:178/:192`）、CSV 导入（`record-import-export.service.ts:231` → batchCreate）、流程对象操作节点（`object-operation.executor.ts:65/:86`）、流程批量操作节点（`batch-operation.executor.ts:74/:103`）、审批回写（`process-engine.ts:973`）。云函数/Open API 不直接写记录。
2. **create**（`record.service.ts:609-740`）：filterWritableFields（fieldScope 权限过滤，静默丢弃）→ validateFieldConstraints（仅 required/maxLength/unique，D-002）→ 事务内 AutoNumber 覆盖、Lookup 校验、Rollup/Formula 覆盖 → 写入。**无未知字段拒绝、无类型校验**。
3. **update**（`:749-898`）：剥 `version`（乐观锁）→ fieldScope 过滤 → 环境感知解析 fields → 剥 AutoNumber 入参 → merge 旧数据 → validateFieldConstraints(mergedData) → 重算 → 乐观锁写。
4. **系统键污染风险**：body 中的 `id/createdAt/tenantId/environmentId` 等平台列名键**无剥离逻辑**，会原样落进 data JSONB（`:624`/`:762` 只做 fieldScope 过滤；控制器 `Record<string, unknown>` 原样下传）。
5. **CSV 导入无类型强转**：字符串原样入库（`record-import-export.service.ts:216-224`），已有未知列报错（行 0）与只读字段跳过（READONLY_FIELD_TYPES = auto_number/formula/rollup）。
6. **字段类型契约**（shared `object/index.ts`）：number/currency/percent 数值；single_select 存 `optionStoredValue`（value 优先回退 label）；multi_select 存 `string[]`；date 存 ISO 字符串（模板示例 `2026-01-01`，datetime `2026-01-01T12:00:00`）；checkbox 布尔（模板示例 `'false'`）；lookup 存目标记录 id（string 或 string[]，写入已有存在性校验 `validateLookupWrites`）；user 人员 id 字符串；attachment 附件数组。
7. **错误惯例**：BadRequestException 中文消息；全局过滤器包 `{ ok:false, error:{ code:<httpStatus>, message, traceId? } }`。

## 2. 设计

### 2.1 闸门位置与形态

RecordService 新增私有方法 `validateRecordWriteShape(input: { objectName, fields, data, existingData? })`，两段：

**A. 未知字段拒绝**：`data` 的键集合 ∩ `fields` 的 apiName 集合之差非空 → `BadRequestException`，消息列出未知键（上限 5 个）与可用字段名（上限 5 个 + 总数 M），格式：
`以下字段不是对象「<对象名>」的已定义字段: foo, bar（可用字段: a, b, c, d, e… 共 M 个）`
未知字段检查**不做存量回显豁免**（严格）——闸门后未知键不应再有任何存在理由。

**B. 按类型校验值**（三条豁免按序生效，然后才按类型检查）：
1. `undefined/null` 跳过（清空语义，交由既有 required 逻辑管）；
2. `''` 对**非文本类型**视同空（number/currency/percent/single_select/multi_select/checkbox/date/date_time/user/lookup/attachment）——与 D-002 的 isEmpty 口径（`record.service.ts:1149`）、CSV 的 `''→null` 对称，保证任何 UI 通道的「清空」动作不误 400（评审 B3）；
3. update 通道**存量回显豁免**：本次值与 `existing.data` 中旧值深相等（标量 `===`、数组逐项）→ 跳过类型校验（评审 B2a：studio 编辑抽屉全量回显 `RecordFormDrawer.tsx:96-120`，存量 CSV 数字串如 `'100'` 会被合法编辑连带回传，不豁免则用户无法保存未触碰字段）。


| 类型 | 规则 | 违例消息样例 |
|---|---|---|
| text/long_text/rich_text | 必须 string（既有 maxLength 逻辑保留不动） | 期望文本，实际收到数字 |
| number/currency/percent | 必须 `typeof === 'number'` 且 `Number.isFinite`（拒绝数字字符串） | 期望数字，实际收到字符串「100」 |
| single_select | 必须 string 且 ∈ `optionStoredValue(options)` | 「X」不在可选值范围 |
| multi_select | 必须 `string[]` 且每项 ∈ 可选值 | 期望字符串数组 |
| checkbox | 必须 `typeof === 'boolean'`（拒绝 'true' 字符串） | 期望布尔值 |
| date/date_time | 必须 string 且 `!Number.isNaN(Date.parse(v))`（**刻意宽松**：ISO/`YYYY-MM-DD` 均过，`'2026'` 等可解析串也放行——记录为有意取舍） | 期望日期字符串（ISO 格式） |
| user | 非空 string（仅格式；存在性校验留后续） | 期望用户 ID 字符串 |
| attachment | 必须 array（项形态暂不深查） | 期望文件数组 |
| lookup | string 或 string[]（存在性由既有 validateLookupWrites 管） | 期望记录 ID 或其数组 |
| sub_form | **不校验**（子记录为独立记录经 parentFieldId 关联，父字段值形态另行设计——记开放问题） | — |
| auto_number/formula/rollup | **不校验**（现状：create 被系统计算覆盖、update 被剥离，用户传值本就不落库，无数据完整性风险；硬拒绝超出本次裁决范围，列为后续收紧候选） | — |

### 2.2 接入点与校验对象（关键：update 只校验增量 + 空字段守卫）

- **create**（`record.service.ts` create 内）：在 `filterWritableFields` **之后**、`validateFieldConstraints` 之前，对 `filteredData`（先经 2.3 剥离）全量校验。放在 fieldScope 过滤后 = 范围外键沿用既有静默丢弃语义，不产生误报。
- **update**：在 AutoNumber 剥离后、merge **之前**，对 `incoming`（本次增量，先经 2.3 剥离）校验，回显豁免源为 `existing.data`——**绝不对 mergedData 校验**：存量老数据可能含历史脏形状（CSV 导入的数字字符串等），闸门不得把「与本次无关的更新」一并拦死。
- **fields 为空数组的守卫（评审 B1，BLOCKING）**：create（`resolveObject` bundle 缺失返回 `fields: []`，`record.service.ts:244-245`）与 update（`:787-788`）都可能得到空 fields——「发布后新建的活表对象」是真实可达状态。此时**跳过未知字段拒绝与类型校验**（仅保留 2.3 平台键剥离），打 warn 日志留观测；与 D-002「空 fields 自然跳过」语义同构。**不得顺手改成显式拒绝**——「未发布对象禁止写数」是产品语义变更，须另行裁决。
- **批量/CSV**：batchCreate/batchUpdate 逐行走 create/update，自动获得闸门；batchCreate 逐行独立事务 + errors 数组（`:990-1001`）、batchUpdate 逐行 try/catch 收集（`:1021-1031`），均不中止、HTTP 仍 200，CSV 导入的违例行进入 per-row 错误清单，不炸整批。
- **调用面一视同仁（不加 channel 标志）**：流程执行器（`object-operation.executor.ts:65/:86`、`batch-operation.executor.ts:74/:103`）/审批回写（`process-engine.ts:973`）与 HTTP 同闸门。理由：①引擎写的是 schema 字段（节点配置的字段映射），未知键=配置错误，400 是想要的显式失败（对齐「对象更新节点未命中记录显式失败」的既有语义）；②R-A 无需区分通道的计算字段行为（计算字段两通道都不拦），channel 标志是 YAGNI。**已知代价（评审建议 4）**：审批回写通道的 400 被既有 catch 吞为日志（`process-engine.ts:981-986`「不阻断审批推进」）——回写值配置错将静默不回写；既有 UI 用 stored value 配置（`UserTaskConfigForm.tsx:150`）风险低，写入实现记录提醒方言指南后续补 stored value 强调。

### 2.3 平台键防御性剥离（顺带修复事实 4；对 ADR「拒绝」语义的显式例外）

create/update 写入前、**在闸门之前**（顺序：剥离 → 未知字段 → 类型校验）对平台列名键做**静默剥离**（不入 data JSONB、也不报错）：`id, version, createdAt, updatedAt, createdBy, updatedBy, tenantId, appId, objectId, environmentId`（`version` 在 update 侧本有既有剥离，create 侧并入本清单——客户端回显整记录含 version 是合法形态）。理由：这些键是平台管辖列，客户端回显整个记录对象是合法形态，报错会误伤；但任其落 JSONB 是数据污染（现状事实 4）。**这是对 ADR-0006「未知字段拒绝」的显式例外，理由如上**，与被否决的「业务未知字段静默剥离」不同。**防碰撞守卫（评审建议 2）**：字段 apiName 白名单为 `/^[a-z0-9_]+$/`（`object.service.ts:669`），`id/createdAt` 等是合法 apiName——**键命中已定义字段时不剥离**（业务字段优先）。剥离列表以命名常量 `PLATFORM_COLUMN_KEYS` 固化。

### 2.4 CSV 导入逐列强转（配套必改）

导入构建 data 时按字段类型强转（`record-import-export.service.ts`，**在既有 `''→null`（`:220`）之后执行**——否则空单元格 `Number('')=0`，评审建议 3①）：
- number/currency/percent：`Number(cell)`，NaN/Infinity → **该行失败**（行错误「字段 X 的值「v」不是有效数字」，整行不入 records）；
- checkbox：`'true'/'false'`（大小写不敏感）→ 布尔，其余值 → 行失败；
- multi_select：字符串按 `,` 切分 + trim 为数组（单值包成 `[v]`）；
- attachment：非空值 → 行失败「附件字段不支持 CSV 导入」（现状是静默写 `[object Object]` 垃圾串，闸门后显式报错优于垃圾，评审建议 3③）；
- 其余类型保持字符串形态（date/select/user/lookup 本就以字符串契约存储）。
- **已知边界**：①导出侧 multi_select `join(',')`（`:124`）与导入按逗号切分的 round-trip 依赖选项 label/value 不含逗号（seed 现有选项已核实无逗号）——记录为限制；②模板示例行（`getExampleValue` 的 `'选项1'`）原样导入会在 single_select 值域校验报行错误——行为从「静默脏数据」变「显式行错误」，预期内。

### 2.5 明确不做（本轮边界）

- 引擎管辖字段（如审批状态）的用户直写拦截——那是字段级写授权，属 R-C manifest 治理（已知遗留风险：用户可 POST status 直写，本轮不扩大战线）；
- user 字段存在性校验、attachment 项深查、sub_form 值形态；
- seed 直连 Prisma 路径（搭建期数据，无 AI 攻击面）；
- 计算字段用户传值硬拒绝（2.1 表内已注明，后续收紧候选）。

## 3. 测试方案

1. **单测先行（TDD 红）** `record.service.spec.ts` 新增组「R-A 数据面写路径闸门」：create 未知键 400（含消息断言）/平台键剥离不落库（含与业务字段同名不剥的防碰撞用例）/number 拒字符串与 NaN/select 出值域 400（含 optionStoredValue value 配置形态）/multi_select 非数组 400/checkbox 拒 'true'/date 拒数字与乱串/**'' 对非文本类型视同空通过**/计算字段传值仍通过（现状锚定）/**fields 空数组守卫（create+update 双路径，B1）**/update 只校验增量（存量脏数据不阻塞无关更新）/**update 存量值原样回显跳过（B2a echo 豁免）+ 改值仍被校验**/fieldScope 范围外键静默丢弃负向锚定/batchCreate 行级违例进 errors 数组不抛（200 契约）。
2. **CSV 强转单测**（importer spec，如无则新建）：数字列字符串→数字、checkbox 'false'→false、multi_select 逗号切分、空单元格→null（不被 Number('')=0）、非法数字→行失败、attachment 列→行失败、模板示例行导入→select 值域行错误（预期行为锚定）、导出→导入 round-trip（选项无逗号前提）。
3. **回归**：现有 D-002 用例组必须全绿（语义不变）；`pnpm typecheck` + `pnpm test` 全量。
4. **端到端**：全量 e2e 回归（闸门不得破坏 seed 页面/采购流程/CSV 导入既有路径；评审核查 3 已证 e2e 记录 payload 均为原生类型字面量无平台键）；另跑受影响链路的 API 实测（未知字段 400 响应体可见）。
5. **QA 走查**：本轮纯后端校验，无 UI 变化；GUI 影响面=表单提交收到 400 时既有 fetcher toast 行为（已存在），走查降为 API 级实测 + 说明，不做全矩阵 GUI 走查。

## 4. 文档义务（同提交）

TEST-CASES.md（TC-238 起，含回归锚点）、QA-TEST-PLAN-PROMPT.md（记录写路径校验矩阵）、ROADMAP R-A 状态、AGENTS.md 当前阶段条目、knowledge-base 实现记录 `DATA-GATE-2026-11-07.md`。

## 5. 被否方案

- 静默剥离未知字段（ADR-0006 已否决：AI 无自修正信号）；
- ValidationPipe DTO 白名单方案（动态字段本质与 Pipe 模型冲突，且闸门须覆盖引擎/CSV 等非 HTTP 通道）；
- channel 标志区分用户/引擎（R-A 无行为差异，YAGNI）；
- update 校验 mergedData（会拦死「与本次无关的存量脏数据更新」）。

## 6. 独立评审修订记录（2026-11-07，对抗评审子代理，3 BLOCKING + 7 建议全采纳）

- **B1（BLOCKING）fields 空数组边界**：bundle 缺失对象 create/update 双路径 `fields: []`（`record.service.ts:244-245/:787-788`）会让闸门拒绝全部入参且 e2e/单测均不覆盖（静默回归）→ 采纳空守卫跳过 + warn 日志 + 双路径测试。
- **B2（BLOCKING）studio 全量回显×存量脏数据**：编辑抽屉全量重发（`RecordFormDrawer.tsx:96-120`）+ CSV 存量数字串 → 合法编辑 400 → 采纳方案 (a) 存量回显豁免（echo-tolerant）。
- **B3（BLOCKING）'' 归一化**：studio 已核实安全（清空产出 null/undefined），amis 通道无法证实（R6 valueFormat 事故为先例）→ 采纳「'' 对非文本类型视同空」。
- 建议 1-7：剥离先于闸门 + create 侧补 `version`/`id` 等防碰撞守卫（命中已定义字段不剥）/CSV 强转顺序与 attachment 行失败与 round-trip 限制记录/回写静默失败代价记录/错误消息列可用字段名/date 宽松度注明/引用行号勘误。
