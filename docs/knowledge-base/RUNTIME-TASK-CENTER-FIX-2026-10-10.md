# 运行时任务中心修复轮（2026-10-10）——权限缺口 / 错误态显式化 / 我发起的视图

> 分支 `fix/runtime-task-center-2026-10-10` · 用户报告「任务中心待办、已办为空」驱动 ·
> 三项修复经用户裁决后实施（方案 1=种子+权限矩阵层补 PROCESS VIEW）

## 一、调查结论（先核实后修复，证据链完整）

用户以 `user@apaas.dev`（终端用户）在「员工报销管理」应用提交一笔申请（测试1010，
2026-10-10 12:59:10），任务中心待办/已办均为空。调查确认**数据链路本身是通的**，
空列表由两层问题叠加造成：

| 事实 | 证据 |
|---|---|
| 记录/实例/任务全部正常创建 | records 落库；实例 `cmv2ei10w000jbtw73l4pnj7p`=WAITING_USER_TASK；任务 `cmv2ei12k000obtw7ohgevp57`=PENDING |
| 任务受理人是搭建者而非提交人 | 流程定义「报销初审」assignee 固定=builder@apaas.dev（二级复核=admin）；用 builder 账号调 `GET /tasks?status=pending` 能看到 20 条含该任务 |
| **根因①：终端用户调任务接口直接 403** | `process.controller.ts` 的 `GET /tasks` 挂 `@RequirePermission('PROCESS','VIEW')`；seed 中 END_USER 只有 `PROCESS EXECUTE/APPROVE`，**无 VIEW**——被授权审批的角色反而打不开任务中心 |
| **根因①放大器：前端吞错成假空态** | `TaskCenter.tsx` 的 useQuery 无错误处理，403 后 `normalizeItems(undefined)`→`[]`，页面渲染"暂无待办任务"，与真空列表不可区分 |
| **根因②：申请人视角无"我发起的"** | 提交申请只产生审批人任务，申请人名下无任何任务记录；任务中心只有待办/已办两 Tab，无飞书 aPaaS「我发起的」对位能力 |

## 二、修复内容

### 修复① END_USER 补 PROCESS VIEW（种子+权限矩阵层，TC-156）

- `packages/db/seed.ts`：END_USER 规则数组补 `{ type: 'PROCESS', action: 'VIEW', targetId: '*' }`。
- **规约（权限矩阵层）**：运行时角色（需使用任务中心）必须包含 PROCESS VIEW——
  app 级自定义角色（如 EXPENSE_USER）建角色时同样适用。
- **连带修复——seed 幂等收敛**：验证时发现 `permission_rules` 无唯一索引，
  `createMany({skipDuplicates})` 实际不去重，历史重跑已累积 END_USER ×3 / BUILDER ×2 副本
  （每重跑一次翻倍）。改为**先删 seed 管辖的通配规则（targetId='*' + ALLOW）再建**，
  收敛为恰好一份；用户/AI 后加的应用级规则（非通配）不受影响。实测收敛后
  BUILDER 48→24、END_USER 16→6，权限评估正常。

### 修复② 列表加载失败错误态显式化（TC-157）

- 新增 `task-center/ListErrorAlert.tsx`：红色告警（"列表加载失败"+具体原因+重试按钮）。
- `TaskCenter.tsx` 待办/已办两个查询、`MyInitiated.tsx` 我发起的查询失败时均渲染告警，
  不再吞成空表。

### 修复③ 「我发起的」视图（TC-158）

- **后端** `GET /instances/mine`（`process.service.listMyInstances`）：
  - 发起人归属 = `triggerContext.triggeredByUser`——记录触发写入记录创建人
    （trigger.service.ts:310），手动/API 启动写入 `StartInstanceRequest.triggeredByUser`，
    全部创建路径已统一覆盖（实测近 8 条实例全有值），**零迁移**；
  - 查询范围天然限定发起人本人，与撤回功能/M-2 实例级可见性同语义；
  - 复用 `toInstanceDto` 投影；路由声明在 `instances/:instanceId` 之前（字面量路由先于
    参数路由，同 `processes/analytics` 先例）；权限 `PROCESS VIEW`。
