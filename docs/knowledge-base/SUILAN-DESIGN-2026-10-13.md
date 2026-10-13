# 素蓝设计轮实现记录（2026-10-13）

> 本轮以 `$impeccable` 驱动，从"平台整体 UI 体验优化"出发，经用户四轮方向裁决收敛为
> **「素蓝」（Quiet Blue）**视觉世界并完成双端落地。设计定稿与实现记录同档。

## 一、定稿结论（用户逐项确认）

| 决策点 | 定稿 | 备选/否决 |
|---|---|---|
| 视觉世界 | **素蓝**：唯一蓝 #2563EB、冷蓝灰墨阶、白表面+发丝线、无渐变无彩晕 | 第一轮"静默专业"（用户不满意）、运行图时刻表、账簿印信、企业套件、日式高密度等（全部否决） |
| Logo | **方孔 a**（E 案）：蓝底白色单层 a，字腔为方块 | 2×2 拼合、积木 a（读作 d）、字标+方点、相生叠块、现状闪电 |
| studio 首页 | **开发中心**（v8）：问候+搜索→待办条→指标行→应用库（分组平铺）→最近动态 + 右侧分组定位轨 | 时刻表、企业套件、静默专业、日式文具、Carbon、瑞士排版、高密度、分节无轨版、侧栏轨、芯片行、目录树（树/芯片转备选） |
| runtime 首页 | **门户 v3**：与构建态同语言；分组只读分节 + 只读定位轨 + 版本·维护者卡片 | 无定位轨版（用户质询后补齐） |
| 登录页 | **浅色分屏融合版**（10-L4/10-R4）：左淡蓝灰品牌栏+右白表单 | 深色分屏正装、沉浸式深蓝全屏、浅色极简居中 |
| 顶栏命名 | studio「我的应用」→「**开发中心**」；runtime 保留「我的应用」 | — |

设计档案：`DESIGN.md`（根，token+规范）、`.impeccable/design.json`（sidecar）、
`PRODUCT.md`（产品真值）、`pages/app-home/` 草图与决策页存档（`.impeccable/mocks/decision/`）。

## 二、实现清单

### 数据与 API（apps/gateway + db + shared）
- `applications.group` 列（迁移 20261012165231_app_group_field，≤20 字符自由文本，空=未分组）。
- `CreateAppRequest/UpdateAppRequest/AppSummary` 加 `group`；`AppSummary` 加 `ownerName`（runtime 视图返回创建人姓名）。
- `CreateAppDto/UpdateAppDto` 加 `group`（MaxLength 20）；新增 `UpdateAppGroupDto`。
- **PATCH /api/apps/groups**（from→to 重命名；to 空=删组移入未分组）——分组无独立实体，管理即批量改写。
- **GET /api/apps/reviews/pending-summary**——租户级 PENDING 按应用聚合+最近单据摘要（开发中心待办条/指标行数据源）。
- seed：两个应用 create 带 group + §11.5 幂等回填块（按 apiName 归组 8 条）。

### shared（@apaas/shared/design 重写）
- TOKENS 素蓝化（冷蓝灰墨阶/发丝线三档/画布 #F5F7FA/侧栏转白）+ `colorDotIdle/colorWarningDeep/colorNavy` 等新槽。
- **ANT_D_THEME** 导出（遗留步骤 4）：ConfigProvider theme 由 TOKENS 派生（borderRadius 9 / controlHeight 36 / wireframe false），双端 main.tsx 接线——AntD 全组件随主题换肤。
- **brandLogoMarkSvg / brandLogoMonoSvg / brandLogoMarkSvgLight**：方孔 a 三变体（非字体渲染，16px favicon 稳定）。
- `appTileBackground` 改实底素蓝、`appTileShadow` 改 'none'；`LOGIN_PANEL_*` 登录分屏常量。
- favicon 双端替换为方孔 a（内联 SVG data URI）。

