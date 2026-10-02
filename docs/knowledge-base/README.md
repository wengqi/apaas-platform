# 项目知识库

> 本目录持久化记录项目开发过程中的关键决策、审计结果、技术债修复记录和进度状态。
> 与 `docs/prd/`（产品需求）、`docs/design/`（设计规范）、`docs/roadmap/`（路线图）互补，
> 侧重于**工程实践层面**的 knowledge capture。

## 文档索引

| 文档 | 日期 | 内容 |
|------|------|------|
| [FEISHU-ALIGNMENT-BENCHMARK](./FEISHU-ALIGNMENT-BENCHMARK.md) | 2026-08-03 | **飞书 aPaaS 对齐基准**（11 大模块功能体系 + 技术架构 + 业务流程 + 产品交互 + 对齐度矩阵）— 后续所有功能开发的对齐参考 |
| [AUDIT-2026-08-02](./AUDIT-2026-08-02.md) | 2026-08-02 | 全域代码审计报告（59 项发现：未引用代码 + 空实现 + 接口一致性） |
| [PHASE1-TECH-DEBT-FIX-2026-08-03](./PHASE1-TECH-DEBT-FIX-2026-08-03.md) | 2026-08-03 | 第一阶段阻断性技术债修复记录（权限执行 + ChangeLog + 通知 + 定时触发 + 审计日志） |
| [STATUS-MATRIX-2026-08-03](./STATUS-MATRIX-2026-08-03.md) | 2026-08-03 | 功能完成度矩阵（15 模块逐项评估 + 飞书对齐度） |
| [ROADMAP-UPDATE-2026-08-03](./ROADMAP-UPDATE-2026-08-03.md) | 2026-08-03 | 后续推进计划（4 阶段 10 周路线图 + 技术债处理决策） |
| [PHASE-PROCESS-FEATURES-2026-08-05](./PHASE-PROCESS-FEATURES-2026-08-05.md) | 2026-08-05 | 流程引擎三大功能实现记录（流程监控终止 + 抄送 + 条件表达式混合模式）+ 变量体系调研 + 架构经验总结 |
| [CONDITION-EXPRESSION-REFACTOR-2026-08-05](./CONDITION-EXPRESSION-REFACTOR-2026-08-05.md) | 2026-08-05 | 条件表达式重构方案（react-awesome-query-builder + JsonLogic + CodeMirror）— 现有问题分析 + RAQB 适配性评估 + JsonLogic 选型 + 架构设计 |
| [ARCHITECTURE-ANALYSIS-2026-08-06](./ARCHITECTURE-ANALYSIS-2026-08-06.md) | 2026-08-06 | 技术选型架构审阅与演进计划（全栈技术栈审计 + 工程化缺口核查 + 开发阶段优先级校准 + 分阶段演进路线图） |
| [STATUS-MATRIX-2026-08-06](./STATUS-MATRIX-2026-08-06.md) | 2026-08-06 | 功能完成度矩阵（18 模块逐项评估 + 工程化治理新增模块 + 飞书对齐度 ~80%） |
| [ROADMAP-UPDATE-2026-08-06](./ROADMAP-UPDATE-2026-08-06.md) | 2026-08-06 | 后续推进计划更新（工程化治理已完成 + 技术债 28 项决策表 + Phase 5-8 路线图） |
| [CODING-PRINCIPLE-NO-POLLING-2026-08-16](./CODING-PRINCIPLE-NO-POLLING-2026-08-16.md) | 2026-08-16 | 编码原则：禁止定时器轮询（setInterval）→ 事件驱动架构替代 + ESLint 拦截规则 |
| [STAGE2-FRONTEND-FINISH-2026-08-22](./STAGE2-FRONTEND-FINISH-2026-08-22.md) | 2026-08-22 | Stage 2 前端收尾 + 条件表达式清理（应用编辑 + 站内信 UI + 权限规则增强 + 图表骨架 + relative_date 操作符 + date 类型映射修复）|
| [PHASE5-CONNECTOR-2026-08-22](./PHASE5-CONNECTOR-2026-08-22.md) | 2026-08-22 | Phase 5 连接器与集成（连接器实体 + CRUD + 凭证管理 + HTTP 调用引擎 + Webhook 接收 + 流程节点升级 + 前端管理 UI）|
| [STATUS-MATRIX-2026-08-22](./STATUS-MATRIX-2026-08-22.md) | 2026-08-22 | 功能完成度矩阵（24 模块逐项评估 + 连接器/数据集/仪表盘新增模块 + 测试基础设施风险 + 飞书对齐度 ~88%）|
| [STATUS-MATRIX-2026-08-23](./STATUS-MATRIX-2026-08-23.md) | 2026-08-23 | 功能完成度矩阵（Phase 7 运营报表 + TD-17 租户隔离 $extends 重构 + 42 单元测试 + 飞书对齐度 ~96%）|
| [TENANT-ISOLATION-EXTENDS-REFACTOR-2026-08-23](./TENANT-ISOLATION-EXTENDS-REFACTOR-2026-08-23.md) | 2026-08-23 | TD-17 租户隔离 $extends 重构（三层防御体系 Layer 2 — Prisma 自动注入 tenantId + AsyncLocalStorage 上下文 + BullMQ worker 修复 + 42 单元测试）|
| [DEMO-APP-2026-08-23](./DEMO-APP-2026-08-23.md) | 2026-08-23 | Phase 10.4 完整 Demo 应用（资产管理系统 — 3 业务对象 + 7 页面 + 1 审批流程 + 24 示例记录 + 仪表盘 + 应用发布 + 12 E2E 验收测试）|
| [CODE-REVIEW-2026-08-23](./CODE-REVIEW-2026-08-23.md) | 2026-08-23 | 全面代码审查报告（后端/前端/飞书对齐三维度 — 8 个 HIGH 缺陷修复 + 12 项 MEDIUM 修复 + 对齐度校准 ~97%→~68%）|
| [CODE-REVIEW-2026-09-13](./CODE-REVIEW-2026-09-13.md) | 2026-09-13 | 专业代码审查报告（08-23 修复验证全通过 + 新发现 P0 安全缺陷 chart-data ABAC 旁路 + P1×11 + 架构评估 + 对齐度 ~68% 维持）|
| [TEST-QUALITY-REPORT-2026-09-13](./TEST-QUALITY-REPORT-2026-09-13.md) | 2026-09-13 | 测试质量报告（单元 477 全过 + 覆盖率 40.55% + E2E 修复三层断裂后 48/48 全绿 + 捕获 P0 产品回归：记录创建 API 全量 400）|

