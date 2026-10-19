# 应用归属与 design/runtime 双命名空间实现记录（2026-10-19）

> 对应 ADR：`docs/adr/0005-app-ownership-design-runtime-namespaces.md`（裁决记录与被否方案在彼）。
> 用例：TEST-CASES TC-196~199；分支 `feat/app-ownership-design-runtime-split`。
> 本文只写实现事实、裁决后的修正与踩坑，不复述裁决。

## 一、落地结构（按提交序）

| 提交 | 内容 |
|---|---|
| e43a4ad | ①a 应用族：`/design/apps` 设计面控制器 + 运行面 `GET /apps` 拔 `?runtime=1` + `getVisibleForUser`（未发布/无权限 404）；ADR-0005 落档 |
| 3df45e3 | ①b 页面族：设计面嵌套 `/design/apps/:appId/pages/**`；运行面 list 改读已发布 bundle（`listRuntime`，草稿页不再进页签）；`pages/runtime/:pid` → `pages/:pid`；删零调用的 `getBySlug` 活表读 |
| fda215c | ①c 对象族：三级嵌套（app→object→view/field），`requireObject`/`requireView` 逐级断言 |
| f44154d | ①d 流程族：设计面 CRUD/发布/实例监控/通知模版嵌套；运行面 `GET /apps/:id/processes` 改 `listPublishedProcesses`（活表 PUBLISHED，I-1 流程级发布语义）；`processes/analytics` 定性为租户级治理读留运行面 |
| 945bc8d | ①e 数据集拆分（设计面列表/删除/刷新 vs 运行面 `datasets/:id[/rows]`）、连接器拆分（CRUD+test vs `:id/invoke`）、凭证/云函数同理；reviews/environments/service-identities/process-api-releases 四控制器整前缀切 `/design/apps` |
| c62fc72 | ① 全量 e2e 回归补漏（见踩坑 2/3/4） |
| e495848 | ② `application_members` 表 + 迁移（partial unique OWNER + created_by 回填）+ `AppAccessService`/`DesignAccessGuard`（TDD）+ 13 设计面控制器挂守卫 + 设计面列表按可见集/详情带 myRole + MCP 同源断言 |
| 170bf41 | ③a 成员 API：清单/候选/增删/转移所有权 + 审计动作三枚举 |
| a03b1ff | ③b studio：成员页（治理组）/卡片「由 X 共享」/深链 403 页/卡片菜单按 myRole 门控 |
| d392365 | ③c e2e/25-app-ownership 8 例 |

## 二、相对探讨稿的两处修正（诚实记录）

1. **「闸盖 `/apps/:appId/**` 前缀」的原始提法不成立**。路由清点发现搭建期写操作绝大多数是
   资源 ID 直达路由（`PUT pages/:pageId` 等），前缀闸覆盖不到；现有 PermissionGuard 纯路由
   参数驱动、无资源→应用反查。最终解法是 ① 段的**全量嵌套**（`/design/apps/:appId/**`，
   服务层 where 补 appId 域）——守卫统一读 `params.appId`，反查表不再需要，顺带封跨应用 IDOR。
2. **`getRuntimeById`「降级活表」是注释失实**。探讨时我据 `page.controller.ts` 旧注释报告
   "bundle 缺失回落活表"为存量缺口；实读代码该行为 404 无兜底（`page.service.ts:263-266`）。
   ①b 已修正注释，未改行为。**教训：报告缺口以当前代码为准，注释会撒谎。**
3. **Q2「runtime 不动」从零代码改动修正为零语义改动**：双命名空间要求 runtime-ui 4 处调用点
   机械更新（去 `?runtime=1`、`pages/runtime/` 更名），业务用户语义不变——已在裁决时明示并经用户确认。

## 三、设计要点（实现层）

- **归属单表**：`application_members(tenant_id, app_id, user_id, role, added_by)`，
  `@@unique([appId,userId])` + partial unique `(app_id) WHERE role='OWNER'`（先例
  20260926190000）。`Application.createdBy` 保留为历史创建人（审计语义），归属以成员表为准。
