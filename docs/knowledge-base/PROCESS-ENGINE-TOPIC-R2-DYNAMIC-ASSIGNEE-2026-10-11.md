# 流程引擎专题 R2：动态审批人（ORG / FORM_FIELD）与 SUPERVISOR 摘除 实现记录

> 日期：2026-10-11 ｜ 分支：`feat/process-engine-topic-r1` 续作（R1 同分支）
> 台账：A2 → C8 已移档；裁决：**选 (a)**——ORG/FORM_FIELD 实现解析、SUPERVISOR 摘除（用户拍板）
> 方法：E2 探针实测固化症状 → 裁决 → TDD（6 失败单测先行 → 全绿）

## E2 实测证据（探针三用例，跑通后删除）

| 类型 | UI 实际写入 | 运行时症状 | 发布预检 |
|---|---|---|---|
| ORG | 组织编码字面进 `data.assignee` | 任务行 assignee=`"ORG_DEPT_A"` 创建成功、实例 WAITING——无人 ID 匹配 → **挂起且无人可见** | ✅ 判定完整能发布（最隐蔽） |
| FORM_FIELD | 字段名进 `data.assignee` | 同上（字段名被当用户 ID） | ✅ 能发布 |
| SUPERVISOR | 什么都不写（UI 无输入框） | executor 抛"无受理人"→ 实例失败 | ❌ 判定不完整被拦，选了发不出去 |

数据模型核实：`schema.prisma` **无 manager/supervisor/leader 字段**（上级主管无数据源）；`OrgMember` 关联表在（抄送解析器已有 orgId→成员先例）；触发上下文已注入 `record`（扁平记录行，字段 apiName 为键）。

## 实现（裁决 a）

### ORG——candidateGroups 语义扩展（零迁移，Flowable 同款）

发现 `ProcessTask` **无 candidateUsers 列**（`assertInstanceVisible` 原读取为不存在列的死代码），故不采用"展开成员写 candidateUsers"方案，改为复用 BPMN 原生候选组语义：

- **契约**：`candidateGroups` = 角色 ID **或** 组织 ID。
- **executor**：`assigneeType==='ORG'` 校验组织存在且有成员（`orgMember.count`，无成员报清晰错误——防"无主任务无人可见"静默挂起，#12 同教训）；任务行走既有无主任务行路径（assignee=null + candidateGroups=[orgId]）。
- **任务中心匹配**：`listTasks` 的 `candidateGroups hasSome` 从 roleIds 扩为 **roleIds ∪ orgIds**（orgMembers 本就已查询，原先只用于展开组织授权角色）；`assertTaskMembership` 同步扩展。
- **实例可见性**：`assertInstanceVisible` 参与人判定改为「assignee 命中 或 candidateGroups ∩（我的角色 ID ∪ 我的组织）」，顺带清除 candidateUsers 死代码。

### FORM_FIELD——记录字段动态审批人

- **executor**：`assigneeType==='FORM_FIELD'` 时 assignee=触发记录字段 apiName，运行时取 `triggerContext.record[field]`（须为非空字符串用户 ID）作受理人；**仅记录触发可用**——无 record 上下文（定时/API/手动）、字段不存在/值为空均报清晰错误。
- UI 不变（手输字段 apiName），placeholder 改为明确说明。

### SUPERVISOR——摘除（无数据源的能力不放假入口）

- shared `UserTaskAssigneeType` 收窄（去 SUPERVISOR，注释留恢复条件：User.managerId + "找不到主管降级"语义）；
- studio `ASSIGNEE_TYPE_OPTIONS` 移除；存量草稿若有 SUPERVISOR 节点，node-check 仍判不完整拦发布（行为不变）。

### studio ORG 输入形态修正

- 从"手输组织编码"（#12 同款编码歧义）改为**组织下拉选择器**（`orgsApi.getTree()` 树拍平，写 candidateGroups=[orgId]，orgName 展示缓存）；类型切换清理补 orgName。

### 方言指南

workflow 指南补 ORG（候选组=角色或组织、须有成员）与 FORM_FIELD（记录字段取值、仅记录触发）两节；指南↔G3 一致性不受影响（未新增规则码）。

## 活文档同步（同提交）

- TEST-CASES：TC-175（ORG）/ TC-176（FORM_FIELD）入库（2026-10-15 rebase 轮改号：原编 TC-161/162 与 impeccable 轮撞号），变更记录 v1.7；
- QA-TEST-PLAN：矩阵 2 user_task 行 assigneeType 6→5 种（SUPERVISOR 摘除备注）；
- 台账：A2→C8、A 节清空、E2 关闭、排序更新（下一轮 S1/S2）；
- AGENTS.md：R2 收官条目 + 专题状态更新。

## 验证与遗留

- 红绿证据：6 failed（ORG 无成员报错/FORM_FIELD 三路/listTasks 匹配/getInstance 可见性）→ 40/40 全绿；回归对照（仅角色匹配/ORG 契约固定）全程绿。
- `pnpm test` 11 包全绿、`pnpm typecheck` 11/11、smoke 17/17。
- **遗留**：TC-175/176 的 GUI 黑盒二级交互（组织下拉选择→发布→组织成员任务中心可见）待推送前 QA 走查；组织审批的"组织授权角色"（orgRoleGrant）与直接组织成员两条匹配腿并存，语义已注释说明。
