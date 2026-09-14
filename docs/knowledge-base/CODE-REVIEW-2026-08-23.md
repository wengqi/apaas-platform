# 全面代码审查报告 — 2026-08-23

> 审查范围：后端（apps/gateway + packages/db）/ 前端（packages/studio + runtime-ui + shared/stores）/ 飞书对齐度核查
> 审查方式：三路并行深度审查（架构与缺陷 / 前端渲染核心 / 飞书 A-K 功能清单逐项对照）
> 整改状态：**R1（HIGH 全部修复）+ R2（MEDIUM 主要项修复）已完成，见文末**

## 一、最重要的结论

1. **代码工程质量是真实的**：零 TODO/FIXME、零 `as any`、租户 $extends 三层防御、isolated-vm 沙箱、AES-256-GCM 实现正确、发布链路（预检→快照→版本→回滚）完整、383+ 测试通过。
2. **飞书对齐度声明虚高**：此前 ~97% 的数字按"代码完成度"口径得出，未与基准文档 A-K 功能清单逐项对照。校准后 **~68%**（连接器 35%、页面 65%、流程 65%、建模 70%、仪表盘 60%）。
3. **存在 8 个 HIGH 级生产阻断缺陷**（审查发现），已全部修复。

## 二、HIGH 级缺陷清单（已全部修复 ✅）

### 安全（3 项）

| # | 缺陷 | 修复 |
|---|---|---|
| S1 | ABAC 行级条件仅在 query() 执行，get/update/delete 按 ID 可操作租户内任意记录 | buildConditionWhere 辅助方法注入全部读写路径 + fieldScope 写过滤（record.service.ts） |
| S2 | 凭证/云函数端点仅 JWT 保护，任意租户用户可管理密钥/执行服务端代码 | PermissionGuard + CONNECTOR 权限装饰器（两个 controller） |
| S3 | delegateTask 无成员校验，任意用户可转办他人任务；delegatedTo 未验证 | assertTaskMembership 提取复用 + 被转办人租户内存在性校验 |

### 流程引擎（4 项）

| # | 缺陷 | 修复 |
|---|---|---|
| B1 | 并发 job 读写 activeNodeIds 无互斥（concurrency=5），令牌丢失→实例卡死 | withInstanceLock 进程内实例级串行锁（executeNextNode/completeTask/resumeDelayedNode/cancelProcess） |
| B2 | completeTask 非幂等，双击批准→下游重复执行 | updateMany({where:{id,status:'PENDING'}}) 原子认领，count!==1 拒绝 |
| B3 | 循环 Schema 无步数预算→worker 卡死 | MAX_NODE_EXECUTIONS=1000 + 历史执行计数检查，超限置 FAILED |
| B4 | WAITING 令牌被其他分支 job 重复执行（并行+延时→双重调度） | while 循环查询 WAITING NodeExecution 跳过等待令牌 + resumeDelayedNode 校验令牌仍活跃 |

### 前端渲染（3 项）

| # | 缺陷 | 修复 |
|---|---|---|
| F1 | PageLoadEffect deps 含每渲染必变的 ctx → onLoad 重跑 → 写 vm 死循环 | ref 防重入（每次挂载仅触发一次）+ 两处 ComponentRenderer ctx useMemo 稳定化 |
| F2 | 渲染核心零错误边界，未知节点类型/坏 schema→整页白屏 | NodeErrorBoundary 节点级降级 + renderUnknownType 占位（component-renderer.tsx） |
| F3 | rich_text_display 的 dangerouslySetInnerHTML 未消毒（配合 new Function 表达式引擎构成 XSS→token 窃取链） | DOMPurify.sanitize（shared 包新增依赖） |

## 三、MEDIUM 级缺陷（主要项已修复 ✅）

