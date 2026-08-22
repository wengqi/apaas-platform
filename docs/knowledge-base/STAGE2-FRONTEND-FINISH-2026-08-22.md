# Stage 2 前端收尾 + 条件表达式清理 — 2026-08-22

> 基于 2026-08-06 状态矩阵更新，反映 08-22 Stage 2 前端缺口补全 + 条件表达式遗留修复。

## 本次完成的工作

### Part A：条件表达式清理

#### A1. date 类型映射修复
- **文件**：`packages/studio/src/components/process/configs/query-builder-config.ts`
- `mapFieldType` 添加 `case 'date': return 'date'`（此前 date 落入 default → text）
- `OPERATOR_KEYS_BY_TYPE.date` 已存在（8 个比较操作符），新增 `relative_date`（共 9 个）
- 修复 `it.skip` → `it()`，date 字段类型映射测试全部通过

#### A2. relative_date 操作符注册
- **前端**：`query-builder-config.ts` — 注册 `relative_date` 操作符（label "相对日期"），配置 select widget（8 种预设：今天/昨天/近7天/近30天/本周/本月/本季度/本年），注册 JsonLogic 导出模板 `{ relative_date: [{ var: field }, "today"] }`
- **后端（流程评估路径）**：`process-utils.ts` — 通过 `jsonLogic.add_operation('relative_date', ...)` 注册自定义操作，计算日期区间并返回 boolean
- **后端（Prisma 翻译路径）**：`jsonlogic-to-prisma.ts` — 新增 `translateRelativeDate` 函数 + `computePrismaDateRange` 工具，将 `relative_date` JsonLogic 节点翻译为 Prisma `AND(gte start, lt end)` 范围过滤
- **类型声明**：`json-logic-js.d.ts` — 修正 `addOperation` → `add_operation`（snake_case，json-logic-js 2.x 实际方法名）
- **测试**：`jsonlogic-to-prisma.spec.ts` 新增 5 个 relative_date 测试（today/this_month/未知预设/非字段引用/参数不足）；`query-builder-config.spec.ts` 新增 2 个 relative_date widget 测试

#### A3. 过时注释清理
- **文件**：`ConditionConfigForm.tsx` — 移除已删除的"表达式模式/CodeMirror"双模式描述，更新数据流注释为纯可视化模式

### Part B：Stage 2 前端收尾

#### B1. 应用编辑入口
- **文件**：`packages/studio/src/pages/AppList.tsx`
- 卡片操作菜单新增"编辑应用"项（所有状态可用）
- 新增编辑 Modal（复用创建表单结构，apiName 只读）
- 新增 `updateMutation` 调用 `appsApi.update`（此前 API 已存在但从未被调用）
- 创建按钮打开时重置表单

#### B2. 站内信 UI
- **新增类型**：`packages/shared/src/notification/index.ts` — `InAppMessage`、`InAppMessageListResponse`、`InAppMessageUnreadCountResponse`
- **新增 API**：`packages/runtime-ui/src/api/notifications.ts` — 封装 4 个端点（list / getUnreadCount / markAsRead / markAllRead）
- **新增组件**：`packages/runtime-ui/src/components/NotificationBell.tsx` — Badge 铃铛 + Popover 消息列表 + 未读/全部筛选 + 单条点击标记已读 + 全部已读按钮。**不使用轮询**（遵循禁止定时器轮询原则），改用 `refetchOnWindowFocus` 窗口焦点事件驱动刷新
- **集成**：`RuntimeLayout.tsx` — Header 右侧（用户头像前）插入 `<NotificationBell />`

#### B3. 权限规则编辑器增强
- **B3a fieldScope 列级编辑器**：`PermissionRuleEditor.tsx` — RECORD/DATA_MODEL 类型 + 具体对象时，在行级条件下方显示 Checkbox.Group 列级权限编辑器，ALLOW 效果下勾选可见字段白名单
- **B3b 按类型动态目标选择**：`PermissionRuleEditor.tsx` — 目标 Select 根据 rule.type 动态渲染：PAGE→页面列表、PROCESS→流程列表、RECORD/DATA_MODEL→对象列表、CONNECTOR→仅通配符。新增 pages/processes 查询（按需 enabled）
- **B3c 组织角色授权 UI**：`OrgManager.tsx` — 选中组织节点后显示"角色授权"区域，支持查看已授权角色列表、添加角色授权、撤销角色授权（closable Tag）。后端新增 `GET /api/permissions/orgs/:id/roles` 端点 + `getRoleGrants` service 方法

#### B4. 图表组件骨架
- **新增类型**：`packages/shared/src/page/index.ts` — `ChartType`（bar/line/pie/funnel）、`ChartAggregation`（sum/count/avg/max/min）、`ChartConfig` 接口
- **新增工具**：`packages/shared/src/page/chart-options.ts` — `buildChartOption` 函数，从绑定数据 + 配置构建 ECharts option（支持 4 种图表类型 + 5 种聚合方式 + mock 数据预览）
- **依赖**：studio + runtime-ui 添加 `echarts` + `echarts-for-react`
- **Studio 渲染器**：`ComponentRenderer.tsx` — 替换占位 `renderChart`，编辑模式使用 mock 数据、预览模式解析绑定数据
- **Runtime 渲染器**：`ComponentRenderer.tsx` — 替换占位 `renderChart`，从 ViewModel 解析绑定数据
- **属性面板**：`PropertyPanel.tsx` — 新增 `ChartPropsSection` 组件（图表类型/标题/分类字段/值字段/聚合方式配置）
- **组件元数据**：`pageComponents.ts` — chart defaultProps 更新为 `{ chartType: 'bar', title: '图表' }`

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `pnpm typecheck` | ✅ 11/11 包通过 |
| `pnpm lint` | ✅ 11/11 包通过（0 warnings） |
| `pnpm test` | ✅ 全部通过（studio 86 tests + gateway tests） |
| `pnpm build` | ✅ 9/9 包构建成功 |

## 对齐度更新

| 模块 | 08-06 | 08-22 | 变化原因 |
|------|-------|-------|---------|
| 权限/多租户 | 80% | 85% | +fieldScope UI + 动态目标 + 组织角色授权 |
| 页面搭建器 | 92% | 95% | +图表组件骨架（4 种图表类型 + 属性面板） |
| 运行时前端 | 87% | 90% | +站内信 UI + 图表渲染 |
| 应用管理 | 92% | 95% | +应用编辑入口 |
| 流程引擎 | 82% | 83% | +relative_date 操作符 + date 类型映射修复 |

**整体对齐度：~80% → ~83%**

## 明确排除（不在本次范围）

- 审计日志查询 UI — 后端无查询 API 端点，需新增 Controller + Service，单独排期
- 图表完整数据聚合引擎 — 属于 Phase 7（仪表盘）范畴，本次仅做骨架
- 移动端适配 — 属于 Stage 4 打磨阶段
