# 状态矩阵 — 2026-09-30（ADR-0003 方向修订 + P0 落地）

> 承接 STATUS-MATRIX-2026-09-25。本批次：**产品方向修订（ADR-0003：AI 原生底座）** + **P0 全量落地**（R1.S spike / S2 amis 接入 / S3 R1.3 审批语义 / S4 采购合同验收应用 / S5 e2e 验收）+ **G3 Schema 校验合同**。
> 方向文档：`docs/adr/0003-ai-native-schema-first-platform.md` + `docs/design/DESIGN-refactor-blueprint-2026-09-30.md` + `docs/architecture/ARCHITECTURE.md`（全量修订）。

## 一、阶段任务达成（新口径：ADR-0003 蓝图 P0/P1/P2）

| 任务 | 状态 | 交付 |
|---|---|---|
| R1.S 前置 spike ×2 | ✅ | antd 主题贴合生产级；LLM 生成合法率首过 80%→修正 100%（3d1449c） |
| S2 amis 渲染器接入 | ✅ | AmisRenderer/ApprovalPageRenderer + getTask boundPageId + 任务中心接入（0e08794） |
| S3 R1.3 审批语义 | ✅ | 会签/或签/依次聚合（锁内并发封窗）+ 加签/撤回端点 + 节点配置面板 + 流程出入参（158cfa4/3b1798a/bc54d51） |
| S4 验收应用骨架 | ✅ | procurement 应用：供应商/合同对象 + 台账/提交页（v1 方言）+ amis 审批页（v2）+ 金额分支/会签/依次审批流（dc11266） |
| S5 e2e 验收（R1.5） | ✅ | e2e/16 全链路 4 用例（创建触发→分支→会签聚合→依次终审→完成/撤回）+ 全量 68/68（3ca11e4） |
| G3 Schema 校验合同 | ✅ | 三类校验器（amis 渲染器真值白名单/Workflow 20 节点/对象 18 类型）+ 25 单测（46e0916） |
| R1.2 版本模型 / R1.4 多环境 / G4 MCP / G5 数据下沉 / G6 纯流程 API | ⬜ | P1 待推进（G4 前置 G3 已就绪） |

## 二、质量指标

| 指标 | 数值 |
|---|---|
| 单元测试 | 834 全绿（gateway 577 / db 42 / shared 39 / studio 168 / runtime-ui 8 新增 vitest） |
| E2E | **68/68**（Playwright 16 spec；新增 16-procurement-approval 全链路验收） |
| build / typecheck / lint | 全绿（0 error 0 warning） |
| 依赖新增 | amis/amis-ui/amis-core@6.13.0 锁版本 + mobx@4.15.7/mobx-react-lite@2.2.2（红线：理由见 commit 0e08794 与 spike 报告） |

## 三、关键架构决策（本批次）

1. **一切界面皆页面**（用户裁决）：form 非独立方言/模块——amis 中 form 是 page 体系内组件类型；审批节点绑定页面（可含表单+关联信息），无 kind 区分。
2. **amis 单方言**（用户裁决）：不引入 formily（2025-06 起停更）；官方 amis schema.json 与渲染器不一致 → **G3 校验器自建**（渲染器真值 + 平台约束子集）。
3. **集成红线**：mobx 锁 4.15.7（amis 隐式依赖 mobx-react-lite 未声明）；React 18 下禁 StrictMode；渲染错误只进 DOM 不进 console（机判扫 DOM）。

## 四、P1 优先级

G4 MCP AI 接口（G3 已就绪）→ R1.2 版本模型（AI 出稿人审批 + diff 快审）→ R1.4 多环境 → G5 数据集下沉 SQL → G6 纯流程 API 产品化。详见蓝图 P1 表。
