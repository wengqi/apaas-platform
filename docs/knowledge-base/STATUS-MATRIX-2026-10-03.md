# 状态矩阵 — 2026-10-03（AI 第一公民主线打磨第一轮）

> 承接 STATUS-MATRIX-2026-10-02。本批次：**主线纵深打磨方法论落地**——AI 用 MCP 从零生成请假审批应用走完八步全生命周期，按阻塞度修摩擦点（修 6 / 列 7）。
> 实现记录：`AI-FIRST-POLISH-2026-10-03.md`（含完整摩擦点清单与修复明细）。

## 一、主线验证矩阵（真实 MCP 客户端协议，curl 模拟 ZCode 接入）

| 步骤 | 结果 | 步骤 | 结果 |
|---|---|---|---|
| create_application 建应用 | ✅（本轮新增工具） | 流程激活 + 应用发布 1.0.0 | ✅ |
| 对象草稿（validate→submit→PENDING） | ✅ | 记录创建 → 自动触发流程 | ✅ |
| 人审批准（对象/页面×2/流程） | ✅ 系统字段注入 | 审批任务 complete | ✅ |
| 页面草稿 ×2（表单+审批页） | ✅ | 状态回写 approving→approved | ✅ |
| 流程草稿（single+条件分支+双通知） | ✅ | IN_APP 通知触达 | ✅ |

## 二、修复矩阵

| 修复 | 层 | 验证 |
|---|---|---|
| MCP 必填参数守卫（requireParams，required 声明为唯一事实源） | gateway/mcp | 单测 5 + 实测（缺 appId → 结构化错误） |
| create_application 工具（容器操作即时生效 + MCP_APP_CREATE 审计） | gateway/mcp | 单测 1 + 实测建应用 |
| list_pages 摘要投影（token 浪费治理） | gateway/page + shared | 实测无 schema 带 apiName |
| submit hint 带 appId + 依赖链指引 | gateway/mcp | 实测 |
| apiName/slug 统一输出 | shared + studio + runtime 构造 | typecheck 全绿 |
| JWT refresh（派生密钥双向隔离）+ 续期脚本 | gateway/auth + scripts | 单测 3 + 实测（互换 401/脚本端到端） |

## 三、质量指标

| 指标 | 数值 |
|---|---|
| 单元测试 | gateway **698**（+12）/ studio 114 / db 55 / shared 17 全绿 |
| typecheck / lint | 全绿 |
| 文档同步 | AGENTS.md 当前阶段 / ROADMAP 打磨轮 / 知识库 / commitlint+AGENTS scope 加 mcp / doc-sync ✅ |

## 四、遗留与后续（优先级序）

1. **资源依赖链批量提交**（AI 单波生成完整应用）——下一轮最高价值
2. MCP 工具面扩展（数据集/权限规则/触发器/应用发布）
3. 批准事件回调（替代 agent 轮询）
4. 低优先：publish 字段可发现性 / records data.data 双层 / tasks 列表字段名 / 审核角色分离策略
5. 测试数据待清理：demo 租户 mcp_polish_leave 应用 + 资产管理 mcp_test_feedback PENDING 草稿
