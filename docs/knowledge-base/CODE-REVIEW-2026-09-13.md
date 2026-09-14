# 专业代码审查报告 — 2026-09-13

> 审查范围：`apps/gateway`（NestJS 后端 29 服务/20 控制器/20 DTO）+ `packages/db`（Prisma schema）+ `packages/shared`（渲染核心/动作系统）+ `packages/studio` + `packages/runtime-ui`
> 审查方式：三路并行深度审查（后端架构与缺陷 / 前端与渲染核心 / 功能完成度与飞书对齐复核）
> 与 2026-08-23 审查的关系：本次首要任务为**验证 08-23 八项 HIGH 修复的真实落地质量**，其次挖掘新问题
> 整改状态：E2E 执行过程中发现的 1 个 P0 产品回归已当场修复（见测试质量报告）；其余缺陷见修复优先级清单

---

## 一、08-23 修复验证结论：8 项 HIGH 修复全部真实落地，质量良好

| 修复项 | 验证结果 | 备注 |
|---|---|---|
| S1 ABAC 写操作执行 | ✅ | buildConditionWhere 注入 query/get/update/delete/batchDelete/batchUpdate 全路径，controller 全部传 permissionContext；**残留缺口：create/batchCreate/CSV 导入未接 fieldScope（新发现 B1）** |
| S2 凭证/云函数授权 | ✅ | PermissionGuard + CONNECTOR 装饰器覆盖全部 11 条路由；云函数控制器用 `tenantId!` 而非 requireTenantId（nit） |
| S3 delegateTask 校验 | ✅ | assertTaskMembership 复用 + 被转办人租户校验；**残留：状态更新与新任务创建无事务** |
| B1 实例级锁 | ✅（有缺陷） | withInstanceLock 四处包裹、尾部清理正确；**新发现 B2：completeTask 在锁外读取实例快照** |
| B2 审批原子认领 | ✅ | updateMany({where:{id,status:'PENDING'}}) + count===0 拒绝 |
| B3 循环预算 | ✅ | MAX_NODE_EXECUTIONS=1000 + 历史计数检查 |
| B4 WAITING 跳过 | ✅ | findMany 查询 WAITING 令牌 + resumeDelayedNode 令牌活跃校验 |
| B5 条件边求值 | ✅ | resolveEdgeTargets JsonLogic 求值接入三处 |
| 异常过滤器顺序 | ✅ | Prisma filter 先注册、直接写响应；**nit：default→500 分支不记日志** |
| auto-number 计数器 | ✅ | (objectId,prefix) 复合唯一 + 原子 increment；**nit：无 FK 清理、失败创建产生序号空洞** |
| 前端 F1/F2/F3 | ✅ | PageLoadEffect ref 防重入 + ctx useMemo（Studio 预览切换经 key 重挂载安全）；NodeErrorBoundary 覆盖自定义渲染器路径；DOMPurify 正确；**新发现：runtime-ui 页面间导航无 key 重挂载 → onLoad 不触发（F-B1）** |

## 二、新发现缺陷（按严重度）

### P0 — 阻断级（1 个，已当场修复 ✅）

**P0-1 记录创建/更新 API 对所有字段数据返回 400（产品级回归）**
全局 ValidationPipe（whitelist+forbidNonWhitelisted）对 `RecordCreateDto`（无装饰属性 + index signature）校验时，任何动态字段均被判为非白名单 → 400 "property X should not exist"。自 08-23 DTO 规范化改造起，**运行时及 API 的记录创建全部失败**（种子数据走 prisma 直写所以未暴露）。
**已修复**：create/update 参数类型改为 `Record<string, unknown>`（Object metatype 跳过全局校验），Swagger 文档经 @ApiBody 保留（record.controller.ts）。

### P0 — 安全（1 个，已修复 ✅ commit 8d17465）

**P0-2 chart-data 聚合端点完全绕过 RBAC/ABAC（任意记录读取）**
`chart-data.controller.ts` 仅 JwtAuthGuard：无 PermissionGuard、无 @RequirePermission、appId 参数被忽略（`_appId`）。`loadSourceData` 按 `{tenantId, objectId}` 直查且**不注入行级条件**，随后对调用方提供的**任意 JsonLogic filter 在内存中求值**。利用方式：END_USER 持"仅本人记录"规则，POST `{"==":[{"var":"id"},"<recordId>"]}` 过滤到单条 → avg 即该记录任意字段值。**ABAC 体系被整个旁路**。
**已修复（三层防御）**：① 数据源归属校验（对象/数据集必须属于 appId）② ABAC 行级条件注入 findMany（调用方 filter 只能收窄）③ fieldScope 列级校验（分类/值字段须在白名单内）；控制器接入 PermissionGuard + RECORD:VIEW。配套 6 项安全单测（21→27），355 单测 + 48 E2E 全绿。

