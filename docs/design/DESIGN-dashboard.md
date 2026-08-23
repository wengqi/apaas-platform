# DESIGN — 仪表盘与报表（Phase 7）

> 版本：v1.0 · 日期：2026-08-23 · 负责人：架构师（主智能体）
> 对标：飞书 aPaaS 仪表盘与报表
> 关联契约：`packages/shared/src/page/chart-options.ts` · `packages/shared/src/page/index.ts` · `packages/shared/src/stores/component-renderer.tsx`
> 验收闸门：Phase 7 技术闸门（ ROADMAP.md ）
> 状态：✅ 已实现（2026-08-22，回溯编写）

---

## 1. 架构设计

### 1.1 组件关系图

```
┌─────────────────────────────────────────────────────────┐
│              页面搭建器 / 运行时前端                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         component-renderer.tsx                   │    │
│  │                                                  │    │
│  │  renderDashboardGrid(node, ctx)                  │    │
│  │    └─ ResponsiveGrid (react-grid-layout)         │    │
│  │         └─ renderChild(child) → 子组件            │    │
│  │                                                  │    │
│  │  renderChart(node, ctx)                          │    │
│  │    └─ buildChartOption(chartType, ...)           │    │
│  │         └─ aggregate(records, cat, val, agg)     │    │
│  │    └─ ReactECharts option={option}              │    │
│  │                                                  │    │
│  │  renderStatistic(node, ctx)                      │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼ 编辑模式                  ▼ 预览/运行模式
    MOCK_DATA               POST /api/v1/apps/:appId/datasets/chart-data
    (5 条示例)               ┌──────────────────────────┐
                            │   ChartDataController     │
                            │   (JwtAuthGuard)          │
                            └────────────┬─────────────┘
                                         │
                            ┌────────────▼─────────────┐
                            │   ChartDataService       │
                            │   loadSourceData()       │
                            │     ├─ object → Record   │
                            │     └─ dataset → DatasetRow│
                            │   executeAggregation()   │
                            │     groupBy + agg func   │
                            └──────────────────────────┘
```

### 1.2 数据流

**编辑模式**：renderChart → 无绑定数据 → buildChartOption 使用 MOCK_DATA（5 条示例）→ ReactECharts 渲染预览

**运行模式（前端聚合）**：renderChart → resolvePropValue 解析绑定数据 → buildChartOption 执行 aggregate（前端内存聚合）→ ReactECharts 渲染

**运行模式（后端聚合）**：前端 → ChartDataController → ChartDataService.aggregate → loadSourceData（Record/DatasetRow）→ executeAggregation（groupBy + sum/count/avg/max/min）→ 返回 `{ data, categories, values, totalRecords }` → 前端构建 ECharts option

---

## 2. 组件清单

### 2.1 后端（apps/gateway/src/dataset/）

| 组件 | 文件 | 职责 |
|------|------|------|
| ChartDataController | `chart-data.controller.ts` | `POST /apps/:appId/datasets/chart-data` 端点，JwtAuthGuard |
| ChartDataService | `chart-data.service.ts` | 数据加载（object/dataset）+ 分组聚合，返回结构化结果 |

### 2.2 前端渲染器（packages/shared/src/stores/component-renderer.tsx）

| 函数 | 行号 | 职责 |
|------|------|------|
| renderDashboardGrid | L450 | 仪表盘网格容器，react-grid-layout 集成，编辑模式可拖拽 |
| renderChart | L857 | 图表渲染，调用 buildChartOption 构建 ECharts option |
| renderStatistic | L849 | 统计卡片（title/value/prefix/suffix） |

### 2.3 共享工具（packages/shared/src/page/）

| 文件 | 职责 |
|------|------|
| `chart-options.ts` | ECharts option 构建器：aggregate() 聚合 + buildChartOption() 按 chartType 生成 option |
| `index.ts` | ChartType / ChartAggregation 枚举 · ChartConfig / LayoutItem 接口 |

### 2.4 组件类型枚举

```
ComponentType.DashboardGrid = 'dashboard_grid'  // 仪表盘网格容器
ComponentType.Chart = 'chart'                    // 图表组件
ComponentType.Dashboard = 'dashboard'            // 仪表盘页面模板
```

---

## 3. 关键设计决策

### 3.1 双模式渲染（前端 + 后端聚合）

图表支持两种聚合路径：
- **前端聚合**（chart-options.ts `aggregate`）：编辑模式用 MOCK_DATA，预览模式从绑定数据提取 records 后内存聚合。限制：前端只有 100 行数据。
- **后端聚合**（ChartDataService）：全量数据加载 + 聚合，返回结构化结果。优势：支持大数据量，减少传输量。

两套聚合逻辑保持一致（相同的 sum/count/avg/max/min 实现）。

### 3.2 buildChartOption 统一 option 构建

`buildChartOption(chartType, title, categoryField, valueField, aggregation, data)` 是 Studio 预览和 Runtime 共用的 ECharts option 构建器。按 chartType 分支生成不同 series 配置：
- bar → `series.type: 'bar'` + xAxis/yAxis
- line → `series.type: 'line'` + smooth
- pie → `series.type: 'pie'` + radius 60%
- funnel → `series.type: 'funnel'`