| [R4-FEATURE-COMPLETION-2026-09-25](./R4-FEATURE-COMPLETION-2026-09-25.md) | 2026-09-25 | R4 功能补全与对齐收口（流程引擎 20 节点全量 + 严格 AND-join + 子流程同步等待 + Rollup/Lookup + 组织授权传播 + 看板/画廊/日历视图 + OAuth2；532 单测全绿）|
| [STATUS-MATRIX-2026-09-25](./STATUS-MATRIX-2026-09-25.md) | 2026-09-25 | 功能完成度矩阵（A-J 模块逐项评估 + 三批功能补全 + 飞书对齐度 ~72% / 工程完成度 ~96%）|
| [STATUS-2026-09-25](./STATUS-2026-09-25.md) | 2026-09-25 | STATUS 归档（AGENTS.md「当前阶段」历史完成明细，2026-09-26 从 AGENTS.md 迁出）|
| [REVIEW-INDEPENDENT-2026-09-26](./REVIEW-INDEPENDENT-2026-09-26.md) | 2026-09-26 | 独立评审报告（4 路只读静态评审 + 纯浏览器 e2e 实测；暴露核心 UI 路径枯死而 CI 全绿、安全 5.5/10、上线就绪度 ~60%；含整改优先级清单）|
| [REMEDIATION-2026-09-26](./REMEDIATION-2026-09-26.md) | 2026-09-26 | 评审整改记录（评审→修复→验证对照：安全 / 引擎与数据 / 产品与前端 / 质量 / 规范五类闭环，遗留项归类为技术边界与设计取舍）|
| [OSS-SELECTION-VERIFICATION-2026-09-30](./OSS-SELECTION-VERIFICATION-2026-09-30.md) | 2026-09-30 | 产品重构方向选型核实（amis/formily/NocoBase/OpenTiny/lowcode-engine 源码-协议-活跃度实证 + 表单模块痛点根因 + 两轮方向讨论结论 → ADR-0003）|
| [SPIKE-AMIS-ADOPTION-2026-09-30](./SPIKE-AMIS-ADOPTION-2026-09-30.md) | 2026-09-30 | R1.S 准入 Spike 双通过（S1a antd 主题贴合生产级 / S1b 生成合法率首过 80% 一轮修正 100%；官方 schema.json 不可机判、mobx 版本矩阵/去 StrictMode 等集成红线；GO → P0 立项）|
| [STATUS-MATRIX-2026-09-30](./STATUS-MATRIX-2026-09-30.md) | 2026-09-30 | 状态矩阵（ADR-0003 方向修订 + P0 全量落地：R1.S/S2-S5/G3 ✅；e2e 68/68、单测 834；P1 待推进）|
| [REVIEW-VERSION-MODEL-2026-10-01](./REVIEW-VERSION-MODEL-2026-10-01.md) | 2026-10-01 | R1.2 版本模型实现记录（资源级三态 + 提交快照链 + 仅 AI 人审治理策略 + diff 快审自研内核 + 批准落地/漂移保护/撤销语义 + 踩坑）|
| [STATUS-MATRIX-2026-10-01](./STATUS-MATRIX-2026-10-01.md) | 2026-10-01 | 状态矩阵（G4 MCP 合并 + R1.2 版本模型落地：e2e 72/72、gateway 单测 610；下一批 R1.4/G5/G6）|
| [MULTI-ENV-2026-10-01](./MULTI-ENV-2026-10-01.md) | 2026-10-01 | R1.4 多环境实现记录（环境指针/双维注入/读路径 bundle 化/触发器随环境启停/G1-G4 护栏/兼容降级链/踩坑）|
| [STATUS-MATRIX-2026-10-01b](./STATUS-MATRIX-2026-10-01b.md) | 2026-10-01 | 状态矩阵（R1.4 完整 M3 落地：e2e 77/77、gateway 单测 627；P1 剩 G5/G6）|
| [DATASET-SQL-2026-10-01](./DATASET-SQL-2026-10-01.md) | 2026-10-01 | G5 数据下沉实现记录（pipeline SQL 化/语义对齐表/filter 兜底策略/安全隔离/踩坑）|
| [OPEN-API-2026-10-01](./OPEN-API-2026-10-01.md) | 2026-10-01 | G6 纯流程 API 实现记录（服务身份/API 触发器/major 冻结契约承诺/P1 轨道收官）|
| [STATUS-MATRIX-2026-10-02](./STATUS-MATRIX-2026-10-02.md) | 2026-10-02 | R1.5 刷新验收（P1 全链路协同矩阵/发现缺陷修复/e2e 88/88；下一批 R1.7）|
| [AMIS-MIGRATION-R17-2026-10-02](./AMIS-MIGRATION-R17-2026-10-02.md) | 2026-10-02 | R1.7 第一轮实现记录（方言判别/渲染分流/fetcher 摊平/CodeTab 兜底/StrictMode 红线/踩坑）|
| [DROP-LEGACY-RUNTIME-2026-10-02](./DROP-LEGACY-RUNTIME-2026-10-02.md) | 2026-10-02 | 删旧优先：v1 运行时轨下线 + R1.4 兜底腿退役 + publishedSnapshot 列删除 + seed 环境指针化（未上线零兼容原则落地/新不变量/测试处置理由）|
| [AMIS-EDITOR-CANVAS-R17B-2026-10-02](./AMIS-EDITOR-CANVAS-R17B-2026-10-02.md) | 2026-10-02 | R1.7 第二轮②画布 amis-editor 重写（导出形态/pnpm 布局/i18n-runtime 损坏/OOM/脏态窗口/DTO 白名单六坑 + create 补 G3 + StrictMode 扩展 studio）|