| # | 缺陷 | 状态 |
|---|---|---|
| A1 | PrismaExceptionFilter 注册在 AllExceptionsFilter 之后→永不执行，P2002 变 500 | ✅ 交换顺序 + 直接写响应 |
| B8 | auto-number 全表扫描 O(N)/次 + 并发竞态 | ✅ AutoNumberCounter 表（(objectId,prefix) 唯一 + 原子 increment） |
| B10 | object_operation 节点 update 整体覆盖 JSONB data | ✅ 先读后 merge（与 RecordService 一致） |
| B5 | 边级 edge.condition 从未被求值（审批后有条件出边全部触发） | ✅ resolveEdgeTargets JsonLogic 求值（resolveNextNodes/completeTask/resumeDelayedNode 三处接入） |
| P1 | UserRole.roleId/OrgMember.orgId/Connector.webhookToken/ProcessTask(instanceId,status) 缺索引 | ✅ 迁移 20260823210000（webhookToken 加 @unique） |
| B12 | BATCH_MAX_ROWS/IMPORT_MAX_ROWS env 定义但未接线 | ✅ DTO/service 从 process.env 读取 |
| A6* | 系统字段类型违约：'datetime' 应为 'date_time' | ✅ object.service + seed-demo 同步修正 |
| F-vm | 动作链 ActionContext.vm 是快照，前序 set_variable 对后续不可见 | ✅ 改 getter 实时读取 store |
| F-api | call_api 无 token/无状态检查/响应不可用 | ✅ 注入 Bearer token + 4xx/5xx toast + responseVariable 捕获 |
| F-undo | undo 栈无界 + 每按键推送 + 失败操作污染栈 | ✅ pushHistory 上限 50（与 processEditor 一致；按键合并与验证后入栈待后续） |
| F-task | TaskCenter 缓存键 ['task',id] 与失效键 ['tasks'] 不一致→审批后旧状态 | ✅ 统一为 ['tasks','detail',id] |
| F-ux | 拒绝审批单击不可逆 | ✅ Modal.confirm 二次确认 |

**遗留 MEDIUM（列入 R4/后续）**：画布节点拖拽重排、表单验证 rules、节点级 React.memo 全量化、JSONB 字段排序、NaN 分页、流程定义 copy-on-write、auto-number 前缀匹配误计（Counter 化后已消除主要问题）、login 节流 @Throttle 接线、SSRF 校验、webhook 头脱敏。

## 四、飞书对齐度校准（关键修正）

此前对齐表存在**模块编号错位**（对象标 D 应为 A、流程标 E 应为 D 等）。校准后（详见 STATUS-MATRIX）：

| 模块 | 飞书模块 | 校准前 | 校准后 | 主要缺口 |
|---|---|---|---|---|
| 页面搭建器 | C | 95% | 65% | 29/130 组件、无移动端/版本管理/JS扩展 |
| 应用发布 | I | 95% | 85% | 无模板市场/应用包导出 |
| 数据集 | B | 90% | 85% | 数据源类型有限 |
| 云函数 | G | 90% | 80% | 无 npm 依赖/定时执行 |
| 对象建模 | A | 90% | 70% | Rollup 死类型、Lookup 无约束、看板/日历视图未渲染 |
| 流程引擎 | D | 88% | 65% | 缺 loop/break/continue/wait_for_condition/inclusive、子流程不等待、非严格 AND-join |
| 权限多租户 | E | 92% | 80% | 组织授权继承扩散 |
| 连接器 | F | 70% | 35% | 仅 HTTP+Webhook，无 OAuth2/数据库/OpenAPI/市场 |
| 仪表盘 | H | 80% | 60% | 无地图图表、无管理后台运营报表 |
| 数据管理 | J | 65% | 65% | 无 Excel/列映射/软删除 |
| **整体** | — | **~97%** | **~68%** | 工程完成度 ~90% 与功能对齐度 ~68% 是两个维度 |

**审查补录的未记录缺口**：实时协作（0 实现）、应用模板市场、软删除/回收站、Excel 导入、API/BUTTON_CLICK 触发器、字段级加密、移动端适配。

## 五、Demo 应用审查发现与增强（已修复）

1. seed 直接 `prisma.record.create` 绕过 RecordService → RECORD_CREATED 触发器不生效（示例领用申请为静态数据）。**保留此设计**（幂等可重跑 > 触发演示），审批流程经运行时创建记录触发。
2. 快照 `permissions: { roles: [] }` 权限模型零演示 → ✅ 已包含租户角色 + 规则。
3. 按钮无事件配置 → ✅ 列表页新建按钮配置 navigate 动作（演示 12 动作系统）。
4. auto_number 字段种子硬编码 → 保留（与 Counter 表计数器并存不冲突）。
5. Lookup 字段未演示 → 待 R4 Lookup 完整化（外键约束）后加入。

## 六、整改验证

- gateway：349 测试通过（新增 B3 循环预算 / B4 WAITING 跳过 / S1 行级条件注入 / fieldScope 写过滤 / batchDelete 条件过滤 共 8 测试）
- db：42 测试通过
- studio：86 测试通过
- 全部 typecheck + ESLint 0 warning
- 迁移：20260823210000_add_auto_number_counter_and_perf_indexes（Counter 表 + 4 性能索引 + webhookToken 唯一）
