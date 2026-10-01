# 状态矩阵 — 2026-10-01b（R1.4 多环境落地）

> 承接 STATUS-MATRIX-2026-10-01。本批次：**R1.4 运行环境多环境化（完整 M3）**——P1 队列最大单项。
> 实现记录：`docs/knowledge-base/MULTI-ENV-2026-10-01.md`。

## 一、阶段任务达成

| 任务 | 状态 | 交付 |
|---|---|---|
| R1.4 环境数据层 | ✅ | AppEnvironment（dev/prod 指针）/ Deployment / EnvVarDef+Value（敏感值加密）；records/process_instances/node_executions/auto_number_counters 加 environmentId；ProcessInstance 冻结 schema；迁移含存量 backfill |
| R1.4 发布=切指针 | ✅ | publish 挂 prod 指针；环境级 deploy/rollback/preflight 端点 + Deployment 历史；G4 必填环境变量硬拦；回滚=指针回切（记录不回滚） |
| R1.4 运行数据隔离 | ✅ | ALS 双维注入（ENV_SCOPED_MODELS 四模型）；`?env=`/`X-Env` 上下文（缺省 prod）；dev/prod 记录/实例/序列互不可见 |
| R1.4 运行时读路径 | ✅ | 页面 slug/审批页/对象字段/流程定义全部 bundle 优先 + 降级链（存量应用零感知）；实例冻结 schema（在途实例不受版本切换影响） |
| R1.4 触发器随环境启停 | ✅ | jobId= scheduled:<env>:<defId>（修复 pattern 清理互踩 bug）；rebuildForEnvironment 按 bundle 重建；记录事件按环境匹配 |
| 环境变量护栏（G1-G4） | 🟡 | G3 审计+敏感值加密 ✅、G4 发布硬闸 ✅、G2 分类约定文档化 ✅、G1 仅警告级（机判不可靠，严格版列后续） |
| UI | ✅ | studio 环境管理页（指针/部署/回滚/历史/环境变量）+ PublishWizard 目标环境；runtime-ui 顶栏切换 + 审批页环境渲染 |

## 二、质量指标

| 指标 | 数值 |
|---|---|
| 单元测试 | gateway **627** 全绿（+27：resolver 降级链/发布回滚/预检/G3 环境变量）/ db 49（双维注入）/ shared 45 |
| 覆盖率 | 61.31% / 74.13% / 72.32%（阈值 58/72/72，全过） |
| E2E | **77/77**（Playwright 18 spec；新增 18-multi-env 6 用例：指针状态→dev 部署隔离→G4 拦截/放行→`${env.*}` 替换→prod 回滚→记录隔离；**旧 spec 零改动全绿**=兼容降级验证） |
| build / typecheck / lint | 全绿 |
| 依赖新增 | **零** |

## 三、关键决策

1. **兼容降级链**：指针→bundle→旧 publishedSnapshot→活表。存量应用/seed 无指针走旧路径零感知——这是"全量旧 e2e 零改动全绿"的架构保障。
2. **resolver 缓存原始快照**、`${env.*}` 读取时实时替换——环境变量改值与版本指针解耦。
3. **实例冻结 workflowSchema**：版本切换不影响在途实例（ARCHITECTURE §7.3 不变量 3）。
4. raw SQL 旁路显式过滤 environment_id；Rollup 元数据解析仍读活表（记录已按环境过滤，记为已知简化）。

## 四、P1 队列剩余

**G5 数据下沉**（数据集引擎 PostgreSQL SQL，删内存 join ~2.5k 行）→ **G6 纯流程 API**（API 触发器 + API Key/服务身份 + 流程版本稳定性承诺——v1 契约依赖 R1.2 版本链 + R1.4 指针，已就绪）。