### P1 — 严重（后端 9 个）

| # | 缺陷 | 位置 |
|---|---|---|
| B1 | fieldScope 未在 CREATE 路径执行（create/batchCreate/CSV 导入可写范围外字段） | record.service.ts:208-233, record-import-export.service.ts:178 |
| B2 | completeTask 在锁外读取实例快照再于锁内写回 → 同实例并行任务双审批丢令牌 | process-engine.ts:392-396 vs 424,457-475 |
| B3 | 定时触发器仅启动时注册：运行期发布的 SCHEDULED 流程永不执行；下线后僵尸 job 每次报错；removeRepeatableByKey 传 jobId 而非 repeatJobKey 清理无效 | trigger.service.ts:46-112 |
| B4 | 任务 decision 自由字符串，未知值（如拼写错误）被当作"继续流程"推进且置 DELEGATED | task.dto.ts:12, process-engine.ts:398-402 |
| B5 | **ABAC 条件翻译器 fail-open**：不支持的操作符返回 null=无条件 → 持该规则用户获得全表访问；权限翻译必须 fail-closed | jsonlogic-to-prisma.ts:111-113, 53-65 |
| B6 | 数据集物化无事务无并发防护：deleteMany+createMany 中途崩溃 → 数据集空/永久 REFRESHING；重复刷新并发交错 | dataflow-engine.service.ts:311-332, dataflow.service.ts:145-181 |
| B7 | 数据流 loadSourceData 无 take 上限，大对象 OOM（对照 chart-data 的 10000 上限未复用） | dataflow-engine.service.ts:131-137 |
| B8 | isolated-vm 失败路径不 dispose → 每次失败泄漏 128MB Isolate，持续失败 OOM gateway | cloud-function.runner.service.ts:107-139 |
| B9 | 流程定义/实例/trace/任务详情读取 + 通知模板 CRUD 无 @RequirePermission：任意用户可读全部流程变量、triggerContext、任意任务 formData | process.controller.ts:68-72,90-94,145-174,187-209,247-277 |

### P1 — 严重（前端 2 个）

| # | 缺陷 | 位置 |
|---|---|---|
| F-B1 | runtime-ui 页面间导航无 key 重挂载：vm 残留上一页状态、autoQuery 不重跑、onLoad 因 firedRef 不再触发 → **多页应用运行时导航坏** | PageView.tsx:52-58（修法：key={page.id}） |
| F-B2 | 表单提交与验证整体未接线：Form 无 onFinish/onSubmit 动作触发、FormFieldItem 无 rules（required 仅红星装饰）；EventsTab 却宣称支持 onSubmit/onReset | renderers-form.tsx:48-59, renderer-helpers.tsx:284 |

### P2 — 中等（后端 13 项）

B10 权限规则多角色时取首个 ALLOW（顺序不确定）而非合并条件；B11 应用 delete 在 deleteMany 后写 ChangeLog → FK 违反被吞 → 删除审计缺失；B12 发布快照 5 路并行查询无读事务 + 回滚不同步 isPublished/status 且无 ChangeLog；B13 编辑已发布流程静默降 DRAFT 影响运行实例；B14 auth 限流器定义但从未 @Throttle 接线（登录仅默认 100/min/IP，已在本次测试中实际触发 429，已改为 env 可配）；B15 租户 $extends 无上下文 warn 每请求刷屏（guard 先于 interceptor 执行）且绕过 pino；B16 webhook 把调用方全部 header（含 Authorization/Cookie）明文存入 triggerContext 并经 API 返回；B17 连接器 SSRF（未校验私网/metadata 地址）；B18 用户列表/详情/创建返回含 passwordHash 的原始实体；B19 ObjectMeta.fields JSON 读改写无锁丢更新；B20 记录 by-ID 路由仅 `'*'` 通配规则可匹配（per-object 规则不生效）；B21 BullMQ 无 attempts/backoff/DLQ → 瞬时错误永久卡 RUNNING；B22 AutoNumber/Formula 在创建事务外计算（失败产生序号空洞）。

### P2 — 中等（前端 8 项）

F-B3 setByPath 每次 setVariable 整树 structuredClone（每键击）+ pageBuilder updateComponentProps 每键击深拷贝+入栈；F-B4 `getPropAsNumber(...) || undefined` 把 min/max/precision/step/pageSize 等合法 0 值吞成 undefined；F-B5 服务端分页封顶 50 行且翻页不重查；F-B6 画布节点不可拖拽重排（仅 panel→canvas）、drop 无 index、zoom 下 DragOverlay 未缩放；F-B7 渲染器无 React.memo + ctx 每次 vm 变化重建 → 全树每键击重渲染；F-B8 open_modal/close_modal 写 vm.modalVisible 但零消费方（2/12 动作是死动作）；F-B9 零代码分割：studio 单 chunk 4.93MB、runtime-ui 2.65MB（echarts 急加载）；F-B10 call_api 非 JSON 响应 + responseVariable 时 res.json() 后 catch 里 res.text() 二次读流抛错（本次新修复引入的回归）。

