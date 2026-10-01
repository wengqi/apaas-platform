# R1.2 版本模型与审核中心实现记录（2026-10-01）

> 蓝图 G1（ADR-0003）：草稿→提交→发布三级版本模型，按"AI 出稿人审批 + diff 快审"设计。
> 承接：G4 MCP（PR #7）——本记录描述 MCP 写路径接入治理轨道后的最终形态。

## 1. 状态机与数据模型

```
                 ┌──────────── 人工提交（HUMAN，studio）────────────┐
                 │                                                  ▼
活表（开发态） ──┴── AI 提交（AI_MCP，MCP）──▶ PENDING ──人批──▶ APPROVED
  ▲                                            │                   │
  │                                            ├─人驳─▶ REJECTED   │（新提交）
  │                                            └─新提交─▶ SUPERSEDED│
  └────────────── 撤销未提交（恢复最新 APPROVED 基线）◀──────────────┘
```

- **ResourceVersion**（`resource_versions`，迁移 `20261001045319`）：提交快照链。
  - `module`：OBJECT | PAGE | PROCESS（R1.2 统一范围）
  - `entityId`：活表 ID，可空（AI 新建资源批准后才落活表并回填）
  - `versionNumber`：按 `[appId, module, apiName]` 链自增（新资源靠 apiName 维持链，因此唯一键用 apiName 而非 entityId）
  - `baselineVersionId`：diff 基线 = 提交时最新 APPROVED 版本；同时是 R1.4 hotfix 谱系的 parent_version_id 钩子
  - `snapshot`：规范快照（OBJECT 仅业务字段；PAGE=apiName/name/type/objectId/schema；PROCESS=apiName/name/workflowSchema/triggerType/cron）
- **三态映射**：draft = 活表开发态（自动保存沿用 PageSavePoint + 直存）；submitted = PENDING 行；published = 最新 APPROVED 行（应用级发布/回滚仍走 AppVersion，R1.4 再拆环境指针）。

## 2. 治理策略（用户裁决：仅 AI 提交需人审）

| 通道 | 行为 | 依据 |
|---|---|---|
| MCP `submit_*_draft`（AI_MCP） | G3 校验 → PENDING 待审 + TENANT_ADMIN 站内信通知；**批准前不触碰活表** | "AI 仅产草稿"，全环境人审硬闸门 |
| 审核中心"提交基线"（HUMAN） | 活表当前态 → 即时 APPROVED 基线快照 | 开发者=受信发布主体；基线供历史/diff/撤销 |
| 批/驳权限 | v1 沿用应用发布权限（`@RequirePermission('PAGE','MANAGE','appId')`），审核者=可发布者 | ARCHITECTURE §8"批/驳是权限点（谁可审可配）"的可配置化起点 |

**漂移保护**：批准时若活表快照 ≠ 提交基线快照（提交后有人工未提交修改）→ 400 拒绝并提示；`force:true` 显式覆盖（UI 弹确认框）。新资源（entityId=null）无漂移问题。

## 3. 批准落地语义（applySnapshot 三模块）

| 模块 | 新建 | 更新 | 生效时机 |
|---|---|---|---|
| OBJECT | objectService.create（注入系统字段）+ 业务字段合并 | 系统字段保留 + 业务字段整体替换（ChangeLog UPDATE） | 即时（对象无独立发布概念） |
| PAGE | pageService.create（isPublished=false） | pageService.update（含保存点） | 随应用发布快照上线 |
| PROCESS | processService.createProcess（DRAFT；有 cron 补一次 update） | processService.updateProcess（已发布自动降 DRAFT + 注销定时触发器） | 人工发布流程（PROCESS_PUBLISH 审计不变） |

落地通道复用既有 service（保留 ChangeLog/保存点/触发器语义），changedBy 记 `review:<userId>`；撤销未提交记 `discard:<userId>`。

## 4. diff 快审（shared 纯函数内核）

- `packages/shared/src/review/schema-diff.ts`：按**数组身份键**结构 diff（apiName > id > key > name 配对；无键元素按相对顺序配对；尾部增删可识别）。
- 输出人读路径：`fields.amount`（对象字段）、`workflowSchema.nodes.ut1.data.taskName`（流程节点属性）、`schema.body.c1`（页面组件）；`新增 X · 修改 Y · 删除 Z` 摘要。
- 明细上限 200 条（超出只截断明细不截断计数）；`stableStringifyEqual` 键序无关比较供脏检测复用。
- gateway（提交单列表/详情）与 studio（DiffDrawer 渲染）共用同一实现——**零新依赖**（不引入 jsondiffpatch 类库，理由：按身份键配对产出评审可读条目，通用 path-diff 对组件树移动会产生噪音）。

## 5. API 与 UI

- `POST /api/v1/apps/:appId/reviews/submit|discard`、`POST .../reviews/:id/approve|reject`、`GET .../reviews[?status=]|/dirty|/versions`、`GET .../reviews/:id`
- 审核中心 `/app/:appId/reviews`（侧栏入口带待审徽标，React Query 无轮询）：待审（diff 摘要列 + 抽屉快审）/ 已处理（审批意见）/ 未提交变更（提交基线/撤销/版本历史）。
- 审计动作：`REVIEW_SUBMIT`（人工）/ `REVIEW_APPROVE`（含 forced 标记）/ `REVIEW_REJECT` / `REVIEW_DISCARD`；MCP 侧 `MCP_DRAFT_SUBMIT` 保留。

## 6. 踩坑记录

1. **MCP 直写活表是治理漏洞**：G4 原实现"草稿"仅靠 isPublished/status 标志，AI 产出实际立即进开发态。R1.2 后 submit 工具一律走 ReviewService.submitAiDraft，对象字段合并逻辑迁至 review-snapshot.service。
2. **@UseGuards(PermissionGuard) 必须类级挂载**：controller 漏挂时 `req.user` 为 undefined → requireTenantId 500；且挂 guard 的模块必须 imports PermissionModule（与 McpModule 同坑，交接简报已预警）。
3. **快照含系统字段会产生伪 diff**：AI 提交业务字段 vs 基线含系统字段 → 系统字段被识别为 REMOVED。快照规范为仅业务字段，系统字段在落地时注入。
4. **AntD 两字按钮**（"确 定"）在 e2e 定位时正则要容许空格：`/确\s*定/`。
5. **`as const` 不能用于三元表达式**（TS1355）：qk 构造器条件键改为每个分支各自 `as const`。

## 7. 边界与后续

- 不做：资源删除类提交审核（v1 仅新建/更新）；自动 schema 合并（蓝图首版排除）；平台内置 AI 对话面板（推迟到 P1 后）。
- R1.4 接口承诺：发布=切环境指针（AppVersion 不变快照 + ResourceVersion 资源链）；baselineVersionId 已为 hotfix 谱系（取回/并行线）留钩子。
