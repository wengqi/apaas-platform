# 零知识用户旅程(A/B 角色扮演)——2026-10-03

> 方法:角色 A(零知识新手,只可提问、不可读文档/自行修复)在 studio UI 上从零构建「设备报修」应用,角色 B(专家)答疑、接收全部反馈、修复、交 A 验收。与 MCP 主线打磨(AI 第一公民轨)互补——本轮测**纯人工 UI 新手可用性**,每一步真实浏览器执行。

## 一、旅程主线(A 独立完成,全程无代码知识)

登录 → 创建应用「设备报修」→ 对象「报修单」(5 系统字段自动 + 5 业务字段,含 2 个单选各 4 选项)→ 页面×2(表单页/列表页,**对象字段自动生成模板**)→ 发布 0.1.0 → 运行时提交报修单 → 台账查看 → 修复后重发布 0.1.1 → 复验。

**结论:零知识用户可独立完成"对象+页面+发布+运行"闭环**;流程编排(流程)未在本旅程覆盖(flowgram 画布,后续轮次)。

## 二、A 反馈全清单与处置

| # | A 的反馈(B 定性) | 处置 | 验收 |
|---|---|---|---|
| H1 | 提交表单点"提交"无任何反馈,连点 3 次=3 条重复记录(高危) | ①模板 form 加 `messages.success/failed` + `resetAfterSubmit`(重置+防重复);②AmisRenderer 加 notify 桥接(AntD message) | 重置+防重复 ✅(每击一条);**toast 仍未显示**——amis 裸 render() 的 options.notify 未进 env,记录为 H1b 未竟项 |
| H2 | 台账"紧急程度/状态"列显示 UUID 乱码(高危) | page-template `selectOptions`:`value ?? o.id` → `value ?? o.label`(注释本就声称回退 label,实现背离) | ✅ 台账显示"低/中/高/紧急/待处理" |
| H3 | 版本历史"发布人"显示用户 ID(高危) | 根因:前端二次查 `/permissions/users` 需管理员权限,builder 403。后端 `listVersions` join users 直出 `publishedByName` | ✅ 显示"搭建者" |
| M1 | API 名称必填无自动生成,对象/字段/页面三处重复摩擦(中) | 引入 pinyin-pro:`suggestApiNameFromLabel`(显示名称→拼音 snake_case),升级对象/流程/页面三处建议值+补齐字段弹窗(最高频处原本完全没有) | ✅ "报修提交"→`bao_xiu_ti_jiao`,可手改 |
| M2 | 顶栏"发布/发布历史"按钮易混淆,A 实测误点(低) | 文案统一"版本历史" | ✅ |
| M4 | 应用创建成功后停在列表,无下一步引导(低) | onSuccess 自动 navigate 进新应用工作台 | 已落地(未显式复验) |
| — | 登录页"租户标识"不可自解释;字段"存储值"等术语无内建解释;首页无示例/教程入口;首访无引导(记录) | 未修,列产品 backlog | — |

### 旅程中 B 侧踩的坑(工程)

- **studio/runtime-ui 均为 `vite preview`(serve 构产物)非 dev server**——改源码必须 rebuild+重启才生效,A 验收 M1 时曾因此误判修复无效
- AntD Form `onChange` 里 `form.getFieldValue` 读到旧值(表单值未同步),自动转写须取 `e.target.value`——三处弹窗首版全错,A 验收抓出
- 旧测试断言 H2 缺陷行为(id 当 value)——测试与实现同错,按新语义改写用例(显式 value 保留+缺省回退 label 双断言)
- studio 构建需 `NODE_OPTIONS=--max-old-space-size=8192`(已知坑)

## 三、遗留(H1b 根因线索)

amis 6.13 裸 `render(schema, props, options)` 传入的 `notify` 未被 form saveRemote 链路使用(提交成功 msg='提交成功' 时仍无任何 toast 节点挂载)。下一步:查 amis-core `render()` 的 env 合成(是否需 SDK 形态 `amisEmbed`/显式注册 ToastComponent),或改在 fetcher 成功分支对 POST 自行弹提示。**不阻塞业务(防重复已由 resetAfterSubmit 结构性解决)**。