### studio
- **登录页**重写为融合分屏（品牌栏 46% + 表单 54%；<960px 隐藏品牌栏）。
- **AppHeader** 重写为顶栏导航：开发中心恒显；用户管理/组织架构/审计日志/观测中心/权限调试按管理员角色；租户管理仅超管——原「平台管理」下拉退役。
- **AppList.tsx 删除**，新 `pages/app-home/DevCenterHome.tsx`（399 行）+ 拆件：
  `home-bits.tsx`（待办条/指标行/动态/时间工具）、`useAppCrud.ts`（CRUD mutations）、
  `GroupLocatorRail.tsx`（scrollspy 定位轨）、`GroupsDrawer.tsx`（重命名/删空组）、
  `GroupSelect.tsx`（AutoComplete 选组+输新名建组）。
- **AppCard** 重写：横排头（字母瓷片+名称+apiName+⋯）+ 描述两行钳制 + 元数据行（状态点/版本/资源统计）钉底。
- 建应用/编辑弹窗：图标/主题色字段退役（统一瓷片后不生效的死配置），新增分组字段（AutoComplete 自由输入建组）；名称 maxLength 30。
- **StudioLayout**：侧栏 150→168/收起 56；画布页（页面搭建器/流程编辑器）**自动收起侧栏**、离开恢复；头部应用瓷片改单字素蓝；去投影。
- AppDashboard 瓷片同款单字化。

### runtime-ui
- **登录页**重写（同壳业务文案：租户必填、无 SSO、企业管管理员出口）。
- **Home** 重写：问候+搜索→审批待办条（GET /tasks PENDING 真数据）→指标行（待我审批/本月已办结）→分组只读分节→只读定位轨（分组≥2 才出现）。
- **AppView** 头部去工程化：去 版本 Tag/对象页面流程计数/已发布标签，瓷片单字化。
- RuntimeLayout 品牌位（方孔a + wordmark）。
- 存量描述清洗：expense_mgmt/sales_order_app/procurement_analysis_app 三条"R5/AI 主线实测"行话描述改业务文案（DB 直改）。

## 三、v1 有意裁剪（诚实清单）

1. **分组拖拽排序未做**：排序需独立排序存储（分组无实体）；v1 组序=名称字典序、未分组恒最后。抽屉提供重命名/删空组。
2. **卡片个性化徽标（经常使用/进行中）未做**：需行为数据（使用频次/按应用聚合实例），无现成端点。
3. **"我发起的·进行中"KPI 未做**：无按发起人查实例的端点（triggerContext JSON 扫描代价高）；指标行两项（待我审批/本月已办结）为真实口径。
4. **最近动态仅管理员可见**：全租户审计挂 TenantAdminGuard（安全边界合理）；builder 不发 403 请求、区块静默隐藏。builder 可读的搭建动态源登记为后续项。
5. **登录页 SSO 按钮未放**：identity 层有 CAS Provider 但网关未暴露登录端点——不做死按钮。
6. **暗色模式未做**：ANT_D_THEME 地基已铺（token 单源），暗色另立轮次。

## 四、验证记录

- gateway `tsc.check` 0 错；vitest 58 文件 808 测全绿（application 35/review 增量含内）。
- studio/runtime-ui：tsc 0 错、eslint 0 warning、单测 175/27 全绿；`check-design-tokens.sh` 零 hex。
- impeccable detector：双端 src 零发现。
- 构建后实测（截图对照草图）：studio 登录/开发中心（builder+admin 双视角、待办条真数据、KPI 真数据、定位轨 scrollspy）、runtime 登录/门户（分组定位轨、版本·维护者卡片）、应用壳（168px/分组/单字瓷片）。
- 现库效果：8 个业务应用归 4 组；runtime 8 卡全部带 group+ownerName。

## 五、遗留（下轮候选）

- 分组排序存储（独立实体后可拖拽）。
- runtime 徽标数据源（使用频次统计）。
- 我发起的实例端点（GET /instances/mine?startedBy=）。
- builder 可读搭建动态源（变更日志跨应用聚合）。
- CAS 登录端点暴露后登录页接 SSO 按钮。
- 暗色模式（ANT_D_THEME 反相槽位）。
