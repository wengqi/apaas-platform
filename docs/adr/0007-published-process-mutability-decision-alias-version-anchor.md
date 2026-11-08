# ADR-0007: 已发布流程可变性、decision 别名废弃与流程版本锚点

- 状态：已接受（2026-11-08，R-B 开工前裁决轮三项 ADR 级裁决，用户全按推荐确认）
- 关联：ADR-0006（R-B 排期出处）、G6 开放 API 版本承诺（apiName+major 冻结快照永久可调）、工单档 `docs/knowledge-base/ADVERSARIAL-REVIEW-PROCESS-ENGINE-2026-10-25.md`（PE-07/PE-18/PE-19，评审轮 R2-engineering-10 约定本 ADR 出口）
- 性质：纯决策（R-B 执行轮落地代码）

## 背景

流程引擎专项对抗审查（2026-10-25，两轮 31+20 确认）暴露三处架构级问题，评审轮标定为 ADR 级裁决项：

1. **已发布流程可变性无治理闭环（PE-07）**：PUBLISHED 流程一次任意字段 PUT 即静默降 DRAFT（注释自认临时）；删除守卫「请先归档」指向全库不可达的 ARCHIVED 死状态；守卫被一次常规保存解锁后 DELETE 级联销毁 processApiRelease——G6「旧 major 仍可调用」承诺被击穿（全链实机复现）。修法（ACTIVE release 硬闸）若无退役路径则成单向门：不可编辑、不可删除、不可退役，G6 新 major 迭代被掏空。
2. **decision 顶层别名自矛盾（PE-18）**：引擎兼容层把每审批节点的决策无条件覆写到顶层 `decision` 别名——并行多审批时「最后完成者」成全局决策，业务走批准终点而 `variables.decision=REJECTED`；方言指南（mcp-server.factory.ts）正教 `{"var":"decision"}` 裸引用，多审批 schema 下是陷阱。废弃别名须处理两类迁移窗口管不到的存量：G6 release 冻结快照（永不修改、承诺永久可调）与在途实例 frozen schema——停注入则 decision 边恒 undefined，条件边全不匹配，流程静默终结。
3. **流程定义无版本锚点（PE-19）**：schema 原地覆盖、publish 同行自增，实例不记录执行版本——同一实例重发布后版本号 2→3 漂移而冻结 schema 未变，历史实例审计失真、无回滚锚点。

## 决策

### 一、已发布流程可变性（◆4 / PE-07）

1. **PUT→DRAFT 快捷迭代保留**：编辑已发布流程即降 DRAFT 属快捷迭代语义，不是事故；非 API 流程（记录/定时触发，恒无 release 行）降级补 UI 提示面（R2-engineering-02 残余）。
2. **ACTIVE release 硬闸**：存在 ACTIVE release 的流程，禁止 DELETE 与 DRAFT 化（错误信息指向退役路径）。
3. **release 主动退役路径（单向门解除，必带子项）**：新增主动退役端点（ACTIVE→DEPRECATED）；补 ARCHIVED 状态写入点——「请先归档」守卫指向的路径自此可达。DEPRECATED 快照对调用方仍可调（延伸 G6「旧 major DEPRECATED 仍可调」既有口径，退役 ≠ 不可调）；发现端点补 status 元数据（compat-04 可选硬化顺带）。
4. G6 版本承诺本体不变：major 冻结快照语义、新 major diff 半自动、旧 major 可调。

### 二、decision 顶层别名废弃（◆7 / PE-18）

1. **对新 schema 废弃顶层别名**：决策变量走节点命名空间注入（`decision_<nodeId>` 形态随开工 TDD 定），方言指南与 MCP 指南同批修订——停教 `{"var":"decision"}` 裸引用，多审批场景教节点命名空间引用。
2. **冻结快照求值层兼容（必带）**：已发布 release 的 frozen schema 与在途实例，别名注入**永久保留**——存量快照的 decision 边继续求值，不因废弃而静默终结；兼容层带锚定测试（冻结快照别名注入回归）。
3. 新旧分界以 schema 版本/发布时刻判定，不追改历史。

### 三、流程版本锚点（◆8 / PE-19）

1. **实例行加快照版本列（轻量，本轮做）**：实例创建时钉住执行版本号，`toInstanceDto` 读快照值——消除「重发布后历史实例版本漂移」的审计失真；回滚锚点语义随之成立。
2. **ProcessDefVersion 全历史表另立专项（本轮不做）**：全历史牵动 G6 发布/回滚模型与存储面，独立立项评估，不并入 R-B 波次。

## 被否方案

- **版本式编辑替代 PUT→DRAFT（◆4b）**：牵动大且与版本锚点耦合，快捷迭代语义已满足开发者工作流。
- **预检警告放行触发环（◆5 相关，非本 ADR 但同轮裁决）**：环=无界资源耗尽，硬拦。
- **别名直接停注入（无兼容层）**：存量冻结快照 decision 边全 undefined → 流程静默终结，倒退 R2 轮防静默失败成果。
- **全别名保留仅指南劝退（◆7b）**：不修复「最后完成者成全局决策」的自矛盾终态，只文档化缺陷。
- **ProcessDefVersion 全历史表本轮并入（◆8b）**：牵动 G6 与回滚模型，投资/风险不成比例。

## 后果与义务

- 工单档 PE-07/PE-18/PE-19 行回引本 ADR；R-B 执行轮同提交落实指南修订（方言指南 + mcp-server.factory）与兼容层锚定测试。
- G6 相关文档（OPEN-API-2026-10-01.md、方言指南版本承诺节）补「DEPRECATED 可调 + 主动退役端点」口径。
- ◆5/◆6/◆9 及降级表升格两条（correctness-01 运行面 start 可见性归纳、security-04 运行面投影 DTO）为实现级裁量，随工单执行，不入 ADR。
