# AI 主线第四轮：权限工具面 + 反馈环 e2e — 2026-10-06

> 方法论：先 spike 后实现 + 实测收口。分支 `feat/ai-mainline-r4-permission-tools`。

## 一、权限工具面（治理单元 = 角色规则集）

**设计定案**：权限规则（五维 × 动作 × targetId × 行级 condition × fieldScope × effect）
以**角色规则集**为治理单元——快照 = 该角色的目标规则集，批准 = 全量替换
（复用 `RoleService.setPermissionRules` 写内核，deleteMany+createMany 语义与 UI 一致）。
不给 AI 单条规则的增量写入——全量替换语义简单、diff 可读、与 UI 编辑器同构。

工具面：
- `list_permission_rules(appId)`：按角色分组的规则现状（配置前读现状）；
- `submit_permission_rule_draft({appId, roleId, rules})`：G3 第五校验器
  （`permission`：维度/动作/效果枚举、condition 须 JsonLogic 对象、fieldScope 字符串数组、
  上限 200）+ **targetId 存在性校验**（PAGE/DATA_MODEL/PROCESS/CONNECTOR 对照活表，
  同 workflow pageId 白名单模式——实测拦截了一次假 ID）；
- 治理轨道：`ReviewModule` 加 `PERMISSION`（快照 apiName=角色 code，同角色二次提交
  走 apiName 收编 = 更新语义）；拓扑序追加 PERMISSION:4（无资源依赖，置于末位）；
- 方言指南 `permission`（五维语义 + condition 变量域 + deny-overrides/default-deny +
  "最小必要授权"原则 + 角色成员由人工管理边界）。

**实测闭环**（采购分析应用）：创建应用级角色"采购查看者"→ user@apaas.dev 加入 →
MCP 提交规则集（RECORD VIEW 采购单 + condition `supplier_name=="华东科技"` + 台账页 VIEW）
→ 人审批准 → **以终端用户登录实测：7 条采购单只见 3 条华东科技**（行级 JsonLogic
条件经翻译器下推生效）。

## 二、反馈环 e2e（欠账两轮，本轮清偿）

`e2e/22-feedback-loop.spec.ts` 三断言：
1. **驳回 → writeback 回写**：user 提交 → admin 驳回 → 轮询断言记录 status=rejected；
2. **申请人站内信**：流程 notification 节点（IN_APP，`{{record.created_by}}`）→
   断言"反馈审批被驳回"通知到达；
3. **运行时 UI 台账**：注入登录态打开台账 → mapping 中文标签"已驳回"可见。

夹具自建幂等（应用/对象+字段分端点创建/表单+台账页/审批流），API 建资源走
"人工提交即时 APPROVED"语义，无治理等待。

## 三、e2e 工程坑（本轮踩平）

1. **auth 端点限流 10/min 滚动窗口**：e2e 连续运行反复登录触发 429——
   ① fixtures `loginViaApi` 加 token 缓存（TTL 10min）；② `auth.setup` 从 UI 表单
   登录**改为 API 登录直写 storageState**（zustand persist 键 `apaas:auth`，
   结构 `{state:{token,user},version:0}`）——setup 不再依赖 UI 流程，抽验
   e2e/01、e2e/11 无回归；
2. **提交→实例启动→创建任务是 BullMQ 异步**：驳回前必须轮询等任务出现
   （直接查列表会拿到上轮遗留任务）；回写也有引擎时延——断言一律轮询；
3. **驳回路径会绕过线性通知节点**：`rejectToNodeId` 直接跳目标节点——要"驳回
   也通知"，通知节点必须在驳回回跳路径上（rejectToNodeId 指向通知节点）；
4. 对象创建与字段是分离端点（POST /apps/:id/objects → POST /objects/:id/fields）；
5. strict mode：表格页标题与侧栏菜单同名文本用 `getByRole('heading')` 定位。

## 四、下轮建议

1. **业务用户旅程第三轮**：审批结果自动通知默认链路（AI 生成流默认带通知节点）、
   审批弹窗数据域映射 UX（绑定提交表单时控件显示"-"）；
2. 权限工具面二阶：`create_role`/角色成员管理边界讨论（当前成员由人工管理）；
3. 选项集（P1 遗留）、MinIO（生产前）。

关联 [[ai-mainline-r3-dataset-tools]] [[review-followup-2026-10-05]] [[full-review-2026-10-04]]。
