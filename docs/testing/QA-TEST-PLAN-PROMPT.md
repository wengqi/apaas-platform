# aPaaS 平台全流程全功能 QA 测试标准与目标提示词（组件级全覆盖版）

> **状态**：生效中 · 活文档（随功能变化强制同步更新，见下方维护规约）
> **版本**：v1.0 · 2026-10-06 建立（清单基线来自当日代码核实）
> **用途**：整体交给 QA 执行 agent（浏览器自动化 + API/DB 取证）做全量黑盒验证；同时作为全平台用户可见功能面的 SSOT 清单。

## 维护规约（强制，与文档同步规范同级）

功能变化必须在**同一提交内**同步更新本标准对应清单，禁止"功能先行、标准欠账"：

| 变化类型 | 触发源（代码位置） | 须更新章节 |
|---|---|---|
| amis 物料 / G3 白名单 | `apps/gateway/src/schema-contract/amis-type-registry.ts`、amis-editor 版本升级 | 矩阵 1（白名单数量/黑名单/别名建议/表单生成器映射） |
| 流程节点类型或配置项 | `packages/studio/src/constants/process/node-meta.ts`、`components/process/configs/*`、`apps/gateway/src/process/node-executor.registry.ts` | 矩阵 2（节点清单/逐节点配置字段/引擎-编辑器对齐差异） |
| 对象字段类型或配置项 | `packages/shared/src/object/index.ts`（FieldType）、`packages/studio/src/constants/fieldTypes.ts`、FieldConfigDrawer | 矩阵 3 |
| 数据流节点 | DataFlowFormModal / DataFlowCanvas 节点结构 | 矩阵 4 |
| 权限模型 | 规则效果/类型/动作/维度/fieldScope 枚举 | 矩阵 5 |
| 页面或路由 | studio `router.tsx`、runtime-ui `router.tsx` | 底册 A–D |
| 账号/种子应用/端口/限流 | `packages/db/seed*.ts`、`playwright.config.ts`、env.validation | 第一节环境事实 |
| 已修复缺陷 | 修复提交 | 第七节回归锚点（追加锚点） |

每次更新在文末「变更记录」追加一行。

---

# 测试计划提示词正文

## 〇、角色与总目标

你是资深 QA 测试工程师，使用浏览器自动化（打开页面、读取内容、截图、点击、填表）模拟真实用户，辅以 API/数据库独立取证，对平台做全量功能验证。三个目标：
1. **全流程贯通**：核心业务场景端到端完整走通；
2. **全功能覆盖、不留任何功能点**：页面上可见的任何功能都必须测到，粒度压到**页面组件×每个属性、流程节点×每个配置项、对象字段类型×每个配置项**，矩阵逐格给结论，不允许任何格子空缺或无解释地跳过；
3. **结论可靠**：每个功能点给出明确四态结论（通过/缺陷/阻塞/待确认），且有证据支撑。

## 一、被测环境事实（以此为准，勿凭记忆假设）

- **入口**：搭建器 Studio `http://localhost:5173`；运行时 Runtime-UI `http://localhost:5174`；API 网关 `http://localhost:3000`（Swagger `/api/docs`）。
- **账号**（租户 slug=`demo`，登录需带；密码 admin123/builder123/user123）：`admin@apaas.dev` 租户管理员（全管理面）/ `builder@apaas.dev` 搭建者 / `user@apaas.dev` 终端用户；`superadmin@apaas.dev` 平台超管（密码 `superadmin123`，登录留空租户）。
- **种子应用（回归基线，禁删改）**：资产管理 `asset_management`、采购合同管理 `procurement`（含金额分支→会签→依次审批流）。新建测试资源一律 `qa_` 前缀。
- **关键机制**：auth 限流 10/min（优先 API 登录复用 token，勿反复 UI 登录）；页面发布走应用级发布向导（页面搭建器无发布按钮）；未发布改草稿不影响已部署环境（bundle 唯一/活表二分）；无驳回边的审批节点运行时必须无驳回入口。

## 二、执行纪律（全程遵守）

1. **先盘点、再设计、后执行**：不得边看边测；先产出功能清单与三大覆盖矩阵再动手。
2. **不臆测**："通过"必须基于页面实际反馈（文案/数据变化/状态变化/跳转）；"没报错"≠通过。
3. **证据留痕**：关键步骤与所有缺陷截图（留档 `gui-test-screenshots/`，按域命名），记录实际文案/数据用于比对。
4. **有始有终**：新增后到列表/详情确认真实生效；编辑/删除/启停/发布后确认结果，并刷新后二次验证。
5. **不中断**：遇阻塞（外部依赖/服务异常/限流）记为阻塞项后继续其他用例，最后汇总。
6. **不越权判断**：业务预期不明的标"待确认"并列疑问，不自行判通过/失败。
7. **分批推进**：按模块分批，每完成一模块输出小结（已测数/缺陷/阻塞）再进下一模块。
8. **负向占比 ≥ 1/3**：每个模块正向走通后，负向与边界用例不低于该模块用例数三分之一。
9. **三源对齐**：凡数值/状态/权限结论，UI 截图 + API 响应 + DB/第二 API 独立取数互相印证；单源结论标"待证"。
10. **全帧异常扫描**：每张截图对每一处状态标签自问"是否与页面其他信息矛盾"（如状态=已发布但按钮仍叫发布）。
11. **矩阵无空格**：三大覆盖矩阵每格必须有四态结论与证据编号；确无法测的写明原因。
12. **覆盖矩阵抽样维**：{草稿,已发布}×{画布搭建,AI/API 创建}×{admin,builder,user}×{dev,prod}，空格即风险项。

