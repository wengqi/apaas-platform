# AI 主线第五轮：数据驱动的 AI 生成质量（2026-10-09）

> 分支 `feat/ai-mainline-r5-quality-telemetry`，四个工作流 + 实测闭环。依据 ADR-0004 决策 4/5/7/8。

## 交付物（4 提交）

| 提交 | 工作流 | 内容 |
|---|---|---|
| a7db866 | A 遥测 | 观测 SSOT 五分类 AI_GENERATION；mcp.service 提交接受/拒绝埋点（批量逐项+@ref 拒绝，issueCodes 结构化）；review.service 仅 AI_MCP 批/驳/收编埋点；GET /observability/ai-analytics；观测中心 AI 质量面板 |
| 290d138 | D1 JsonLogic 子集 SSOT | packages/shared/jsonlogic：15 操作符契约（语义/操作数/翻译器）；prisma default 拒绝信息消费 SSOT；**sql 翻译器 '!===' 四字符笔误修复（'!==' 严格不等此前从未下推——子集对齐练习挖出的真 bug）**；双向锚定测试 |
| fffdadd | D2 指南↔G3 一致性 | 双向锚定：校验器源码静态提取的每条拦截码必须在指南有说明（正向）、指南引用的码必须真实存在（反向）；五指南补拦截规则码节；修 get_dialect_guide enum 漂移（3→5 kind） |
| 62e4b74 | B 草稿可改流 | adoptDraftEdit：AI 草稿置 SUPERSEDED→编辑快照经 applySnapshot 落活表（继承 G3 硬闸+基线归一化）→人工 APPROVED 基线（谱系记"收编自 AI 草稿 vN"）；POST reviews/:id/adopt；审核中心"改稿收编"入口+JSON 弹窗；遥测 review:adopted |

## 实测闭环（expense_mgmt 员工报销应用，MCP 无状态 HTTP 驱动）

- 建应用→批量提交 6 项（对象+3页面+流程+数据集）→故意拦截（input-cascader→TYPE_FORBIDDEN）→admin 批量批准→改稿收编（API 级）→新 PENDING→GUI 收编（弹窗改 JSON→toast"已收编为人工基线 v4"）
- 遥测 18 事件全部命中：submit-accepted 8 / submit-rejected 2 / review:approved 6 / review:adopted 1 + 更早尝试
- 面板实测：提交尝试 10、G3 拦截率 20.0%、一次人审通过率 87.5%、平均返工 0.1622、规则码 Top（ROOT_INVALID/TYPE_FORBIDDEN 各 1）
- 版本谱系双行验证：v1 SUPERSEDED(AI_MCP)+v2 APPROVED(HUMAN) 双向溯源 comment
- 事件口径事实：被 G3 拒的提交无 ResourceVersion 行→首拦率只能取自事件流；批次一次通过率/返工轮次取自版本链（batchId 每次全新，靠 apiName+versionNumber 链）；聚合端点为租户口径，appId 参数可隔离
- C4 结论：N=9 首批样本两拦截码指南均已覆盖，无需修订；后续按面板靶子持续修

## 验证

gateway 790 / shared 30 / studio 166 / db 55 全绿，typecheck 11/11；GUI 走查两关通过（截图 gui-test-screenshots/r5_observability_ai_quality_panel.png）。

## 工程注记

- MCP 无状态直调可用（POST /api/v1/mcp 带 Accept: json+event-stream，解析 SSE data: 行或纯 JSON 信封，取 result.structuredContent）
- 用户禁用 MCP 时 ~/.zcode/cli/config.json 整块移除（含过期 token，顺带完成清理）；再接入用 scripts/refresh-mcp-token.sh --login 或 REST 登录取 accessToken
- gateway 构建目标 CJS：spec 里 import.meta 不可用，静态文件扫描用 process.cwd() 相对路径
- versions 端点要求 module+entityId 同时给（既有合同）；版本链核查可走 reviews 列表
