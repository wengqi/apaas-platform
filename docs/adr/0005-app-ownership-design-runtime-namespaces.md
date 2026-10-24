# ADR-0005: 应用所有权与协作成员模型 + API design/runtime 双命名空间

- 状态：已接受
- 日期：2026-10-19
- 关联：ADR-0002（企业内部真实使用 / 先开发者后业务）、ADR-0004（AI 是开发者的交付工具，外部 agent 经 MCP）、`docs/testing/TEST-CASES.md` N/O 节（2026-10-18 用户域分离与超管收敛裁决语境）

## 背景

2026-10-18「顶栏导航持久化 + 权限模型收敛」轮落地了 END_USER 只属 runtime、超管=平台控制台两项收敛后，遗留一项产品议题：**应用维度没有"创建者所有权"概念**。实证（demo 租户）：

- `GET /apps` 设计面列表仅 `where: { tenantId }`——BUILDER 在 studio 开发中心看到租户内全部 25 个应用（admin 创建 15 + builder 创建 10，含他人 8 个 DRAFT）；
- 写闸在角色规则：BUILDER 的 `PAGE:MANAGE` 为租户通配（`targetId='*'`），对他人创建的应用同样可编辑/删除/归档，仅靠确认弹窗与审计兜底；
- 这是租户协作面的既有设计而非 bug，但用户质疑该边界，本专题定位为**产品语义裁决 + 落地**。

探讨中暴露第二个结构性问题：拟议的"所有权闸"没有可挂载的位置——

- 搭建期写操作绝大多数是**资源 ID 直达路由**（`PUT pages/:pageId`、`PUT objects/:objectId`、`POST processes/:processId/publish`…），不带应用前缀；现有 `PermissionGuard` 纯路由参数驱动，不做"资源 → 所属应用"反查；
- 运行时（runtime-ui / embed）与 studio **共用** `GET /apps/:id`、`GET /apps/:id/pages`、`GET /apps/:id/processes`、`POST /apps/:id/datasets/chart-data` 四个端点，仅 `GET /apps?runtime=1` 以 query 开关区分视图；
- 全仓库 `@Query` 中 `runtime` 是唯一的模式开关（其余为 sort/filter/keyword/CAS 回调等正当参数）——用户裁定该形态不专业，不得在页面路径与 API 地址中出现。

## 决策

### 一、所有权与协作成员模型

1. **单表归属** `application_members(tenant_id, app_id, user_id, role: OWNER|MEMBER, added_by)`：`@@unique([appId, userId])`，OWNER 以 partial unique `(app_id) WHERE role='OWNER'` 保证唯一；`tenantId` 索引、级联删除、Tenant/Application/User 反向关系齐备。`Application.createdBy` **保留为历史创建人**（审计语义），不再承担归属。
2. **两档角色**：MEMBER 拥有全部搭建能力（对象/页面/流程/数据集/连接器/云函数/权限规则/环境/API 密钥/嵌入读写、发布/回滚、审 AI 草稿）；**仅 OWNER 可**删除、归档、转移所有权、增删成员。TENANT_ADMIN / 平台超管恒等同 OWNER 且不需成员行。不设 VIEWER 只读档（只读需三个编辑器做只读模式，代价不成比例）。
3. **可见集** = 成员行（OWNER ∪ MEMBER）∪ 管理员短路。设计面列表、深链、全部设计面操作同一语义。
4. **写闸双层**：角色规则（粗粒度能力，`PAGE:MANAGE` 等保留不动）∩ 成员关系（细粒度应用域），两层都过才放行。
5. **转移所有权**：OWNER 或 TENANT_ADMIN 可转给任一 `hasStudioAccess` 为真的用户（BUILDER/TENANT_ADMIN）；原 OWNER 自动降为 MEMBER；owner 离职由 admin 手工转移，不做自动继承。成员候选集 = BUILDER 角色用户（与 studio 闸同源，防"加了却进不来"）；因 builder 无用户列表读权，新增 `GET /design/apps/:appId/members/candidates`。
6. **AI 归属 = MCP token 持有人**（`mcp.service` 以调用者用户 ID 作 `createdBy`，零改动）；MCP 不提供成员管理工具；所有 MCP 读写走与 HTTP 相同的 `AppAccessService` 断言。
7. **存量迁移**：迁移 SQL 按 `created_by` 为每个存量应用回填一行 OWNER；`create()` 事务内自动写 OWNER 行；seed 幂等同步，并把 builder 加为 `procurement` 的 MEMBER 作协作态常驻夹具。
8. **运行时不受影响**：业务用户能用哪些应用由角色权限决定（`listVisibleForUser` 归纳），与谁创建无关。

### 二、API 双命名空间：`/design` 设计面 vs 无前缀运行面