## 四、本轮测试数据

demo 租户「设备报修」应用(app_116372):repair_order 对象 + 2 页面(bao_xiu_ti_jiao/repair_list)+ 0.1.0/0.1.1 两版本 + 6 条报修记录(选项值均为业务可读值)。可整应用删除清理。

---

# 第二轮:流程画布(2026-10-03 晚)

> 承接第一节遗留:流程编排(flowgram 画布)补走。A 目标——给「设备报修」加审批流:提交报修 → 角色审批 → 通过回写"已完成"/驳回回写"已驳回"。B 全程教学(节点连线入口/条件配置/字段映射),A 逐步实操,修复即时验收。**本轮以真实运行时闭环验证收尾。**

## 一、旅程主线(A 实操)

创建流程「报修审批」(记录创建触发,apiName 拼音建议生效)→ 画布加人工任务(连线加号入口)→ 配置审批人 → 加条件分支(RAQB:`审批结果(decision) 等于 APPROVED`)→ 两分支各加对象操作(更新 报修单.status)→ 字段映射(recordId←${recordId} / status←已完成|已驳回)→ 发布流程 → 应用发布 0.1.2 → **运行时:builder 提交"打印机/紧急"报修 → 流程触发 → admin(租户管理员)任务中心批准 → 记录状态回写"已完成",实例 COMPLETED** → 0.1.3(人工任务改角色审批)复验全绿。

**结论:零知识用户经 B 教学后可完成"流程+审批+状态回写"全链路;AI/人工两条创建轨至此均端到端可用。**

## 二、A 反馈全清单与处置(第二轮)

| # | A 的反馈(B 定性) | 处置 | 验收 |
|---|---|---|---|
| #8 | "怎么加节点?"——加号入口=悬停节点间连线才出现,零知识完全不可发现(B 教学后才会);连线本体点击无反应 | 记录待规划(需交互设计:常显加号/右键菜单/工具栏添加) | 未修 |
| #9 | 审批"角色编码"是自由文本,placeholder 给了不存在的 ADMIN(真实是 TENANT_ADMIN),A 必须问 B 才知道填什么 | **改角色下拉**(值=角色 ID)——见 #12 一并根治 | ✅ |
| #10 | 对象操作配了字段映射,运行时报"对象更新节点缺少 recordId"——**UI 写 fieldMapping,引擎只读 inputsValues,契约从未打通** | ①serializer:fieldMapping→inputsValues 四态转换(单变量→ref/插值→template/纯文本→constant,合并保留既有键);②EventBridge:导出前把业务节点 extInfo 并入 node.data(**根因**:侧栏配置走 updateExtInfo,flowgram toJSON 不含 extInfo——此前全靠 store 直写补丁,任何画布变更触发的 export 会整体覆盖 store 把配置抹掉,也解释了 H1 前配置丢失) | ✅ 落库 schema 含 `inputsValues={recordId:ref, status:constant}`,运行时状态回写成功 |
| #11 | "添加映射"点了没反应——FieldMapper.emit 只上送非空 key 行,新增空行立即被丢弃(死循环缺陷) | 行状态本地持有(按值比较防父层 schema 往返重置) | ✅ A 实操添加两行映射成功 |
| #12 | 配好"指定角色"运行时报"人工任务无受理人"——三连根因:①UI 把角色编码写进引擎按用户解释的 assignee;②引擎仅角色时 createMany 空数组=无任务行;③rolesApi 全模块 URL 缺 /v1(管理员恰好能过守卫,一直被掩盖)+builder 调角色列表 403 | ①UserTaskConfigForm:ROLE 改角色下拉写 `candidateGroups:[角色ID]`(nodeMetadata 摘要/完成度判定同步);②user-task.executor:仅角色时创建 assignee=null 任务行(任务中心 candidateGroups 匹配角色成员,completeTask 的 isCandidate 判定本就支持);③permissions.ts 29 处补 /v1 + role.controller list 降为登录可读(写操作仍租户管理员) | ✅ admin 任务中心看到角色任务→批准→回写成功;builder 角色下拉出"租户管理员(TENANT_ADMIN)" |
| #13 | 流程发布后画布只读,无"编辑新版本"入口——流程一旦发布就改不了(后端本支持"更新即回退草稿") | 工具栏加"转为草稿编辑"(Popconfirm 说明运行环境仍用已发布版本直至下次发布) | ✅ A 一键转草稿→改配置→重发布 |
| #14 | 提交/审批成功 toast 弹两次(操作成功×2/任务已处理×2),amis 页与 AntD 页均现 | 记录待查(疑似事件/渲染双触发,不影响功能) | 未修 |
| #15 | 审批页"申请内容"渲染原始 inputs JSON,审批人看不到友好表单(人工任务"任务表单(可选)"无页面可选——应用没有审批页模板) | 记录待规划(审批页模板+绑定引导) | 未修 |
| #16 | 驳回配置默认"不允许",但审批面板"拒绝"按钮仍显示,点击无任何反馈 | 记录待修(按钮应禁用+提示);驳回链路引擎侧与通过链路对称(decision=REJECTED→默认分支→已驳回),通过链路已验证 | 未修 |