### P3 — 细节（择要）

JWT_SECRET 兜底字符串残留（env 校验兜住但宜删）；filter JSON 解析失败静默忽略；非系统字段排序回退到整个 JSONB 文档排序（语义错误）；租户提取方式不一致（requireTenantId vs tenantId!）；响应包络不一致（tasks 返回裸数组）；prisma-exception filter 500 分支无日志；NodeErrorBoundary 无状态复位（修复后仍显示错误框直到重挂载）；queryKeys 注册表零消费方且已与实际键漂移；studio/runtime-ui API client 重复实现且不处理 403；navigate 动作外部 URL 走 react-router 失效；StrictMode 下 autoQuery 双发；TaskCenter >50 任务不可见。

## 三、架构评估

**优点**：模块划分清晰（feature-module + controller/service/DTO）；租户隔离三层防御真实有效；schema 健康（AutoNumberCounter 复合唯一与 upsert 匹配、GIN 索引、级联完整、5 个无 tenantId 模型均有合理理由）；统一 `{ok,data}` 包络；`as any` = 0、TODO/FIXME = 0；服务签名 `(tenantId, ...)` 高度一致。

**待改进**：forwardRef 7 文件 17 处（record↔trigger、queue↔process、connector↔process 环）— 记录事件路径已具备事件总线雏形，抽出 EventBus 可消除三处环；$transaction 仅 2 文件使用，delegateTask/物化/对象字段编辑/审计写入等多写流程无事务；DTO 纪律不均（process.service 内联接口 vs class DTO）。

## 四、功能完成度（飞书对齐复核）

08-23 校准的 10 模块对齐度**全部维持**（无权重变化），整体 **~68%**（工程完成度 ~90%，两维度分离）。校准明细：
- D 流程引擎缺口实为 **6 种节点**（batch_operation 此前漏计）；
- C 新增缺陷：open_modal 死动作（12 动作中 2 个无实现）；
- **Demo 审批链路断裂点**：seed 的通知节点 `recipients: []` + 执行器 `??` 空数组短路 + create 空数组返回 0 → 审批通过/拒绝通知永远不会送达（`seed-demo.ts:434,446` + `notification.executor.ts:36-39`）— 平台旗舰演示旅程的最后一环是坏的；
- H 仪表盘：运营报表原语（指标卡+聚合直连）已落地，管理后台运营指标仍缺；
- Rollup 仍死、Lookup 仍无约束、看板/日历/画廊视图仍不可渲染。

**Top 功能缺口（按用户影响）**：① 审批通知不送达（演示链路）② 连接器 35% ③ Rollup 死+Lookup 无约束 ④ 6/20 流程节点缺失+子流程不等待+非严格 AND-join ⑤ 视图 5/6 类型不渲染 ⑥ open_modal 死动作 ⑦ 无 Excel/软删除 ⑧ 无管理后台运营报表 ⑨ 测试盲区（见测试报告）⑩ 组织权限扩散缺失。

## 五、代码质量度量

| 指标 | 数值 |
|---|---|
| 后端非测试源码 | ~14,700 行 / 130 文件 |
| 控制器 / 服务 / DTO 文件 | 20 / 29 / 20 |
| `as any`（非测试） | **0** |
| TODO/FIXME/HACK | **0** |
| 超过 400 行的后端文件 | process-engine.ts(844), process.service.ts(796), object.service.ts(611), application.service.ts(597), record.service.ts(563) |
| 超过 400 行的前端文件 | studio 17 个（最大 RecordList 836）+ runtime-ui 1 个（TaskCenter 408）；shared 全部达标（≤373） |

## 六、修复优先级建议

1. **立即**：P0-2 chart-data ABAC 旁路（补权限+行条件）；F-B1 PageView key={page.id}（一行修复解锁多页运行时）
2. **本周**：B5 翻译器 fail-closed；B2 completeTask 锁内重读快照；B1 create 路径 fieldScope；B8 isolate dispose（finally）；B9 流程/模板读取授权；F-B2 表单验证接线
3. **下周**：B3 定时触发器生命周期；B4 decision 枚举校验；B6/B7 物化事务+上限；P0-2 配套的 chart-data service 单测
4. **持续**：P2 清单按模块分批；B14 已修（env 可配）+ 补 @Throttle('auth') 接线；B15 warn 改为 runAsSystem 显式标注系统路径