9. **设计面** `/api/v1/design/apps/:appId/**`：应用级设计面全量（约 80 条：应用 CRUD/发布/版本/分组、页面、对象(字段/视图)、流程、数据集、审核、环境、API 密钥、嵌入、连接器、云函数、流程 API 发布、成员）迁入并**全部嵌套在应用之下**（`/design/apps/:appId/objects/:objectId/fields/:fieldId` 三级嵌套接受）。服务层查询同步补 `appId` 域（`findFirst({ id, tenantId })` → `{ id, tenantId, appId }`），副产品：封掉跨应用 IDOR 一类，且不再需要资源反查表。守卫以控制器级 `@UseGuards(PermissionGuard, DesignAccessGuard)` 挂在全部 `design/apps` 前缀控制器上，顺序 PermissionGuard（认证 + 角色规则，复用既有 JwtAuthGuard 继承链）→ DesignAccessGuard（`hasStudioAccess` 纵深 + 归属断言，角色写入 `request.appAccessRole`）；两层都过才放行。静态锚定测试 `design-routes-guarded.spec.ts` 扫描源码保证：每个 `design/apps` 控制器都挂两守卫、运行面控制器不挂归属守卫、不在非 design 前缀控制器里声明 `design/` 方法级路由。
10. **运行面**（无前缀）：角色规则 + 已发布语义。三处清理：① `?runtime=1` 删除，`GET /apps` = 运行时视图（已发布 + 权限归纳）；② `pages/runtime/:pageId` → `pages/:pageId`，只回已发布、无 bundle → 404（杀降级活表）；③ `GET /apps/:appId`、`/pages`、`/processes` 服务端只回已发布项。其余运行面路由形态不动（`pages/slug/:slug`、`chart-data`、`datasets/:id[/rows]`、`objects/:id/records`、`records/:id`、`processes/:id/start`、`instances/*`、`tasks/*`、`*/invoke`、`/open/*`、`notifications/*`）。前端页面路由（runtime `/app/:id`、embed `/embed/app/:id/p/:slug`、studio `/app/:id/*`）本就无开关，不动。
11. **路径即分类**：设计面与运行面的区分由路径承担，不再依赖装饰器归类、路由白名单守卫测试或调用者身份推断。
12. **错误语义**：运行面对未发布/无权限应用的读 → 404（运行时视角应用尚不存在）；设计面非成员 → 403（前端 403 页，不透露所有者）。
13. **零兼容**：未上线零历史包袱（2026-10-02 原则），旧路径不保留、不设过渡期；studio api 层、runtime-ui api 层、e2e、MCP 文档在同一分支内全部切换。

### 三、交付

14. 短命分支 `feat/app-ownership-design-runtime-split`（AGENTS 允许的大型重构例外），三段：① 路由命名空间迁移（行为保持，仅拔 `?runtime=1`，按资源族原子提交）→ 全量 e2e 回归证"纯搬家零语义漂移"；② `AppAccessService` + `/design` 成员守卫 + MCP 接线（TDD）；③ 成员表/迁移/种子/成员页/卡片标记/403 页。

## 被否方案

- **仅自己创建（无成员表）**：零迁移最小修，但与协作面定位冲突，日后加协作要改语义入口——以"可见集 = 自己创建 ∪ 协作集"形态被 (b) 吸收。
- **全量可见、写按所有权**：列表维持租户全量、他人应用只读——需要对象编辑器 / amis 设计器 / flowgram 画布三个编辑器做非成员只读模式，且开发中心继续被他人 DRAFT 刷屏。
- **共用读端点按调用者身份双语义**：零 runtime-ui 改动，但在仓库里引入第二套分流范式与 `?runtime=1` 并存，语义隐式。
- **`?runtime=1` 扩展到另外三个共用端点**：与先例同机制但保留了模式开关本身——用户裁定不接受。
- **默认搭建 + `@RuntimeRoute()` 白名单 + 全路由归类守卫测试**：被"路径即分类"整体替代。

## 后果

- 正面：应用从"租户内人人可写"变为对标飞书 aPaaS 的"所有者 / 开发者"归属语义；API 面消除唯一的模式开关；设计面 URL 全部 app-scoped，跨应用 IDOR 在查询层封死；守卫一处挂载、零反查表；运行时页签不再出现发布后新建的草稿页（③ 副产品）。
- 代价：gateway 约 80 条路由迁移 + 服务层签名加 `appId`；studio api 层约 100–150 处调用点、组件层约 60 处传参；e2e 166 处 `/apps/` 引用按设计/运行上下文逐条改写；成员页新 UI 面；新表与迁移。
- 明确不做：VIEWER 只读角色；多 OWNER；所有权自动继承；AI 侧成员管理工具；运行面路由形态的其他变更。

## 勘误（2026-10-23，对抗审查 P0-9 落地时补）

决策 10 的「其余运行面路由形态不动」指**路由形态**（URL 结构不迁移），不是运行时**语义豁免**。
对抗审查第一轮 devil-01 实证：chart-data 与 objects/records 族对 DRAFT/未发布应用照常供数，
与本 ADR 决策 12 的「运行面对未发布应用读 → 404」构成双面语义矛盾——他人应用边界在数据层只关了一半。

落地（DataAppAccessGuard，挂 record / chart-data 控制器）：数据端点放行 =
设计面可访问（admin/owner/member，保 studio 对 DRAFT 应用的搭建期预览）
OR 运行面可见（已发布 + 角色权限归纳，保 END_USER 消费已发布应用数据）；
两者皆否 → 404「应用不存在」。读写两侧同门。运行面页面三读端点同步补
`assertRuntimeVisible` 可见闸（对抗审查 security-01/R1：曾仅认证不授权）。