- **判定单一源**：`AppAccessService`（resolveDesignRole / assertDesignAccess / assertOwnerAccess /
  visibleAppIds / membershipRoles / grantOwner）。HTTP 走 `DesignAccessGuard`
  （`@UseGuards(PermissionGuard, DesignAccessGuard)`），MCP 不经控制器——`dispatch` 对**凡带
  appId 的工具**统一先 `assertAppAccess`，两入口同一判定。
- **守卫顺序**：PermissionGuard（认证+角色规则）在前、归属在后（ADR 决策 9 已按实际实现修正
  表述）。`request.appAccessRole` 注入后控制器做所有者级二次判定（删除/归档/转移/成员管理）。
- **静态锚定**：`design-routes-guarded.spec.ts` 扫描源码保证——①每个 `design/apps` 前缀控制器
  都挂两守卫；②运行面控制器不挂归属守卫；③不允许在非 design 前缀控制器里用方法级路径声明
  `design/` 路由。新增设计面控制器漏挂守卫在单测层即红。
- **可见集渗出的三处租户级聚合**：`PATCH /design/apps/groups`（分组改写只动自己可见集）、
  `GET /design/apps/reviews/pending-summary`（治理待办条按可见集）、MCP `get_platform_overview`
  （只列归属应用）——不收口会出现"看得见批不了/改了别人的分组"。
- **运行面三清理**：`GET /apps`=运行时视图（已发布+权限归纳，原 `?runtime=1` 语义）；运行面
  页面列表改读**已部署 bundle**（发布后新建的草稿页不再出现在业务页签——原为活表全量+客户端
  过滤不一致）；运行面对 DRAFT 应用详情 404（不区分"存在但无权"）。

## 四、踩坑（本轮实锤）

1. **e2e 批量替换波及 open API 路径**：`/open/apps/:id/processes` 这类开放端点在测试里以
   helper 前缀 `/open` + 路径参数形态出现，模板字面量批量替换把它改成了 `/open/design/apps/...`。
   修正后以 `openCall(` 全量 grep 复核零残留。**教训：对路径做批量替换必须先枚举"同形不同义"
   的调用方（open API/运行面/设计面）。**
2. **变量名假设破裂**：批量注入 `${appId}` 假设各 spec 都有 `appId` 变量，e2e/16 用的是
   `procApp` → ReferenceError。修法=补模块级 `appId` 并在 beforeAll 赋值。
3. **原生 fetch 拼接路径漏改**：`` `${API_BASE}/apps/...` `` 与 `'/apps/' + appId + '/...'`
   两种非标准模板字面量形态各漏一批（environments/dev/publish、pages/:id、cloud-functions）。
   全量 e2e 首轮 9 败全部归因后补齐。
4. **Playwright 失败后重启 worker 丢共享模块状态**：e2e/11 前一用例失败导致后一用例的模块级
   `appId` 归零，失败级联出"两处不同根因"的假象。
5. **perl 替换里的数组插值**：替换文本含 `user@apaas.dev` 时 `@apaas` 被 perl 当数组插值吃掉
   （写入 `user.dev`）。含 `@` 的替换文本用单引号 heredoc 或 `\@`。
6. **服务端返回 `{items}` 包装 vs 前端当数组**：成员清单/候选集两处 e2e 夹具按裸数组断言，
   `find is not a function`——与 D-011 同族的响应形状直觉错误，api 层类型应随响应包装。

## 五、验证快照（2026-10-19，本地）

- 根 typecheck 11/11；根单测 11/11（gateway 903 / studio 182 / runtime-ui 32 / shared 44 / db 55）
- 全量 e2e 99 例：95 过 + e2e/22 本地既知假警（夹具被人工标 is_internal，CI 新库过）+ 25 号
  两处夹具形状修正后 8/8
- seed 幂等复跑通过：本地 32 应用 OWNER 32 行（admin 22 / builder 10）+ builder→procurement MEMBER
- 待办：四身份 GUI 走查截图、OCR 评审、pre-push 四闸（见分支推送流程）
