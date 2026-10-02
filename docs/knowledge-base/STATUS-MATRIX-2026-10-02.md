# 状态矩阵 — 2026-10-02（R1.5 验收应用刷新：P1 全链路协同验收）

> 承接 STATUS-MATRIX-2026-10-01b。本批次：**R1.5 验收刷新**——用 P1 新能力在采购合同验收应用上重走端到端交付，验证跨能力协同（17/18/19 各自验证单点，本批次验证串联）。
> 蓝图依据：`DESIGN-refactor-blueprint-2026-09-30.md` AI 生成层完整回合示例。

## 一、验收协同矩阵（e2e/20-p1-acceptance，7 用例）

| 协同链路 | 验证内容 | 结果 |
|---|---|---|
| MCP 出稿 → G3 闸 → R1.2 治理轨道 | validate_schema dry-run → submit_page_draft（绑定 contract 对象、标题含 `${env.*}`）→ PENDING 不落活表 | ✅ |
| G1 diff 快审 | 待审列表含结构化 diff 摘要 → 一键批准 → 页面落活表 | ✅ |
| R1.2 × R1.4 串联 | 应用 publish（procurement 首次走真实发布流，脱离 seed 直写快照旧路径）→ prod 指针切换 → runtime `?env=prod` 经 bundle 替换读到 MCP 批准的新页 | ✅ |
| G4 环境变量硬闸 | 新增必填键缺 dev 值 → 部署 400 拦截 → 设值放行；per-env 值（dev/prod 各自替换） | ✅ |
| G6 × R1.3 串联 | MCP submit_workflow_draft（triggerType=API、真实 pageId 过 G3 跨引用）→ 人批落 DRAFT → 流程发布 → api-release major1 冻结契约 → X-API-Key 外部触发 | ✅ |
| 外部发起 → 人工审批 → 业务回写 | 128 万合同：外部触发 → 会签双人（单完成不推进）→ 依次终审 → COMPLETED → object_operation 回写合同 status=APPROVED | ✅ |
| 版本稳定性承诺 | 发 major2 后 major/1 钉版本仍按冻结契约触发 | ✅ |

## 二、验收发现并修复的缺陷（验收即产出）

| 缺陷 | 严重度 | 修复 |
|---|---|---|
| seed 审批页 pageId 绑定存的是 **apiName 而非 id**（seed-procurement L648）——G3 跨引用拒绝、runtime getRuntime 按 id 查找会 404；e2e 16 仅断言 truthy 未暴露 | High（运行时功能缺陷） | 从库取真实页面 id + fail-fast（重 seed 后 16 号 4/4 回归） |
| MCP submit_workflow_draft triggerType 枚举缺 **API**——AI 无法出稿 API 触发流程（G6 后已是合法类型） | Medium（能力缺口） | 枚举 + 方言指南补 API |

## 三、质量指标

| 指标 | 数值 |
|---|---|
| E2E | **88/88**（Playwright 21 spec；新增 20 号 7 用例；16 号 seed 修复后回归全绿） |
| 单元测试 | gateway 657 全绿（无新增——本批次为验收 + seed/MCP 小修） |
| build / typecheck / lint | 全绿 |
| 推送前 OCR 评审 | ✅ 首次按新约定执行（workspace 模式 3 文件，1 Low 修复：④ 阻断键时间戳全量唯一化） |

## 四、遗留与后续

- e2e/16 头注释声称覆盖 or_sign 但无用例（注释偏差）；REJECTED 分支/rejectToNodeId/加签未覆盖——记为后续补测项
- ④ 每轮新建的必填键经 ③ 自愈（缺 prod 值统一补占位）保持跨 run 幂等；CI 全新库无此问题
- **ADR-0003 蓝图 P1 全部完成 + R1.5 刷新验收通过 → 下一批：R1.7 页面层 amis 迁移（P2 最大项）**
