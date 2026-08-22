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
    └── CODING-PRINCIPLE-*.md  # 编码原则记录（约束链强制执行）
```
