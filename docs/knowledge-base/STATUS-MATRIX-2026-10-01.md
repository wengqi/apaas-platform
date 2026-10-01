# 状态矩阵 — 2026-10-01（R1.2 版本模型 + diff 快审落地）

> 承接 STATUS-MATRIX-2026-09-30。本批次：**G4 MCP AI 接口（PR #7 合并 main）** + **G1/R1.2 草稿→提交→发布三级版本模型 + diff 快审**（蓝图 P1 治理轨道主体）。
> 蓝图：`docs/design/DESIGN-refactor-blueprint-2026-09-30.md`；实现记录：`docs/knowledge-base/REVIEW-VERSION-MODEL-2026-10-01.md`。

## 一、阶段任务达成

| 任务 | 状态 | 交付 |
|---|---|---|
| G4/R1.6 MCP AI 接口 | ✅ | PR #7（2026-10-01 合并）：无状态 Streamable HTTP + 12 工具 + G3 闸 + 草稿审计；本批次接入 R1.2 治理轨道（submit_* 一律 PENDING 待审，新增 list_review_submissions 回读审批结果与驳回意见） |
| G1/R1.2 版本模型 | ✅ | 资源级三态（OBJECT/PAGE/PROCESS 统一）：ResourceVersion 提交快照链（PENDING/APPROVED/REJECTED/SUPERSEDED；versionNumber 链内自增；baselineVersionId 谱系钩子）+ 不可回改迁移 `20261001045319_add_resource_versions` |
| G1 验收项：diff 快审 UX | ✅ | 审核中心 `/app/:appId/reviews`（侧栏徽标）：待审/已处理/未提交变更三页签；schema 级结构化 diff（shared 纯函数内核：对象按字段 apiName / 流程按节点 id / 页面组件树，增删改三色）；一键批准（漂移保护可 force）/ 驳回（意见必填回传提交者） |
| 治理策略（用户裁决） | ✅ | **仅 AI 提交需人审**：MCP 提交 → PENDING，批准才落活表；人工提交即时 APPROVED 作为基线快照（历史版本链 / diff 基线 / 撤销未提交）；批/驳权限 v1 沿用应用发布权限（审核者=可发布者） |
| 撤销未提交 | ✅ | 脏资源清单（活表 ≠ 最新基线，含"从未提交"资源）→ 一键恢复基线快照；提交基线入口（人工版本模型起点） |

## 二、质量指标

| 指标 | 数值 |
|---|---|
| 单元测试 | gateway **610** 全绿（新增 review.service 14 + mcp 改造后 11）/ shared diff 纯函数 11 / studio 168 |
| 覆盖率 | 61.55% / 74.27% / 72.34%（阈值 58/72/72，全过） |
| E2E | **72/72**（Playwright 17 spec；新增 17-review-center 治理闭环 5 用例：MCP 提交→待审不落活表→UI diff 批准落地→驳回意见回传→提交基线/撤销恢复） |
| build / typecheck / lint | 全绿（0 error 0 warning） |
| 依赖新增 | **零**（diff 自研纯函数进 shared，无 lockfile 变更） |

## 三、关键实现决策

1. **双轨提交语义**：AI（AI_MCP）→ PENDING 待审；人工（HUMAN）→ 即时 APPROVED。同资源仅挂一张待审单（新提交 SUPERSEDE 旧单）。
2. **漂移保护**：批准时若活表 ≠ 提交基线快照（期间存在未提交人工修改）→ 400 拒绝，需 `force` 显式覆盖（UI 弹确认）。
3. **落地语义**：对象批准即生效；页面落库 `isPublished=false`（随应用发布上线）；流程落 DRAFT（激活仍走流程发布，PROCESS_PUBLISH 审计不变）——与既有发布闸门叠加而非替代。
4. **快照规范形态**：OBJECT 快照仅含业务字段（系统字段批准落地时注入，不参与 diff，避免系统字段伪差异）。
5. **diff 自研不引库**：按"数组身份键"结构 diff（apiName>id>key>name 配对 + 无键按序配对），评审可读路径（`fields.amount` / `schema.body.c1`）优于通用 JSON-diff 库的 path ops；明细截断 200 条不截断计数。

## 四、下一批（P1 队列）

R1.4 多环境（发布=切环境指针，ResourceVersion.baselineVersionId 谱系钩子已备）→ G5 数据下沉 → G6 纯流程 API（v1 契约稳定性承诺依赖本版本链）。
