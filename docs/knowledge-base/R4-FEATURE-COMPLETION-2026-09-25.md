# R4 功能补全与对齐收口 — 2026-09-25

> 目标：完成项目最初设定目标（复刻飞书 aPaaS 10 大模块）的剩余对齐缺口。
> 基线：2026-09-13 审查报告的 Top 功能缺口清单 + 2026-09-15 GUI 全流程测试（21 点全通过）。
> 结果：**532 单测全绿（+36）**，build/typecheck/lint 全绿；工程完成度 ~96%，飞书对齐度 ~68%→~72%。

---

## 一、流程引擎补齐（最高优先缺口）

### 1.1 六种节点执行器（14 → 20 种全量）

| 节点 | 实现 | 文件 |
|---|---|---|
| inclusive | 多分支 OR：所有条件满足的分支同时激活；无满足走无条件边；引擎注册严格 OR-join | inclusive.executor.ts |
| loop | for-each：集合快照 + 迭代状态（`variables._loops`）；体边/完成边按**可达性自动分类**（体边成环），maxIterations 防呆 | loop.executor.ts |
| break | 清除循环状态 → 路由到循环完成边；归属循环按图分析（内层优先） | break.executor.ts |
| continue | 令牌跳回循环节点，由循环节点推进下一迭代 | continue.executor.ts |
| wait_for_condition | 条件满足直通；未满足经 BullMQ delayed job（kind='wait_condition'）重查 — **事件驱动，无 setInterval**；超时路由 label=timeout 出边或实例 FAILED | wait-for-condition.executor.ts |
| batch_operation | 批量 create（records 数组）/ update / delete（recordIds 或 JsonLogic filter）；缺范围**拒绝全表操作**；受 BATCH_MAX_ROWS 约束 | batch-operation.executor.ts |

### 1.2 严格 AND-join（替换"首达即执行"）

- 分裂时（parallel/inclusive 激活 >1 分支）注册汇聚等待 `variables._joins[joinId] = {expected, arrived}`。
- 汇聚点经**支配性收敛分析**确定：公共可达节点中，删除它后各分支均不能到达 end/死端（安全激活的充分条件）；不满足则**安全降级**为历史首达行为（避免令牌发散卡死）。
- 令牌到达经 `gateJoinArrivals` 门控：未到齐暂扣、到齐放行；`advanceTokens` 与 `completeTask` 两条路径统一接入。
- 实例完成前检查 pending joins：存在则保持 RUNNING 等待其他分支 job（日志可见）。

### 1.3 子流程同步等待

- `sync !== false`（默认同步）：triggerContext 写入 `_parent = {instanceId, nodeId}`，节点 wait=true。
- 子实例 COMPLETED → `resumeParentAfterSubProcess`：父节点 WAITING→COMPLETED、写入子流程输出（`{{sub_x.output.subInstanceId}}`）、令牌推进、父实例重新入队；FAILED → 父实例同步 FAILED（不永久挂起）。
- 竞态安全性：父实例锁在 executeNode 期间被持有，恢复操作排队至 wait 注册之后。

### 1.4 引擎类型契约扩展

- `ExecutionContext` 增加 `schema`（loop 图分析用）+ `scheduleDelay(kind)`。

## 二、编辑器↔引擎类型调和（重大隐性缺陷）

**缺陷**：flowgram 物料注册用驼峰（userTask），`flowToWorkflowSchema` 原样透传 → 编辑器搭建的流程存库为驼峰 → 引擎按 snake_case 注册执行器 → 运行时报 `unsupported_node_type`。E2E/API 直写 snake_case 从未暴露。

**修复**：
- 序列化器：导出统一 `toEngineNodeType`（驼峰→snake，幂等）；载入 `toEditorNodeType` 反向映射历史物料。
- 前端物料：8 种新节点注册（inclusive 复用 dynamicSplit 分支容器结构 + ConditionConfigForm）；NODE_META 含 snake 别名；NODE_COMING_SOON 清空。
- 配置面板：Loop/WaitForCondition/SubProcess/BatchOperation 四个新表单 + snake 类型 case；processOptions 贯通（子流程候选，排除自身）。

## 三、演示审批链路修复（通知不送达）

- record.service：记录事件载荷补充 `created_by`/`updated_by`（系统字段置于展开后防覆盖）。
- notification.executor：收件人逐项 `renderTemplateDotted` 解析（支持 `{{record.created_by}}`）+ 空收件人告警。
- seed-demo：审批通过/拒绝通知节点 `recipients: ['{{record.created_by}}']`。

## 四、Rollup 转正 + Lookup 写约束

- shared：rollup 配置扩展 `relationFieldId`（关系字段）+ `targetFieldId` 可选（count 免选）。
- `rollup.service.ts`：聚合计算（sum/avg/count/min/max，lookup 值引用 / sub_form 子记录两种关系）+ **子记录写入反向重算父记录**（元数据扫描 → lookup JSONB 反查 / sub_form parentField 直取）+ **Lookup 写校验**（目标记录存在性，400 拒绝悬挂引用）。
- RecordService：create/update 同步计算 rollup；create/update/delete 异步反向重算（fire-and-forget + .catch）。
- studio：`RollupConfigForm`（关系字段/聚合方式/目标字段三级联动选择）接入 FieldConfigDrawer。

## 五、open_modal/close_modal 落地

- `runtime-ui/ModalHost.tsx`：订阅 `vm.modalVisible/modalPage`（此前零消费方）→ 按 slug 加载页面、独立 vm 渲染、关闭回写 vm。
- PageView 挂载 ModalHost。

## 六、Phase 10.5 部署文档

- `docs/DEPLOYMENT.md`：架构总览 / 本地开发 / Docker Compose 生产部署 / 环境变量必改清单 / 健康检查与端到端验收 / 备份恢复 / 升级回滚 / 8 项排障 / 安全基线清单。

## 七、测试与验证

| 维度 | 基线（09-14） | 本次 |
|---|---|---|
| gateway 单测 | 368 | **404**（+36：node-executors-advanced 20 + process-engine-advanced 7 + rollup 9） |
| db / studio 单测 | 42 / 86 | 42 / 86 |
| 合计 | 496 | **532** |
| build / typecheck / lint | — | 11/11 / 11/11 / 0 error |

**新增测试覆盖点**：inclusive OR 语义与条件异常跳过；loop 首入/再入/完成/空集合/maxIterations；break/continue 归属与路由；wait_for_condition 满足/重调度/非法配置/超时出边；batch create/update/filter 范围/全表拒绝；严格 AND-join 全员到齐单次执行与发散降级；子流程完成恢复父实例/失败联动；Lookup 校验通过/拒绝/跳过；rollup sum/avg/min/max/count/空值/无效配置；反向重算回写。

## 八、剩余缺口（下一批次建议）

1. 组织授权扩散（Phase 4.5，ROADMAP 唯一剩余 ⬜ 后端项）
2. 视图类型：看板/日历/画廊渲染（5/6 类型）
3. 连接器扩展（OAuth2 / OpenAPI 导入 / 数据库连接器）
4. 移动端适配 + JS 页面扩展（Phase 2.9/2.10）
5. 覆盖率 39%→60%（node-executor 覆盖已显著改善，下一步 controller/jwt.strategy/check.service）
6. P2 缺陷清单分批消化（09-13 审查 B10-B22 / F-B3~F-B10）
