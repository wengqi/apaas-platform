# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **主用户：开发者（应用搭建者）**——在 studio 用对象建模 / 页面搭建 / 流程编排交付企业内部业务应用，也负责审核 AI 生成的草稿。
- **第二用户：业务用户（终端用户）**——在 runtime 使用已发布应用：提交申请、处理审批、查看台账与报表。
- **治理角色：租户管理员 / 平台超管**——审核中心人审、权限、环境管理。

## Product Purpose

企业内部真实使用的 aPaaS 低代码平台：对象建模 + 页面搭建（amis 单方言）+ 自研流程引擎（审批）+ 台账报表 + 行级权限，多租户。AI Agent 经 MCP 生成应用草稿（第一公民用户），全环境人审闸门批准后落地；开发者与 AI 共用同一搭建面。成功标准 = 能在平台上完整交付并运行一个真实业务应用（表单 + 审批 + 报表）。

## Positioning

受约束的 AI 应用生成底座（ADR-0003/0004）：元数据与治理轨道是产品本体——AI 仅出草稿、版本模型 + 一次人审、漂移保护、结构化校验闸门（G3）；能力语义对标飞书 aPaaS 但运行在非飞书的企业环境（CAS + LDAP 身份对接）。AI 是开发者的交付工具，平台不内置 chat。

## Operating Context

- 企业办公室白天场景，桌面浏览器（1440±），长时间工作面；非飞书环境。
- 双表面：**studio（搭建器）** 与 **runtime-ui（运行时）**，共享一个产品世界但服务不同任务。
- 开发迭代以"实测闭环"为准：AI 生成 → 人审 → 发布 → 运行时使用全链路。
- 数据敏感：采购合同、报销、员工信息等企业业务数据。

## Capabilities and Constraints

- 技术栈固定：React 18 + Vite + AntD v5（组件体系不换）；runtime 页面由 amis 引擎渲染（单方言）。
- 设计 token 层 `@apaas/shared/design` 是双前端视觉 SSOT；前端 src 禁止 hex 字面量（守卫 scripts/check-design-tokens.sh 零容忍）。
- 质量红线：0 lint warning、typecheck 全绿、单测全绿方可推送。
- 未上线：零兼容包袱，果断删旧。
- 显式未决：暗色模式（ConfigProvider theme 地基本轮铺，暗色本身未立项）。

## Brand Commitments

- 产品名：**aPaaS**（studio 端呈现 "aPaaS Studio"，runtime 端呈现 "aPaaS Runtime"）。
- 图形符号：现状通用闪电 ⚡ + emoji 瓷片，**用户已裁决可重新设计**（2026-10-12）。
- 中文为界面主语言；工程词不得直出业务用户界面。

## Evidence on Hand

- 上轮设计评审快照：`.impeccable/critique/2026-10-12T10-01-33Z__packages-studio-packages-runtime-ui-platform-ui.md`（21/40，P0×2 已修）。
- 36 项飞书 aPaaS 对标矩阵：`docs/research/RESEARCH-feishu-apaas-live-benchmark-2026-09-27.md`。
- 方向裁决：`docs/adr/`（ADR-0002/0003/0004）。
- 种子应用即真实演示内容（采购合同管理 / 员工报销 / 采购分析等，见 packages/db/seed*.ts）。

## Product Principles

1. **治理即产品**：人审闸门、版本模型、漂移保护不是外围功能，是本体——界面要让"受约束"显得可信而非碍事。
2. **双表面一个世界**：搭建器与运行时是同一产品的两个房间，不是两个产品。
3. **业务用户看得懂**：工程行话（apiName、对象/页面/流程计数、版本号）不直出业务面。
4. **密度为长时工作服务**：企业用户每天用数小时，扫读效率与稳定布局优先于装饰表达。
5. **先核实后修复**：一切视觉结论以实测截图与守卫脚本为准，不凭印象。

## Accessibility & Inclusion

- 现状已有 a11y 基础（focus-visible、aria-expanded、键盘可达，2026-10-12 审计轮建立）；本轮起对比度按 WCAG AA（正文 ≥4.5:1）执行。