## 文档维护规则

1. **每次重大变更后更新**：代码审计、技术债修复、Phase 完成后，新建对应的知识库文档
2. **文件命名**：`{TYPE}-{YYYY-MM-DD}.md`，如 `AUDIT-2026-08-02.md`、`PHASE2-FRONTEND-2026-08-10.md`
3. **状态矩阵定期更新**：`STATUS-MATRIX-*.md` 在每个阶段完成后更新最新版本
4. **路线图跟踪**：`ROADMAP-UPDATE-*.md` 在计划调整时更新，标注已完成项

## 与其他文档的关系

```
docs/
├── prd/           # 产品需求文档（Phase 级别，闸门产出）
├── design/        # 设计规范（UI/UE 详细设计）
├── research/      # 调研报告（飞书 aPaaS、flowgram.ai）
├── roadmap/       # 原始路线图（ROADMAP.md + 技术债清单）
├── architecture/  # 架构总览
├── test/          # 测试用例
└── knowledge-base/  # 本目录 — 工程实践 knowledge capture
    ├── README.md              # 索引（本文件）
    ├── AUDIT-*.md             # 代码审计报告
    ├── PHASE*-*.md            # 阶段修复/实现记录
    ├── STATUS-MATRIX-*.md     # 功能完成度矩阵
    ├── ROADMAP-UPDATE-*.md    # 路线图更新
    ├── ARCHITECTURE-ANALYSIS-*.md  # 技术选型架构审阅
    ├── REVIEW-*.md            # 独立/专项评审报告
    ├── REMEDIATION-*.md       # 评审整改记录（评审→修复→验证对照）
    ├── STATUS-*.md            # AGENTS.md「当前阶段」历史归档
    └── CODING-PRINCIPLE-*.md  # 编码原则记录（约束链强制执行）
```
