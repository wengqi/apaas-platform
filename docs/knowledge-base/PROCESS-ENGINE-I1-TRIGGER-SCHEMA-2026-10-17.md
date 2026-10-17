# 流程引擎修缮轮：I-1 触发匹配改读 schema 触发节点 + G3 渲染契约软告警（2026-10-17）

> 范围：台账 I-1 实锤缺陷（用户裁决修法②）+ R6 遗留候选"G3 软告警"落地。
> 验证：gateway 857 / studio 176 / shared+db 全绿；typecheck 11/11；lint 8/8；
> e2e smoke 16/17（1 挂=e2e/22 runtime 视图断言，已知本地环境假警——夹具"反馈环 E2E"
> 被人工标记 isInternal，CI 新库必过，见记忆 suilan-design-2026-10-13 同款记录）。
> 端到端 API 实测两场景（下文 §四）。

## 一、I-1：画布触发器记录触发永不命中（修法②）

### 症状与根因（两层叠加）

1. **顶层列不同步**：画布触发器节点配置只写 workflowSchema（`data.triggerType/objectId`，
   `TriggerConfigForm` 直写扁平形状），顶层 `ProcessDef.triggerType` 保持新建弹窗缺省
   MANUAL；`trigger.service.onRecordEvent` 按顶层列匹配 → 永不命中。
2. **bundle 可见集坑**：已部署环境的记录触发可见集 = 应用 bundle 快照；流程晚于应用
   发布创建/发布时不入 bundle，须重发应用才生效（R6 走查实测被迫"PUT 顶层 triggerType
   + 应用发布 v0.1.2"两步走）。

另发现同根潜伏缺陷：修前匹配完全不看对象——RECORD_CREATED 流程对应用内**任意对象**的
记录事件都会误触发（触发节点的 objectId 无任何消费者）。

### 修复语义（trigger.service.ts 重写）

- **SSOT**：触发信息以流程自身 workflowSchema 的 trigger 节点为准
  （`extractTriggerInfo` 导出纯函数：`data.triggerType / objectId / cron`，
  画布扁平形状；shared `TriggerConfig` 的嵌套 `objectTrigger` 形状无实际写入方，不消费）。
  schema 无 trigger 节点时**回退顶层列**——种子/AI 建流（方言指南最小骨架无 trigger 节点、
  顶层 triggerType 列即契约）零破坏。
- **匹配集统一 = 活表 PUBLISHED**：记录事件与定时注册（rebuildForEnvironment / 启动注册 /
  发布·下线钩子 / 应用发布注册循环）全部改为活表查询 + 触发节点提取，**bundle 不再约束
  自动触发**（流程级发布语义，发布即生效——与搭建期活表语义归一；台账原"可见集=bundle"
  定性为坑，本轮即消）。实例仍按事件所在环境隔离（runWithEnv）。
- **对象精确匹配**：触发节点绑定 objectId 时仅该对象的记录事件命中；缺省保持应用级
  （存量种子流无绑定不受影响）。
- **执行 schema 一致**：自动触发实例经 `engine.startProcess(..., schemaOverride=活表
  schema)` 直通执行**最新发布 schema**——若不传，bundle 内陈旧快照会以旧逻辑执行
  （触发命中但跑旧流程，比不触发更糟）；G6 schemaOverride 既有路径复用，引擎零改动。
- **eventId 语义不变**：MANUAL 走 startInstance、API 走 G6 冻结快照、WEBHOOK 连接器
  走顶层列——均不经本次改造的匹配路径。

### 有意的语义变化（记录在案）

- 应用**回滚**不再回退自动触发的触发集（回滚只影响页面/对象/权限快照；流程触发生灭由
  流程自身的发布/归档控制）。
- dev/prod 环境的自动触发使用**同一份最新发布 schema**（修前可随各自指针指向不同版本）。
  实际影响≈0：单搭建者场景 dev/prod 流程定义同源。
- 流程级发布后 prod 维度定时触发即时注册（B3 既有）+ 其余环境随下次 rebuild 收敛
  （dev 即时注册缺口为存量，未在本轮扩大）。

### TDD

`trigger.service.spec.ts`（新增 9 例）：画布形状命中+schemaOverride 断言 / 对象精确匹配
负向 / 种子流回退 / 缺 objectId 应用级 / 多流共存按事件类型过滤 / bundle 场景仍活表匹配 /
定时注册读活表+节点 cron / cron 回退顶层列 / 清理仅匹配本环境前缀。红 7 → 绿 9。

## 二、G3 渲染契约软告警（R6 两缺口，warning 不拦截）

- **amis-page.validator** 新增 `validateRenderContracts`（severity:'warning'，码
  MISSING_REQUIRED）：① crud 列引用选择类字段（ctx.selectFieldApiNames 命中）缺
  `{"type":"mapping","map":{...}}`；② input-datetime 缺 `valueFormat`。
  纯结构可判的 ② 无 ctx 也生效；① 无 ctx 时诚实跳过（不做无据猜测）。