- **前端** `task-center/MyInitiated.tsx`：第三 Tab「我发起的」——流程名称/申请内容摘要
  （`extractRecordTitle` 取 `triggerContext.inputs.title`，纯函数+单测）/实例状态中文标签
  （运行中·审批中·已完成·失败·已终止）/发起时间/进度按钮；进度弹窗=状态 Descriptions +
  复用 `TraceViewer` 轨迹（当前节点高亮「等待处理」）+审批记录。

## 三、验证（全部实测）

| 验证项 | 结果 |
|---|---|
| 单测 | gateway 807（新增 `process-my-instances.spec.ts` 3 例）/ runtime-ui 25（新增 `task-center/utils.spec.ts` 5 例）/ studio 166 全绿 |
| typecheck | 11/11 通过 |
| seed 幂等 | 重跑两轮：规则数收敛不增长（BUILDER 24/END_USER 6） |
| API（user@apaas.dev） | `GET /tasks` 403→200；`GET /instances/mine` 返回 20 条含「测试1010」(WAITING_USER_TASK) |
| API（builder@apaas.dev） | 待办 20 条含「报销初审」（受理人链路不变） |
| e2e 冒烟 | `pnpm test:e2e:smoke` 17/17 |
| GUI 走查（Playwright headless，runtime-ui dev 5175） | ① user 登录任务中心三页签渲染、无告警、无 JS 错误；② 「我发起的」含测试1010（审批中橙标）；③ 进度弹窗轨迹显示卡在「报销初审·等待处理」；④ 人为阻断 `/api/tasks` 后错误告警+重试正确渲染（截图 `gui-test-screenshots/task-center-*.png` 留档） |

## 四、踩坑与要点

1. **vite preview 旧进程占端口**：5174 被旧 preview 占用，dev server 落到 5175——验证前
   先确认端口上跑的是不是新代码（IAB 退化态教训的同族坑）。
2. **runtime-ui 浏览器侧 API 路径是 `/api/*`**：apiClient baseURL=`/api`，由 vite 代理
   rewrite 成 `/api/v1/*`——Playwright `page.route` 拦截须按浏览器 URL（`**/api/tasks?**`）
   匹配，按网关路径写模式静默不生效。
3. **gateway 跑 dist 无热重载**：改后端须 `pnpm --filter @apaas/gateway build` + 重启
   （本轮以同 cwd=仓库根 nohup 重启，健康检查 200 后再验证）。
4. **NestJS 字面量路由必须声明在参数路由前**（`instances/mine` vs `instances/:instanceId`），
   本仓第二例（先例：`processes/analytics`）。

## 五、文件清单

- `packages/db/seed.ts` — END_USER 补 PROCESS VIEW + 权限规则幂等收敛（先删后建）
- `apps/gateway/src/process/process.service.ts` — `listMyInstances`
- `apps/gateway/src/process/process.controller.ts` — `GET /instances/mine` + 头注释
- `apps/gateway/src/process/process-my-instances.spec.ts` — 新增 3 单测
- `packages/runtime-ui/src/api/tasks.ts` — `listMyInstances` + `MyInstance` 类型
- `packages/runtime-ui/src/pages/task-center/ListErrorAlert.tsx` / `MyInitiated.tsx` — 新增
- `packages/runtime-ui/src/pages/task-center/{TaskCenter.tsx,constants.ts,utils.ts,utils.spec.ts}` — 接线+常量+纯函数+单测
- 文档：TEST-CASES v1.5（TC-156/157/158）、QA-TEST-PLAN-PROMPT v1.0.9（底册 D+锚点）、本记录、AGENTS.md 当前阶段

## 六、遗留

- app 级自定义角色（EXPENSE_USER 等）若需用任务中心，建角色时应勾选 PROCESS VIEW——
  属权限工具面/指南层提示，本轮不改生成器（后续 AI 生成质量轮可作指南增强项）。
- 「我发起的」暂无筛选（状态过滤/分页控件），当前 pageSize=50 拉全量——量大后再迭代。
- 台账/任务中心之外的 GUI 二级交互走查仍按 R5 遗留清单推进。