### 第二轮 B 侧踩的坑(工程)

- **ApaasAdder 的 AntD Popover 关闭后仍留在 DOM**(ant-popover-hidden)——自动化按文本找"对象操作"格子会命中隐藏弹层,误插到主干+误建触发器节点;须 `:not(.ant-popover-hidden)` 过滤。真人双击也可能触发重复插入(undo 可救)
- flowgram fixed-layout 的画布节点文本在 TreeWalker 下坐标全为 (0,0),DOM `data-node-id` + getBoundingClientRect 是可靠定位源;节点类型经 `toEngineNodeType` 转 snake_case
- **vite preview 的 index.html 被浏览器硬缓存**:重建后 reload 仍旧包,须 `fetch(no-store)+document.write` 换文档或带查询串跳转;换文档后偶发 SPA 未挂载,再 reload 一次即好
- 网关 `nest build` 产物由 `node dist/main.js` 常驻运行,改后端必须重建+重启(与前端 preview 同理)
- NestJS 类级 Guard 不能按方法豁免(方法级只会叠加)——放开单个端点须把类级 Guard 拆成方法级;TenantAdminGuard 同时承担认证(JWT),豁免时须补 JwtAuthGuard,否则 req.user 为空 500

## 三、修复落点清单(本轮提交)

| 层 | 文件 | 内容 |
|---|---|---|
| runtime-ui | `AmisRenderer.tsx` | H1b 收尾:fetcher 层写操作成功兜底 toast(替代 notify 桥接,GET 静默) |
| studio | `features/.../schema-serializer.ts`(+spec) | #10a fieldMapping→inputsValues 四态转换+合并保留 |
| studio | `components/process/EventBridge.tsx` | #10b 导出前 extInfo 并入 node.data(根因修复) |
| studio | `components/process/FieldMapper.tsx` | #11 空行保留(按值比较同步) |
| studio | `configs/UserTaskConfigForm.tsx` + `nodeMetadata.ts` | #12a ROLE 角色下拉→candidateGroups[角色ID] |
| studio | `pages/process-editor/ProcessEditorToolbar.tsx` | #13 转为草稿编辑入口 |
| studio | `api/permissions.ts` + `api/permission-debug.ts` | #12c 29 处 URL 补 /v1 |
| studio | `vitest.config.ts` | include 加 features/**/*.spec.ts |
| gateway | `node-executors/user-task.executor.ts`(+spec) | #12b 仅角色创建 assignee=null 任务行 |
| gateway | `permission/role.controller.ts` | #12d 角色列表登录可读(写仍管理员) |

测试:gateway 699(新增 1)/ studio 118(新增 4)全绿。

## 四、本轮测试数据(累计)

demo 租户「设备报修」(cmusclezr0003quh2n2pq3a4y):流程 bao_xiu_shen_pi v3 已发布;应用版本 0.1.0~0.1.3;记录 8 条(打印机=已完成[链路验证]、碎纸机=待处理+一条 admin 待办任务[驳回按钮无效现场]、投影仪=待处理[首轮 FAILED 实例现场]、其余 0.1.1 前测试数据);1 条 FAILED 实例(#10 修复前现场)。可整应用删除清理。