- **ctx 接线三处**：page.service（create/update，按页面 objectId 查对象字段）、
  check.service（发布预检，快照自带对象字段）、mcp.service（批量提交，活表对象+批内
  对象草稿按 ID/@ref 令牌索引）。schema-contract.validate 的 amis_page 分支补传 ctx
  （首轮调试发现只扩了类型没传参——单测咬出，见下）。
- **发布预检通道**：check.service 新增 checkPageRenderContracts，G3 warning 映射为
  CheckResult WARNING（CheckPanel 既有 WARNING 渲染分支直接展示，不拦截发布）。
- **指南同步**：amis_page 方言指南码表行补 MISSING_REQUIRED（软告警语义+两契约指回），
  dialect-guide-consistency 锚定测试按设计咬住后转绿。
- **连带修正（R6 记录勘误）**：R6 记录称"平台生成器表单带 format/valueFormat（:65）"
  失实——当时生成器只有 `format`。本轮 page-template.ts 与 seed-procurement.ts 的
  date_time 控件补 `valueFormat:'YYYY-MM-DD HH:mm:ss'`（同口径；field-control-compat
  镜像只按控件 type 断言，不受影响）。

## 三、踩坑

1. **schema-contract.service 只扩类型不传参**：ctx 从 service 到 validator 断链，
   check.service 集成测试只出 1/2 告警；用最小复现（validator 直调带 ctx 两告警齐出 →
   service 路径只出一告警）二分定位。教训：门面层的"参数透传"要有测试直接钉住。
2. **docker 环境与交接文档漂移**：交接称 infra 在跑，实际 Docker Desktop 未启动、
   gateway 端口实为 3000 非 8080——起栈前先实测（`docker ps` / 健康检查）。
3. e2e/22 runtime 视图断言本地必挂为**已知假警**（夹具 isInternal 人工标记），不属回归；
   判定依据=DB `applications.is_internal` 实查。

## 四、端到端实测（API 直驱，2026-10-17）

- **I-1**：临时应用（用后即删）建对象（含 single_select）→ 建画布形状流程
  （顶层 MANUAL + 触发节点 RECORD_CREATED 绑定对象）→ 发布 → 提交记录 →
  **实例自动创建**（COMPLETED / triggeredBy=RECORD_CREATED / recordId 吻合）→
  更新记录 → 实例数不变（负向）。R6 走查"发布后提交记录不触发"场景复验通过。
- **G3**：坏配置页面（crud 选择列无 mapping 契约 + input-datetime 无 valueFormat）
  保存成功（warning 不拦）→ 发布预检 status=PASS 且两条 WARNING 精确命中；
  办公用车夹具预检 0 告警（其页面 R6 治理链已修，口径自洽）。

### GUI 黑盒走查（web-gui-tester，证据 gui-test-screenshots/i1-*.png）

- **T1 登录**：builder 登录 studio → 开发中心首页正常。✓
- **T2 预检 Drawer**：走查应用跑「检查」→「1 个警告」橙标+WARNING 卡（黄色警示图标/
  PAGE 标/契约示例/路径/建议），补 datetime 坏页后「重新检查」→「2 个警告」两类齐出，
  全程 status 不拦截。✓（i1-precheck-warning-mapping / -datetime.png）
- **T3 画布触发器全旅程（I-1 修复旅程）**：UI 新建流程 → 画布「+」加触发器节点（默认
  「有未完成的配置」标红=node-check 画布侧在岗）→ 配置面板选「记录创建触发」+关联对象
  （红标即时消失）→ 保存（「已保存」，未保存标消失）→ 发布（确认弹窗→「已发布,生成
  新版本」；头部仍显示「手动触发」= 顶层未同步的 I-1 场景活体）→ 提交记录 →
  **实例自动创建**（COMPLETED/RECORD_CREATED）。✓（i1-canvas-trigger-config-saved /
  -published-manual-top.png）
- 未执行项：画布「转为草稿编辑」/定时触发 cron 路径 GUI 走查（后端单测+API 实测已覆盖，
  界面无本轮改动面）。走查夹具（应用/对象/流程）用后即删。

## 五、遗留与观察

- 对象删除守卫（object.service delete 第 3 步）仍按顶层列计数——画布触发的引用不在
  守卫内（修前即如此，方向保守）；且触发节点 objectId 悬空时因对象已删无事件可发生，
  无误触发面。留观察。
- MCP 单页提交（submit_page_draft）与 validate_schema 工具无对象 ctx——批量提交与
  保存/预检路径已覆盖，单页路径暂无选择列告警（结构性规则仍生效）。
- e2e/22 本地假警待夹具库清理（isInternal 标记），非本轮范围。