## 三、阶段 1：功能盘点（防遗漏）

从首页按导航逐层深度遍历（顶部/左侧导航、Dropdown、弹窗、Drawer、二级页、空状态、Tab、行内操作、更多菜单），直到无未访问入口。**以本清单为底册逐项核对并现场补全**，产出《功能清单总表》（页面×功能点×URL）与覆盖声明（含因权限无法访问的区域）。

**底册 A · studio 应用外（2026-10-13 素蓝改版）**：登录页（分屏融合版：左淡蓝灰品牌栏[方孔a/主张/能力点/天光水印，<960px 隐藏]/右白表单；租户标识选填[tooltip]/邮箱/密码/错误文案/超管与租户用户跳转差异；无 SSO 按钮[网关无 CAS 端点]）；顶栏导航（品牌方孔a+开发中心恒显+用户管理/组织架构/审计日志/观测中心/权限调试[管理员角色显隐]+租户管理[仅超管]；原平台管理 Dropdown 退役）；开发中心首页（问候+搜索[名称/描述过滤并收拢分组]/治理待办条[有待审才出现，GET /apps/reviews/pending-summary，直达审核中心]/指标行[应用/在途实例/今日办结/超时/待审——processes/analytics 全租户]/应用库工具行[＋新建分组/管理分组/刷新]/分组分节[名称字典序+未分组恒最后，空组虚线条]/右轨分组定位轨[计数右对齐+scrollspy 跟随，点击锚点定位]/最近动态[仅管理员可见]/创建 Modal：apiName/名称[≤30]/描述/**分组[AutoComplete 选现有或输新名建组]**（图标/主题色字段已退役）/卡片更多菜单：编辑/**移动到分组**/归档/删除+危险确认/管理分组抽屉[重命名/删空组；拖拽排序未做]；空态/搜索无命中态）。租户管理（创建：名称/slug/描述；Dropdown：详情/挂起/激活；详情页：基本信息+用户 Tab+分配管理员 Modal+应用 Tab）；用户管理（搜索/新建：姓名/邮箱/密码≥6/角色多选/组织多选/删除）；组织架构（树/新建根/子节点/删除/成员 Tag/角色授权与撤销）。

**底册 B · studio 应用内（侧栏 13 菜单）**：工作台（应用头状态/版本/描述、资源统计、快捷入口 3 卡）；顶栏（返回/检查预检 Drawer[立即检查/错误警告计数/问题列表/最近检查时间]/版本历史/发布）；**对象设计器**（对象新建/搜索/删除；字段 Tab：搜索/添加/拖拽排序/必填内联开关/编辑/删除二次确认；视图 Tab：新建[名称/类型列表·详情·表单·看板·日历·画廊/默认]/配置 Drawer[RAQB 筛选/多行排序/字段显隐拖拽]；数据 Tab：总数/全文搜索/字段+操作符筛选/三态排序/分页/行选+批量删除/导入[模板下载/CSV≤5000 行/错误明细]/导出 CSV/新增/记录表单抽屉/编辑/删除）；**页面**（新建 Modal：列表/详情/表单/仪表盘/自定义 5 模板+成对台账勾选；列表：类型图标/草稿已发布 Tag/删除）；**数据集**（数据流：创建/执行/可视化编辑/编辑/删除连带提示；表单 Modal：数据源 List/JOIN 配置/JsonLogic 筛选/分组汇总/输出字段；ReactFlow 画布：5 类节点+节点配置面板+预览[行列数/前 5 列]/执行/保存；数据集 Tab：状态 Tag 空闲·刷新中·就绪·失败/刷新/删除）；**流程**（列表卡片：监控/发布为 API[major+diff]/手动启动/删除；画布详见矩阵 2；监控 3 Tab：运行实例/待办任务/效率分析+实例详情+终止实例；通知模板：列表+新建 Drawer[名称/渠道/标题/正文+插入变量/变量 List/实时预览]）；**审核中心**（3 Tab 待审·已处理·未提交变更；批次条：一键批准拓扑序/批量驳回意见必填；Diff 抽屉：模块配色/来源/diff 绿红橙/快照 JSON/批准[漂移 409 强制批准确认]/驳回意见≤500；未提交 Tab：提交基线/撤销修改/版本历史+审批意见 Timeline）；**发布向导 3 步**（语义化版本+目标环境 Radio+说明必填≤500 → 变更内容分组表 → 确认汇总）；**版本历史**（回滚）；**环境管理**（生产/开发/环境变量 3 Tab；部署 Modal；部署历史+回滚；环境变量：Key 正则/发布必填 G4/敏感 G3/设值 Password/删除）；**API 密钥**（新建/明文一次性展示+复制/吊销/最后使用）；**权限**（角色管理：新建[code 大写]/成员/规则列表；规则编辑 Drawer 详见矩阵 5）；**连接器**（HTTP/Webhook 两类：创建/测试[操作选择/手填 method+path+body/响应展示]/编辑/删除；Webhook URL 展示+复制；凭证：Basic/API Key/Bearer/OAuth2 四类表单与敏感不回显）；**云函数**（新建/编辑[Monaco/Ctrl+S/默认模板]/测试执行[入参 JSON/结果/未发布错误透出]/发布/删除）；**审计日志**（平台级：分类 5/操作/资源类型/用户 ID 筛选+行展开+加载失败重试；应用级同构）。

