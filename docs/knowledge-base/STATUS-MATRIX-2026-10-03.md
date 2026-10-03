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

---

# 追加批次 — 零知识 UI 旅程两轮（同日）

> 本批次：A/B 角色扮演两轮——①纯 UI 零知识从零建「设备报修」应用（对象/页面/发布/运行）；②流程画布补走（审批流+状态回写运行时闭环）。修 7 / 列 9。
> 实现记录：`ROLEPLAY-NEWBIE-JOURNEY-2026-10-03.md`。

## 主线验证矩阵（第二轮：流程全链路，真实浏览器执行）

| 步骤 | 结果 | 步骤 | 结果 |
|---|---|---|---|
| 画布加节点（连线加号+RAQB 条件） | ✅（#8 可发现性待规划） | builder 提交报修 → 自动触发 | ✅ WAITING_USER_TASK |
| 条件分支 decision==APPROVED（RAQB→JsonLogic） | ✅ 落库 | 角色任务（candidateGroups=租户管理员） | ✅ assignee=null 任务行（#12b 修复） |
| 对象操作映射 recordId/status | ✅ inputsValues 落库（#10 修复） | admin 任务中心批准 | ✅ 待办→已办 |
| 流程发布 v3 + 应用 0.1.3 | ✅ | **状态回写 待处理→已完成，实例 COMPLETED** | ✅ 端到端 |

## 修复矩阵（追加）

| 修复 | 层 | 验证 |
|---|---|---|
| H1b 提交成功 toast（fetcher 层兜底，替代 notify 桥） | runtime-ui | 实测“操作成功” |
| #10 fieldMapping→inputsValues 转换 + extInfo 并入导出（配置丢失根因） | studio serializer/EventBridge | spec 4 + 落库 schema 断言 + 运行时回写成功 |
| #11 FieldMapper 空行保留 | studio | A 实操加行成功 |
| #12 角色审批契约四连（UI 下拉写角色ID/引擎无主任务行/roles URL v1/列表权限） | studio+gateway | spec 1(gateway) + 端到端角色任务批准 |
| #13 已发布流程“转为草稿编辑”入口 | studio toolbar | A 实操 0.1.3 迭代 |
| H1/H2/H3/M1/M2/M4（第一轮，见旅程文档） | 多层 | 详见旅程文档 |

## 质量指标（追加后）

| 指标 | 数值 |
|---|---|
| 单元测试 | gateway **699**（+1）/ studio **118**（+4）/ db 55 / shared 17 全绿 |
| typecheck / lint | 全绿 |

## 遗留（第二轮新增，优先级序）

1. #8 加节点入口可发现性（交互设计：常显加号/右键/工具栏）
2. #15 审批页模板+绑定引导（申请内容现在渲染原始 JSON）
3. #16 驳回禁用时按钮应禁用+提示；驳回链路端到端复验
4. #14 成功 toast 双弹（amis/AntD 页均现，疑事件双触发）
5. roles v1 路径修复的权限页回归（管理员路径行为不变，建议 e2e 补一条 builder 读角色列表）

---

# 追加批次二 — 遗留四项处置 + #17 路由断裂（同日深夜）

> 处置旅程遗留 #8/#14/#15/#16；验证驳回链路挖出 #17 条件分支路由断裂（前两轮"通过"验证实为降级碰巧正确）。应用 0.1.4 复验：**驳回端到端首次真实走通**（扫描仪→已驳回）。

| 修复 | 层 | 验证 |
|---|---|---|
| #17 条件分支 edge label 契约（label=title 同源）+ block extInfo 并入导出 | studio serializer/EventBridge | spec + 落库断言 + 驳回端到端（轨迹走 elseBlock） |
| #16 allowReject 全链路（引擎强制/默认允许/getTask 下发/前端禁用） | gateway engine+service / runtime-ui | 单测 ×2 + 拒绝实测 + 默认值确认 |
| #15 审批申请内容友好渲染（inputFieldLabels + inputs 摊平） | gateway getTask / runtime-ui TaskCenter | 实测中文标签键值表 |
| #8 加号常显 + 审批模式按类型联动 | studio ApaasAdder / UserTaskConfigForm | 视觉 + 下拉联动实测 |

质量：gateway **701**（+2）/ studio **119**（+1）。#14 toast 双弹定性关闭（自动化双击）。
遗留：审批页"生成模板并绑定"、user 字段值显示用户名、完整驳回禁用 e2e（引擎有单测）。


---

# 追加批次三 — 资源依赖链批量提交（同日深夜）

> AI-first 打磨轮 backlog 第一优先项落地：`submit_app_drafts` 单波生成完整应用 + 审核中心一键批准（拓扑序落地 + @ref: 引用令牌解析）。实测：2 次 MCP 调用 + 1 次人审生成「会议预定」完整应用（对象+2 页面+流程，跨资源引用自动接线）。gateway 707（+8）/ db 55（迁移 review_batch_id）。实现记录 `BATCH-SUBMIT-2026-10-03.md`。遗留：MCP users/roles 只读工具、表单 api.url 令牌化。
