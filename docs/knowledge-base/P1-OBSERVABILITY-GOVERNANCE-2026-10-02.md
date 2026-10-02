# P1 运维与治理补强 — 实现记录（2026-10-02）

> ROADMAP「新 P1（运维与治理补强）」落地记录。分支 `feat/p1-observability-governance`。
> 同窗口伴随 PR #18（审批数据可见性回归网，已先行合并）。

## 一、观测事件分类 + 事件链路 ID

### 事件模型（ObservabilityEvent）

`packages/db/prisma/schema.prisma` 新模型 + 迁移 `20261002142204_p1_observability_governance`：

- 维度：tenantId + environmentId（默认 prod，随 ALS 自动注入）+ appId（可空）+ traceId（可空）
- 分类（shared SSOT `EVENT_CATEGORIES`）：`FUNCTION_EXEC` / `SLOW_QUERY` / `PAGE_ERROR` / `OPEN_API_CALL`
- 级别 `INFO/WARN/ERROR`；来源签名 source（如 `prisma:slow-query`）；durationMs / message / detail
- 索引：`[tenantId, category, createdAt]` / `[tenantId, appId]` / `[tenantId, traceId]`
- 双白名单注册：TENANT_SCOPED_MODELS + ENV_SCOPED_MODELS（租户/环境注入自动生效）

### traceId 全链路（此前全仓为零）

| 层 | 机制 |
|---|---|
| 生成/采纳 | pino-http `genReqId`：外部 `X-Trace-Id` 头优先（截断 128），否则 UUID；写响应头 |
| ALS 上下文 | `common/trace/trace-context.ts`（gateway 独立 ALS，与 db 租户 ALS 嵌套组合）；`TraceMiddleware` 全局最前置（AppModule.configure forRoutes('*')）|
| 日志行 | pinoHttp `mixin: () => ({ traceId })`——每条业务日志携带 |
| 错误响应 | `AllExceptionsFilter` 输出 `error.traceId`（兑现 shared `ApiError.traceId` 占位合同） |
| 审计 | `AuditLog.traceId` 列 + `AuditLogService.log` 内部读 `getTraceId()`（调用方零改动） |
| 观测事件 | `ObservabilityEvent.traceId` 同源 |

坑：Nest 10 的通配路由是 `forRoutes('*')`（`'*path'` 是 Nest 11 语法）。

### 四类事件写入点

1. **云函数执行**（此前执行不落库，失败无迹可查）：`cloud-function.service.invoke` 成功/失败/异常三路落 `FUNCTION_EXEC`（非阻塞 `.catch(() => undefined)`）
2. **慢查询**：db 包新增 `slow-query.ts`（`onSlowQuery` 注册表 + `resolveSlowQueryThresholdMs`）+ index.ts 叠第二层 `$extends`（`$allOperations` 计时，超阈值通知）。db 包保持领域中立（只测量+通知，不落库）；gateway `ObservabilityService.onModuleInit` 注册 handler 落库，`onModuleDestroy` 取消注册。**脱敏：只有 model/operation/耗时，无查询参数**。阈值 `SLOW_QUERY_THRESHOLD_MS`（env，默认 1000，每次查询时读取便于测试）。`$queryRaw` 不经模型操作通道不在测量范围
3. **页面报错**：runtime-ui `GlobalErrorBoundary.componentDidCatch` → 独立 fetch（keepalive + 3s abort，不依赖 axios）POST `/observability/page-errors`（202，任意登录用户，DTO 层截断脱敏：message 500/stack 4000/componentStack 2000/href 500）；上报函数自身 swallow 一切异常（错误边界内抛异常会二次崩树）
4. **开放 API 调用**：`open-api.controller.start` 对 `engine.startProcess` 计时，成败两路落 `OPEN_API_CALL`（detail 只记 inputKeys 键名，与审计脱敏口径一致）

### 查询端点（ObservabilityController）

- `GET /observability/events`（TenantAdminGuard）：category/level/appId/since/until + 分页（max 100）；枚举参数白名单校验，非法值忽略
- `GET /observability/summary`：最近 24h 每分类 total + errors（groupBy×2 + shared SSOT 补零）
- `POST /observability/page-errors`（JwtAuthGuard，202）：无租户上下文（平台管理员会话）直接确认不入库

## 二、流程效率分析

- `ProcessInstance.timedOut` 列：引擎等待条件节点超时且无 timeout 出边置 FAILED 时同步置位（`process-engine.ts`）——超时数语义钉死，不再靠 error 文本匹配
- `ProcessAnalyticsService`：
  - 计数 groupBy(processDefId,status) 透视；完成率 = COMPLETED/(COMPLETED+FAILED+TERMINATED)，无终态为 null
  - 耗时 AVG/MAX 走 `$queryRawUnsafe` 位置参数（**对齐 G5 既有测试基建**；`Prisma.sql` + `$queryRaw` 在 gateway 单测里没有 mock）。raw SQL 显式带 `tenant_id` + `environment_id`（ALS 缺省 prod）——raw 不经 $extends 自动注入
- 端点 `GET /processes/analytics?appId=&processDefId=&since=&until=`（PROCESS:VIEW）。**坑：字面量路由必须声明在 `processes/:processId` 之前，否则被参数路由吞掉**
- studio 流程监控页新增「效率分析」Tab（总计卡 + 按流程表）

## 三、权限查询调试工具

