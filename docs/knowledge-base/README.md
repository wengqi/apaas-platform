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
    └── ROADMAP-UPDATE-*.md    # 路线图更新
```