### 3.3 react-grid-layout 集成

DashboardGrid 使用 `react-grid-layout` 的 `Responsive` 组件，12 列网格，rowHeight=30px，margin=[8,8]。编辑模式 `isDraggable + isResizable`，运行模式禁用。布局变更通过 `ctx.onLayoutChange` 回调持久化到组件节点 props.layout。

### 3.4 自动布局兜底

当组件节点没有 layout 配置时，自动生成默认布局：每 2 个子组件一行，宽度为 cols/2，高度为 8 行。

### 3.5 数据格式兼容

`extractRecords(data)` 兼容两种数据格式：原始数组 `[{...}]` 和包装格式 `{ records: [{...}] }`，与 RecordService 和 DatasetRowService 的返回格式对齐。

### 3.6 运营报表 — 前端直连后端聚合引擎（7.7 新增，2026-08-23）

**问题**：原架构中后端 `ChartDataService` 已完整实现聚合引擎，但前端从未调用它 — 图表在客户端对 ≤100 行数据聚合或显示 mock 数据，后端聚合引擎是死代码。

**解决方案**：

1. **`buildChartOptionFromAggregated(chartType, title, aggregated)`** — 新增函数，从后端返回的已聚合数据点直接构建 ECharts option，跳过客户端 `aggregate()` 步骤。保留原 `buildChartOption` 供编辑模式 mock 使用。

2. **`AggregationChart` 组件（runtime-ui）** — 替代原 `DatasetChart`。用 `useQuery` 调用 `datasetsApi.getChartData(appId, request)` 获取后端聚合结果，然后用 `buildChartOptionFromAggregated` 构建 ECharts option。同时支持 object 和 dataset 数据源。

3. **`MetricCard` 组件（runtime-ui）** — 新增。调用后端标量聚合 API（无 categoryField → 返回单值），渲染 AntD `<Statistic>`。通过 `renderStatisticWithAggregation` 覆盖注入：有 `aggregation` + `datasourceId` 时走 `MetricCard`，否则委托共享 `RENDERERS.statistic`（向后兼容静态值）。

4. **`appId` 传递** — runtime-ui `ComponentRenderer` 通过 `useParams` 从路由获取 `appId`，注入到 `runtime` 上下文，供图表/指标卡调用后端聚合 API。

5. **`StatisticPropsSection`（Studio PropertyPanel）** — 新增指标卡配置面板：标题 + 数值（静态）+ 前缀/后缀 + 聚合方式（可选）+ 数据源 + 值字段。有聚合配置时禁用静态数值输入。

6. **`timeGranularity` Select** — 图表属性面板新增时间分桶配置（day/week/month），可选。

### 3.7 后端聚合引擎增强（7.7 新增，2026-08-23）

`ChartDataService.aggregate()` 增强：

- **`categoryField` 可选** — 省略时所有记录归入单组 `_total`，返回标量值（指标卡用）
- **`timeGranularity` 时间分桶** — 当 categoryField 为日期字段时，按 day（YYYY-MM-DD）/ week（周一日期）/ month（YYYY-MM）分桶。`resolveCategory()` 解析日期值，`bucketTime()` 生成桶标签，`sortByTime()` 按时间升序排列（"未知"排最后）
- **`filter` 实现** — 用 `json-logic-js` 的 `apply(filter, record)` 对每条记录求值，仅聚合满足条件的记录
- **`count` 聚合不要求 `valueField`** — count 统计记录数，值设为 1
- **`take: 10000` 防御性上限** — `loadSourceData` 增加 take 限制，避免全表加载

### 3.8 仪表盘模板更新（7.7 新增，2026-08-23）

`generateDashboardSchema()` 从"1 statistic + 3 charts"升级为运营报表组合：
- 2 指标卡（记录总数 count + 数值汇总 sum）
- 1 趋势图（line + timeGranularity: 'day'）
- 1 柱状图（bar + count）
- 1 饼图（pie + count）

模板内 datasourceId 仍为空（用户配置后生效），与现有模式一致。

---

## 4. 简化项说明（偏离飞书）

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| 图表类型 | 10+ 种 | 4 种（bar/line/pie/funnel）| 覆盖 80% 场景，后续可扩展 |
| 仪表盘模板 | 预置模板 | ❌ 空白页搭建 | 模板引擎待后续 |
| 报表导出 | PDF/Excel | ❌ 不实现 | 优先核心图表能力 |
| 联动筛选 | 图表间联动 | ❌ 独立展示 | 单图表独立，联动待后续 |
| 自定义指标 | 公式引擎 | ❌ 5 种聚合 | 基础聚合够用 |
| 多系列图表 | 支持 | ❌ 单系列 | 多系列待后续扩展 |
| 时间粒度 | 更细粒度（时/分） | day/week/month | 覆盖常见趋势分析场景 |
| 管理后台运营报表 | 活跃用户/存储/流程监控 | ❌ 属 Phase 9.9 | 本次聚焦仪表盘 widget 层 |

> **验收状态**: ✅ 后端聚合 API 21 单元测试 + E2E 6 测试 + 前端 4 种图表渲染验证 + DashboardGrid 拖拽交互验证 + 指标卡/趋势图运行时验证全部通过