**底册 C · 平台观测与调试**：可观测中心（4 统计卡[云函数/慢查询/页面报错/开放 API：总数+错误数]/分类+级别筛选/TraceID 截断可复制/行展开 detail）；权限调试页（用户/类型/动作/目标 ID/节点/记录 ID → 结论 Alert/原因 Tag[超管短路·规则放行·无角色·规则拒绝·默认拒绝]/翻译失败 fail-closed 提示/命中规则表/合并条件与 Prisma where 折叠面板）。

**底册 C+ · studio 应用内嵌入集成控制台（2026-10-12，/app/:appId/embed，菜单在 API 密钥旁）**：已发布页面选择器（仅 published）/环境切换（prod/dev）/Embed URL 生成与复制/宿主接入代码片段（createApaasEmbed 最小示例；**双形态切换：npm 包 / SDK 直链**[window.ApaasEmbed 解构，无私有包 import]；runtimeBase 非绝对时 src/allowedOrigin 用显式占位符）/**获取 SDK**（IIFE/ESM 零依赖单文件下载按钮 + 平台直链行 `<script src="…/embed-sdk/embed-sdk.js">`；产物 shared 构建生成 gitignore 随部署分发）/部署配置清单折叠面板（frame-ancestors/VITE_EMBED_ALLOWED_ORIGINS/VITE_RUNTIME_BASE_URL/SDK 产物部署/应用级发布语义）/实时预览（真实 SDK：连接预览/断开/拉取页面数据 rpc/ready 绿标/协议消息流；跨端口部署即真实跨域联调）。

**底册 D · runtime-ui（2026-10-13 素蓝改版）**：登录（分屏融合版同壳：租户必填/无 SSO/联系企业管理员出口；超管登录分流提示不进 /home）；首页（问候+搜索 → 审批待办条[GET /tasks pending，直达任务中心，0 待办隐藏] → 业务指标行[待我审批/本月已办结] → **分组只读分节**[group 归组，无管理入口] + **只读分组定位轨**[分组≥2 才出现，空组不显示] → 卡片=横排头[蓝瓷片+名称]+业务描述+**v版本 · 维护者**+进入；无状态标签/无对象页面流程计数；仅已发布应用卡[runtime=1 过滤+客户端兜底]/超管显式空态+返回登录/加载失败重试态）；应用查看（信息卡+已发布页面网格+类型 Tag）；页面渲染（常驻页面页签导航/高亮/?env= 切换/404 区分 dev-prod 未发布语义/空 schema 提示）；任务中心（待办/已办/我发起的三 Tab/状态 Tag 待处理·已批准·已拒绝·已转办·已取消/已办含审批结果+意见/处理·查看/我发起的=申请内容摘要+实例状态中文标签 运行中·审批中·已完成·失败·已终止+进度弹窗含流程轨迹与审批记录/列表加载失败错误态告警+重试）；任务 Modal（任务详情+申请内容[inputs 摊平+label 映射+创建人姓名]+流程变量折叠区[含任务 ID]/流程轨迹 TraceViewer/绑定页只读渲染/审批意见/批准/拒绝二次确认+未配驳回跳转时禁用并 Tooltip 原因）；站内信铃铛（未读 Badge/全部已读/未读·全部切换/点击已读/相对时间/>20 条提示）；环境切换（prod 默认/dev）；**iframe 嵌入域（2026-10-12，控制台在 studio 底册 B）**：/embed 干净页面（只渲染 page 本体：无页头/无页签/无边距/无登录重定向；404 与 401「等待宿主凭据」分语义）；协议九消息（hello 重试握手/ready/route-change/query-data 带 msgId 回执/navigate/context 全量替换/auth/height-change 自适应/page-event 仅 embedEvent 动作出站/auth-expired 不跳登录）；origin 白名单（VITE_EMBED_ALLOWED_ORIGINS+同源；白名单外静默丢弃）。原 /embed-demo 宿主模拟器已退役（方案一，控制台迁 studio）。

## 四、阶段 2：组件级全覆盖矩阵（本计划核心，逐格给结论）

**矩阵 1 · 页面搭建器：amis 组件 × 属性**
画布物料面板为 amis-editor 6.13 默认全量（未裁剪）；保存时服务端 G3 白名单 162 型（容器 23/表单 77/展示 64，`group` 跨类去重后唯一数 162）拦截，黑名单 `static-file`、`input-cascader`，另有 21 条别名纠正建议。测试法：
1) 遍历物料面板每个分组每个组件拖入画布，每组件一行；矩阵列=「画布渲染 / 属性枚举数 / 保存 G3 结论 / 重进持久化 / runtime(5174) 渲染」五列结论。
2) **属性逐项**：每个组件打开右侧属性面板，按 常规/外观/事件/其他 四个 Tab 枚举每一个可见配置项（记录项名），逐项设非默认值→验证画布即时反映→保存→重进画布确认持久化→runtime 预览确认渲染一致。数据类属性（api/source/字段绑定）额外验证取数正确。
3) 深测组件：crud（分页/筛选/批量/新增/编辑/删除 API 契约）、form（校验/提交/resetAfterSubmit/成功失败提示）、chart 柱·折线·饼（取数非"未知"）、input-file、nested-select、grid/flex 布局、button 与动作组、static 族、mapping 标签渲染。
4) fetcher 适配层：ok 契约错误必 toast（不静默）、列表摊平 count/data 摊平、/api 前缀去重（无 /api/api 404）。
5) 表单生成器 12 映射逐项验证：text/long_text→textarea/number/currency（千分位+precision2）/percent/single_select（options value 回退 label 不回退 id）/multi_select（multiple）/date（YYYY-MM-DD）/date_time（含秒）/auto_number→static 只读/checkbox→switch/attachment→input-file；排除系统字段与流程回写字段。
6) 顶栏功能：预览（2026-10-07 新增，画布内所见即所得预览——当前内存 schema 含未保存修改，预览态数据请求经预览 fetcher 走真实 API、提交落库，编辑类按钮禁用，退出恢复编辑态）/重置（弃本地修改）/撤销/重做按钮（2026-10-07 补齐，接编辑器内置 schemaHistory，与 Ctrl+Z/Ctrl+Y 等效，禁用态随历史事件驱动刷新）/代码 Tab（JSON 编辑+本地预检三规则：根 type=page、body 数组、无外链 URL+校验并应用）/runtime 预览/?env=dev/保存（非脏禁用）/未保存 Tag 真实性（外部改数据后重进不误标）。
7) 疑点核实（先核实再定性）：存档点 API 存在但无 UI 入口；详情/仪表盘/自定义模板生成空白 scaffold 是否符合预期。
8) 平台字段绑定（2026-10-07 专项，v2 原生接管）：禁用内置 FormPlugin、由平台子类（ApaasFormPlugin）接管 form 节点——原生「字段名」输入框的感叹号弹窗（ae-DataBindingControl）变为对象字段选择器：字段按所属对象分组（组头=对象字段（form 标题））、官方自带搜索、列表项=纯显示名，选中经「确认」写回 name 并联动控件标题；绑定对象按 form 解析（api.url 优先，页面级 data.objectId 兜底，同页多表各归各）；类型兼容专项（v3）：选择器按目标控件类型经 field-control-compat 矩阵软过滤——兼容组在前、不兼容字段折叠为「类型不兼容（控件 <type>）」组（矩阵锚=fieldToFormControl 生成映射的镜像，矩阵外控件不过滤）；保存时 collectFieldBindingIssues 区分两类告警（kind=unknown_field 未匹配字段 / kind=type_mismatch 类型不兼容，弹窗分类统计+「控件 X ↔ 字段 Y」标注，均非阻断可强制保存）。

**矩阵 2 · 流程设计器：节点类型 × 配置项（18 种全测）**
通用项（所有节点）：标题编辑+删除节点 Popconfirm+已发布只读。逐节点配置字段：
- **trigger**：triggerType 7 种（记录创建/更新/删除、定时、手动、API、按钮）；记录类：objectId+event Radio+condition 表达式；定时：cron+4 预设。注意触发器有两处配置（节点面板 vs 顶栏触发器 Tag Modal），验证二者同步与回退草稿行为。
- **start**：输入参数（画布内建表单 ${} 模板）；**end**：outputs JSON。
- **object_operation**：operation（create/update/query/delete）×objectId×fieldMapping 键值行编辑器×filter×resultVariable（按 operation 联动显隐）。
- **batch_operation**：operation×objectId（范围 inputs/filter，上限 500 行为）。
- **condition/inclusive**：分支列表（label+RAQB 条件编辑器→JsonLogic）、优先级 Tag、至少 2 分支、默认分支不可删；inclusive 语义=全满足并行。
- **user_task（审批）**：taskName 必填；assigneeType 5 种（USER/INITIATOR/ROLE/ORG/FORM_FIELD——INITIATOR 发起人审批免填审批人[R1]；ORG=组织下拉写候选组[组织 ID]，任务中心按「角色∪组织」匹配[R2]；FORM_FIELD=触发记录字段 apiName 动态取审批人，仅记录触发[R2]；SUPERVISOR 上级主管已摘除[R2 裁决：schema 无主管数据源]）；assignee 单人 vs approveUsers 多选 vs candidateGroups 角色/组织；approvalMode 4 种（单人/会签全票/或签任一/依次——非 USER 类型仅单人）；pageId 表单绑定；dueDate+dueUnit；allowReject+rejectToNodeId 联动；**timeoutAction 超时动作**（dueDate×dueUnit 到点：notify 催办/auto_approve 自动通过/auto_reject 自动驳回[需 rejectToNodeId]，TC-177~179）+「超时动作」面板下拉；writeback 三件套（field 过滤系统字段/approveValue 单选字段出选项下拉否则 Input/rejectValue 可空）；抄送四件套（ccEnabled/ccAssigneeType/ccRecipients/ccTrigger 三时机）。
- **notification**：channel 3（EMAIL/IN_APP/WEBHOOK）×templateId 自动填充×recipients 逗号+${} 变量×title/content 必填+插值。
- **http_request**：连接器模式（connectorId→operationId 或 method+path+BaseURL）vs 直连模式（method 5 种+url）；headers 映射；body（POST/PUT/PATCH 显隐）；responseMapping（JSONPath→变量）。
- **assign**：variableName+四态值编辑器（常量/引用 TreeSelect/表达式/模板）；**delay**：duration+unit 4 种；**loop**：collection 路径+maxIterations 1..1000；**wait_for_condition**：JsonLogic+pollIntervalMs≥1000+timeoutMs；**sub_process**：subProcessKey（已发布流程 Select/手输 apiName）+defId+sync；**break/continue/parallel**：无配置（验证说明文案）。

画布与顶栏：节点面板搜索+4 分组+拖拽与"+"添加、返回未保存确认、撤销/重做、预览 Modal、保存、发布预检（配置缺失硬闸文案）、转为草稿编辑、缩放工具（缩小/百分比/放大/适应/纵横切换）、beforeunload。
配置持久化往返专项：**每种节点配置完→保存→刷新重进画布→逐字段核对不丢**（历史 #10/#12/#17 高发区）。
引擎-编辑器不对齐核实（标待确认或缺陷）：cloud_function 节点引擎有但物料无；object_operation 的 UPSERT；wait_for_condition 超时出边；dueDate 引擎未消费。

**矩阵 3 · 对象设计器：字段类型 × 配置项（18 种全测）**
通用项：显示名≤40+拼音建议 apiName（创建后锁定）/描述/必填/唯一/可搜索 Switch/默认值/类型创建后不可改。逐类型：text·long_text·rich_text（最大长度 1-10000+默认值）；number·percent（小数位 0-10）；currency（小数位+货币 CNY/USD/EUR/GBP/JPY/HKD）；auto_number（{seq} 规则如 ORD-{seq:0000}，表单只读+并发不重号）；single_select/multi_select（选项管理：颜色/名称/存储值留空回退 label/默认互斥/增删）；date（3 格式）；date_time（3 格式）；checkbox（默认 Switch）；attachment；user（允许多选）；lookup（目标对象/一对多·多对多/反向字段名）；sub_form（暂无额外配置 UI——疑点）；formula（无表达式编辑 UI——疑点，验证记录端只读）；rollup（关系字段/聚合 sum·avg·count·min·max/目标字段联动隐藏）。每类型验证三段：配置保存→记录表单渲染控件正确→数据写读回一致+校验负向（必填/唯一/长度/格式）。

**矩阵 4 · 数据流：节点 × 配置项**：数据源（对象+别名）/JOIN（左右别名/左·内关联/左右字段）/筛选（JsonLogic）/分组汇总（分组字段+指标[字段×函数 5 种×输出列名×显示名]）/输出字段（源/别名/标签/类型）；join 键契约专项（左表裸键/右表 {alias}_ 前缀/聚合禁点路径——历史 bug 高发）；预览/执行/物化状态流转/刷新中禁用。

**矩阵 5 · 权限规则编辑器**：效果（ALLOW/DENY）×类型 5（RECORD/PAGE/PROCESS/DATA_MODEL/CONNECTOR）×动作 7（VIEW/CREATE/EDIT/DELETE/EXECUTE/APPROVE/MANAGE）×目标（通配/具体资源）×行级条件（RAQB+__currentUser）×列级 fieldScope（ALLOW 勾选可见/DENY 勾选隐藏）×增删规则×全量替换保存语义；组合抽样验证 deny-overrides 与默认拒绝。

## 五、阶段 3：用例设计维度

对清单与矩阵中每个功能点按适用维度设计：正向主流程/字段校验（必填·格式·长度上限·特殊字符·emoji·前后空格）/边界（空列表·首末页·最大值·0·负数）/异常操作（留空提交·非法格式·重复提交·未保存离开）/状态与联动（前置状态校验；状态流转后其他页面同步）/列表类（筛选·精确模糊无结果搜索·排序·分页·批量）/会话行为（刷新保持·前后进·退出后受保护页不可达）。

## 六、阶段 4：端到端贯通（每步记 操作→预期→实际→结论→截图；中途失败定位上游或本环节）

1. **搭建链**：建 qa_ 应用→对象（含全字段类型）→页面（模板+画布深组件）→流程（分支+会签+回写+通知）→预检→发布向导→部署 dev/prod→runtime 渲染。
2. **AI 链**：MCP 单波草稿（对象+页面+流程+数据集+权限）→审核中心 diff→批次一键批准（拓扑序+@ref 令牌落地）→发布→运行；G3 校验器负向（缺 options value/聚合点路径/右表裸键/非法 JsonLogic）。
3. **业务链**（user）：提交申请→台账可见→审批人任务中心→通过腿（回写通过值+站内信）与驳回腿（rejectToNodeId+回写驳回值+申请人站内信）双走→台账中文标签→刷新二次验证。
4. **数据链**：多对象录入→数据流 join+聚合→数据集就绪→仪表盘图表→数值与 API/SQL 独立对账逐项相等。
5. **权限链**：建角色+行级条件规则→提交人审→批准落地→user 视角台账/API/DB 三方计数一致→权限调试页 explain 对账。
6. **开放链**：API Key 创建→/open 启动流程→major 钉版（旧 major 仍可调）→吊销即 401。
7. **治理链**：草稿提交→PENDING 不落活表→驳回意见回传→同资源二次提交不误报漂移→漂移 409→强制批准路径。
8. **观测链**：全链操作后审计日志逐条对账（操作人/分类/资源）+traceId 串联+可观测事件四分类+流程效率分析与实例对账。

## 七、历史缺陷回归锚点（每个必有显式用例）

条件分支驳回路由（#17：通过边与驳回边各走一次核对落点）；角色审批链路（candidateGroups 值=角色 ID）；对象操作 fieldMapping 持久化（#10）；FieldMapper 添加行不死循环（#11）；审批页统一只读不可再提交；申请表单排除回写字段而台账显示且中文标签；审计无权限显式 403 态非空表；UTC 截断与裸 cuid 收敛（姓名/中文时间）；治理基线二次提交不误报；join 双别名/聚合行键；api.url @ref 令牌无双前缀；fetcher 失败必 toast；"未保存"误标；无驳回边无驳回按钮；发布审计归 APPLICATION 模块。

**修复轮追加锚点（2026-10-06，QA-FULL-REPORT §10）**：记录写路径服务端校验（必填 400/超长 400/唯一 409，D-002）；数据流表单分组汇总 groupBy 数组提交+执行 READY（D-005）；成对台账含回写状态列且中文标签（D-004，前 5 列+回写列必入）；权限规则 Drawer 打开即加载字段（D-006）；登录失败中文文案（D-001）；角色编码大写校验 400（D-007）；user_task 切审批人类型清理旧字段（D-009）；fetcher GET 失败弹 toast 且 401 除外（D-010）；排序三态循环（D-008 撤销复验）。

**用户实测追加锚点（2026-10-06 晚，用户发现）**：流程监控页运行实例列表点"详情"——弹窗正常渲染（流程/状态/耗时/实例 ID + 节点执行状态列表），不整页崩溃（D-011：后端 /instances/:id 返回扁平 DTO 与 shared ProcessInstanceReport {instance,nodes} 契约漂移，前端 api 层 getInstance 单点适配 nodeExecutions→nodes）；左侧应用菜单宽度与收起按钮贴底（UI 布局回归：sider-children flex 列布局使菜单拉伸、按钮距底 8px）。**教训锚点：监控页二级交互（实例详情/终止实例）必须显式点击验证——结构走查不覆盖弹窗内数据契约。**

**纪律红线补测轮锚点（2026-10-06 深夜，AGENTS.md 红线第 8 条设立后 TC-134~148）**：监控页终止实例（等待中→已终止）；人工任务处理面板三按钮（驳回/转办/通过）与通过动作链路；效率分析 6 统计卡+拆分表且耗时取整（D-012）；通知模板 Drawer 双变量添加不崩溃+实时预览示例值替换+保存（D-014 Form.List undefined 槽位 filter(Boolean)）；通知节点模板下拉出现已建模板（D-015 templateOptions 接线）；环境变量 G3 敏感 Password 不可读+G4 必填标记+部署历史回滚按钮（TC-139）；新用户创建→登录→角色绑定全链（TC-141）；Webhook 连接器 URL 展示+复制（TC-142）；**旧 major 兼容：release major2 后 latest=major2 且 major/1 钉版仍可调**（TC-143）；**dev 发布指针迁移 prod 不动**（TC-144：dev=0.5.0/prod=0.4.0）。

**字段绑定专项锚点（2026-10-07，feat/field-binding-picker）**：表单控件「对象字段绑定」下拉写回 name 且原生「字段名」同步（TC-149）；保存时字段名错配告警非阻断可强制保存（TC-150）；绑定语义=控件 name=字段 apiName 经 form.api 提交写记录（服务端不拒未知键，实测静默落库——手输写错必须靠本告警拦截）。

**R5.5 运行时闭环锚点（2026-10-09，AI 主线五轮补全）**：**AI 生成应用运行时闭环全链（TC-152，AI 生成=可交付的验收定义）**——小额一级批准/大额二级复核（复核任务必须真实出现在二级审批人待办）/驳回三断言：记录状态 writeback 精确匹配 + 发起人通知送达 + 行级条件过滤无泄露；**引擎决策回归锚点**：decision 边条件在调用方传 approve/APPROVE 等非规范输入时仍必须真实路由（修复前：决策变量无顶层别名+值未规范化 → 条件边全不匹配 → 实例 COMPLETED 零回写零通知静默终结）；**改稿收编（TC-153）**：PENDING 草稿收编后版本链 SUPERSEDED+HUMAN APPROVED 双行溯源 + review:adopted 遥测。

**R5 遗留修复轮锚点（2026-10-10，用户裁决四问题）**：**runtime 应用列表运行时视图过滤（TC-155，服务端语义变化）**——`GET /apps?runtime=1` 仅返回已发布且有权限应用（isSuperAdmin 短路/租户级通配 ALLOW=全部已发布[种子 END_USER 语义，R5 裁决①维持]/仅应用级规则按 appId 归纳/无角色默认拒绝）；无参数仍全量（studio 兼容，e2e/22 已断言）；**超管登录 runtime 分流（TC-154）**——runtime 登录页超管提示不进 /home 不写共享 store；/home 对超管 token（含 hash token 注入路径）显式空态+返回登录，非静默"暂无可用应用"；**e2e 限流环境**——登录 429 必须带排查指引报错（不得伪装成"任务超时"），22/23 发布版本号与探针 apiName 防碰撞；**台账 mapping（TC-129 备注）**——老页面/AI 生成页 schema 无 mapping 显示裸值为已知边界（根因=存量 schema 缺配置，非生成器/渲染器缺陷；用户裁决暂不处理）。

**AI 主线 R6 锚点（2026-10-16）**：AI 生成页面两契约——台账单选列中文标签（type:mapping+map，TC-182）与 input-datetime valueFormat（TC-183）；外部 agent 姿态=/api/v1/mcp HTTP 直驱（Bearer JWT，Accept 双类型）；生成质量指标基线（首拦 10%/一次通过 88.9%/返工 0.128）见 AI-MAINLINE-R6-FRESH-DATA-2026-10-16。

**流程引擎 R3 锚点（2026-10-15，S1+S2+explain）**：①审批超时边界（TC-177~179：dueDate×dueUnit+timeoutAction 到点动作——auto_approve 端到端实测/auto_reject 需 rejectToNodeId[G3 拦截]/notify 催办站内信；jobId 禁冒号+自我取消 best-effort 两坑回归）；②节点失败错误出口（TC-180：error/失败 出边路由+NodeExecution FAILED 留痕+_routing 决策留痕）；③权限决策按应用域（TC-181：explain 按目标资源过滤 app 级规则，租户通配不变）；④retryable 分类（NonRetryableNodeError 不重试）。

**流程引擎专题推送轮锚点（2026-10-15）**：①组织树读端点权限语义变化——GET /permissions/orgs、/orgs/:id 从租户管理员放开到登录用户（画布 ORG 审批人下拉基础数据，TC-175 走查实测 builder 403 静默空下拉后修复；写操作/成员/授权明细仍管理员）；②FORM_FIELD 审批人校验加严——字段值须命中本租户用户，否则实例报清晰错误（TC-176）；③矩阵 2 user_task 行 assigneeType 5 种（USER/ROLE/ORG/FORM_FIELD/INITIATOR，SUPERVISOR 已摘除）与组织下拉/字段输入交互已按走查用例覆盖。

**流程引擎修缮轮锚点（2026-10-17，I-1+G3 软告警）**：①**画布触发器记录触发命中（TC-184，I-1 修复=触发语义服务端变化）**——画布触发器节点（顶层 triggerType 未同步亦可）发布后，向绑定对象提交记录必须自动建实例（triggeredBy=RECORD_CREATED）；更新记录不触发（事件类型匹配）；触发节点绑定对象时其他对象事件不误触发；种子/AI 建流（无触发节点，顶层列）行为不变；②**发布预检渲染契约软告警（TC-185）**——预检 Drawer/检查报告对「crud 选择列缺 type:mapping+map」「input-datetime 缺 valueFormat」出 WARNING（status 仍 PASS 不拦截）；⚠️ 存量坏配置页面自此开始出警告属**预期行为**非缺陷；③模板生成器表单 date_time 控件现带 valueFormat（生成页提交日期字符串）。详见 PROCESS-ENGINE-I1-TRIGGER-SCHEMA-2026-10-17.md。

**任务中心修复轮锚点（2026-10-10；TC 改号 TC-170/157/158→TC-170/171/172，2026-10-15 合并轮避免与嵌入域撞号）

PLACEHOLDER，用户报告"待办已办为空"调查）**：**终端用户任务中心可用（TC-156，权限语义变化）**——END_USER 种子角色补 `PROCESS VIEW`（修复前 GET /tasks 要求 PROCESS:VIEW 而 END_USER 只有 EXECUTE/APPROVE → 403 被前端吞成空表：被授权审批的角色打不开任务中心）；规约=**运行时角色（需用任务中心）必须含 PROCESS VIEW**（app 级自定义角色建角色时同样适用）；seed 权限规则改为先删后建幂等收敛（permission_rules 无唯一索引，createMany+skipDuplicates 实际不去重，历史已累积 END_USER ×3/BUILDER ×2 副本）；**列表加载失败错误态显式化（TC-157）**——任务中心三个列表查询失败渲染红色告警+原因+重试（ListErrorAlert），禁止吞成"暂无任务"假空态；**我发起的视图（TC-158）**——`GET /instances/mine` 按 triggerContext.triggeredByUser 过滤发起人本人（与撤回/M-2 实例可见性同语义），前端三 Tab+进度弹窗（TraceViewer 轨迹+审批记录），申请人提交后可查进度（对标飞书 aPaaS「我发起的」）。

## 八、缺陷记录标准

每条含：编号/标题/模块页面/精确复现步骤（含输入内容）/预期 vs 实际/截图/严重级别/是否有替代路径/关联 API 请求响应与 traceId/影响矩阵格位。判级：**P0** 阻断（核心流程走不通·数据丢失错误·页面崩溃·越权）；**P1** 严重（主要功能结果错误·校验缺失致脏数据·审批误路由）；**P2** 一般（次要功能异常·有替代路径的体验问题·静默失败）；**P3** 轻微（文案·样式·提示）。链路中途失败须定位上游数据问题还是本环节缺陷并注明影响范围。

## 九、最终交付物

1. 《功能清单总表》：页面×功能点×已测×结论+覆盖率统计+覆盖声明；
2. 《三大覆盖矩阵》：amis 组件×属性（五列结论）、流程节点×配置项、字段类型×配置项，每格四态结论+证据编号，空格注原因；
3. 《用例执行结果》：编号/前置/步骤/预期/实际/结论/证据；
4. 《缺陷清单》：按级别排序，含复现与截图；
5. 《全流程贯通报告》：八条链路逐步结果与最终判定；
6. 《总结与风险评估》：整体结论/主要风险/阻塞与待确认项（含第七节疑点核实结论）/改进建议。

## 十、红线

不修改任何产品代码与测试代码让失败变绿；无证据不下结论（记录准确性）；种子应用与共享环境禁破坏性操作（一切破坏性动作限 qa_ 前缀自建资源）；阻塞不卡死；账号限流敏感（API 登录+token 复用）。

---

## 变更记录

| 日期 | 版本 | 变更 | 来源 |
|---|---|---|---|
| 2026-10-06 | v1.0 | 建立标准：十四域提示词升级为组件级全覆盖版（三大覆盖矩阵+四底册+八条 E2E 链+回归锚点），清单基线当日代码核实 | 用户要求全功能覆盖到组件×属性粒度 |
| 2026-10-06 | v1.0.1 | 事实修正（全量 QA 实测发现）：G3 白名单 166→162（容器 23/表单 77/展示 64，group 去重）；别名建议 19→21 条；补记 superadmin 密码 superadmin123。测试结果见 docs/testing/QA-FULL-REPORT-2026-10-06.md | QA 全量执行（组件级全覆盖） |
| 2026-10-06 | v1.0.2 | 修复轮同步：第七节追加 9 条修复锚点（D-001/002/004/005/006/007/009/010 + D-008 撤销复验）；维护规约表映射不变（已修复缺陷→第七节） | 缺陷修复轮（fix/qa-defects-2026-10-06） |
| 2026-10-07 | v1.0.3 | 字段绑定专项：矩阵 1 追加第 8 条（对象字段绑定插件面板+保存校验）；第七节追加专项锚点 | feat/field-binding-picker |
| 2026-10-07 | v1.0.4 | 字段绑定专项 v2：独立注入面板退役，原生字段名选择器接管（FormPlugin 子类提供数据源）；多表按 form 解析；矩阵 1 第 8 条改写 | feat/field-binding-picker |
| 2026-10-07 | v1.0.5 | 类型兼容专项：矩阵 1 第 8 条补选择器软过滤与保存告警两类区分（兼容矩阵=生成映射镜像） | feat/field-binding-picker |
| 2026-10-07 | v1.0.6 | 页面搭建器顶栏补撤销/重做按钮；矩阵 1 第 6 条同步 | 撤销重做入口 |
| 2026-10-07 | v1.0.7 | 页面搭建器画布内预览功能；矩阵 1 第 6 条同步 | 预览功能 |
| 2026-10-10 | v1.0.8 | R5 遗留修复轮：底册 D 补 runtime 首页过滤语义与超管空态/登录分流；第七节追加「R5 遗留修复轮锚点」（TC-154/TC-155/e2e 限流环境/台账 mapping 边界） | 用户裁决四问题修复（追加 R5 分支） |
| 2026-10-13 | v1.0.9 | 素蓝设计轮：底册 A 改版（分屏登录/顶栏导航/开发中心首页[待办条/指标行/分组平铺/定位轨/管理抽屉/分组字段，图标主题色退役]）；底册 D 改版（审批待办条/业务指标/分组只读分节/只读定位轨/版本·维护者卡片） | 用户定稿素蓝视觉世界（impeccable 轮） |
| 2026-10-12 | v1.0.9 | iframe 嵌入专项：底册 D 追加嵌入域（/embed 干净页面 //embed-demo 宿主模拟器/协议九消息/origin 白名单），对应用例库 TC-156~158 | feat/embed-iframe-integration（G3 白名单新增 embedEvent） |
| 2026-10-12 | v1.0.10 | 方案一转正：底册 C+ 新增 studio 嵌入集成控制台（/app/:appId/embed）；底册 D 的 /embed-demo 标注退役；TC-156/157 载体改指控制台 | 用户裁决方案一（控制台迁 studio，跨端口真跨域预览） |
| 2026-10-12 | v1.0.11 | SDK 交付：底册 C+ 控制台补「获取 SDK」（IIFE/ESM 下载+平台直链）与片段双形态（npm/SDK 直链）；TC-159 入库 | 第三方对接断链补全（私有包不可达→零依赖单文件分发） |
| 2026-10-10 | v1.0.12 | 任务中心修复轮：底册 D 任务中心更新为三 Tab（我发起的+进度弹窗+错误态）；第七节追加「任务中心修复轮锚点」（TC-170 END_USER 补 PROCESS VIEW + seed 幂等收敛 / TC-171 错误态显式化 / TC-172 我发起的视图） | 用户报告"待办已办为空"调查修复轮 |
| 2026-10-17 | v1.0.13 | 流程引擎修缮轮：第七节追加「流程引擎修缮轮锚点」——TC-184 画布触发器记录触发命中（I-1 修复，触发匹配改读 schema 触发节点+活表 PUBLISHED 统一）与 TC-185 发布预检渲染契约软告警（crud 选择列缺 mapping/datetime 缺 valueFormat 出 WARNING 不拦截；存量坏配置出警告=预期行为） | 流程引擎修缮轮（用户裁决修法②） |