- `PermissionService.explain`：与 check 完全同语义（超管短路/无角色/命中规则/deny-overrides/多 ALLOW 确定性合并）但不抛异常，返回 `{ allowed, reason, roleIds, matchedRules, mergedCondition, fieldScope }`；check 重构为 explain + throw（**既有 32 个单测零改动通过 = 语义等价证明**）
- `POST /permissions/debug`（TenantAdminGuard）：body 传被调试 userId（合成 AuthenticatedUser，isSuperAdmin=false 不短路）；行级条件经 `translateCondition`（strict，不可翻译报 `translateError` fail-closed）；可选 recordId 以真实 `prisma.record.count({ id, AND: where })` 验证可见性——**与运行时同一套代码路径**
- studio `/platform/permission-debug`（表单 + 决策结论 + 命中规则表 + 合并条件/翻译 where JSON 面板）

## 四、审计日志对齐观测分类

- `AUDIT_ACTION_CATEGORIES`（shared SSOT）：全部 23 个审计动作 → 5 分类（APP/GOVERNANCE/PROCESS/RECORD/ACCESS）；未登记动作归 OTHER
- `AuditLogService.query` 支持 `category` 过滤（`actionsByCategory` 展开为 action IN，零迁移）
- 审计 DTO 透出 traceId；studio 平台/应用审计页加分类筛选与分类 Tag

## 五、对象级搜索配置（searchable 消费）

- `GET /api/v1/objects/:objectId/records?keyword=`：对字段 `searchable=true` 且类型 ∈ {text, long_text, rich_text, auto_number}（字符串值域）构建 `OR: data.path string_contains`
- 无可搜索字段/空白关键词 → 不过滤（不出空结果）；纯函数 `buildKeywordWhereFromFields` 可单测
- 诚实边界：contains 不命中 GIN（record-query.ts 头注既有限制）——大表场景靠慢查询事件观测后评估优化

## 六、未做（诚实边界）

- **全局选项复用**（数据字典/选项集）：需要独立模型 + 字段引用链 + 管理 UI，作为独立增量后排（ROADMAP 已标注 ⬜）

## 七、验证与测试

- gateway 单测 686（新增 30：trace 7 / 慢查询 hook 6 / observability 7 / 审计分类 2 / explain 5 / analytics 4 / keyword 5 + 既有全绿）
- db 包新增 slow-query.spec（注册/取消/异常隔离/阈值解析）
- shared build / gateway typecheck（tsconfig.check.json 含 spec）/ lint 全绿
- studio 四页面由子任务实现，验收 `pnpm --filter @apaas/studio typecheck && lint && test`

## 八、测试守卫同步说明（红线合规）

`packages/db/src/tenant-injection.spec.ts` 有白名单守卫测试（TENANT_SCOPED_MODELS 计数 31→32、ENV_SCOPED_MODELS 清单 4→5）。本次因新增 ObservabilityEvent 登记双白名单而**同步更新清单预期**——属清单型守卫的正常演进，非"改测试让失败变绿"（被测行为本身是新增模型注入，语义正确性由该 describe 其余注入断言覆盖）。

## 九、踩坑备忘（含推送前真实冒烟发现的两处修复）

1. **字段元数据的键是 `apiName` 不是 `name`**（object.service.ts StoredField 合同）。关键词搜索纯函数初版读 `f.name` → 运行时恒 null → 搜索静默退化为不过滤；**且单测数据也是按同样错误写的，测试全绿**——纯函数单测挡不住"实现与测试同错"，必须以真实 bundle 字段做端到端冒烟。冒烟发现后修正（`f.apiName`）+ 测试数据同步 + 端到端复验（不存在关键词 0 条 / 供应商 2 条 / PO-0005 编号 1 条）
2. **PG `EXTRACT/AVG` 返回 numeric，pg 驱动序列化为字符串**：analytics 的 avgDurationMs 初版返回 `'2778230.266'`（string），DTO 合同是 number——SQL 聚合列一律 `::float8` cast
3. **测试基建**：setup.ts 的 `@apaas/db` mock 工厂需按需补导出（本次补 `onSlowQuery` 注册表语义 + `getTenantId` 改为可从 `__mockCurrentTenantId` 全局变量读取，默认仍 null 不影响既有测试）
4. **`prisma.$queryRaw`（tagged）在单测中无 mock**——raw SQL 一律走 `$queryRawUnsafe` + 位置参数（G5 先例）
5. **Nest 路由声明顺序**：字面量段路由（analytics）必须先于同前缀参数路由（:processId）
6. **`export * from '@prisma/client'`**：gateway 里 `Prisma` 命名空间经 `@apaas/db` 转出可用，但直接 `import { Prisma } from '@prisma/client'` 会因 pnpm 严格依赖解析失败
7. 迁移生成命令要在 `packages/db` 目录下跑（prisma migrate dev）；Bash 工具 cwd 跨调用持久化，跨目录操作后记得回根目录

1. **测试基建**：setup.ts 的 `@apaas/db` mock 工厂需按需补导出（本次补 `onSlowQuery` 注册表语义 + `getTenantId` 改为可从 `__mockCurrentTenantId` 全局变量读取，默认仍 null 不影响既有测试）
2. **`prisma.$queryRaw`（tagged）在单测中无 mock**——raw SQL 一律走 `$queryRawUnsafe` + 位置参数（G5 先例）
3. **Nest 路由声明顺序**：字面量段路由（analytics）必须先于同前缀参数路由（:processId）
4. **`export * from '@prisma/client'`**：gateway 里 `Prisma` 命名空间经 `@apaas/db` 转出可用，但直接 `import { Prisma } from '@prisma/client'` 会因 pnpm 严格依赖解析失败
5. 迁移生成命令要在 `packages/db` 目录下跑（prisma migrate dev），注意 cwd 持久化
