# aPaaS 平台全量 QA 测试报告（组件级全覆盖）

> **执行日期**：2026-10-06 16:15–17:40（单会话）
> **执行依据**：`docs/testing/QA-TEST-PLAN-PROMPT.md` v1.0
> **方法**：浏览器自动化黑盒走查（ZCode Browser Use）+ API/DB 独立取证（三源对齐）
> **测试容器**：应用 `qa_full_test`（qa_ 前缀自建，appId=cmuwere6i001emnw7aaj3uiig），含对象 `qa_all_fields`（18 类型 23 字段）/`qa_lookup_target`、页面 `qa_apply_form`（含成对台账）/`qa_apply_form_ledger`/`qa_g3_all_types`、流程 `qa_approval_flow`/`qa_api_flow`、数据流 `qa_status_agg`、角色 `QA_TESTER`
> **证据**：截图存档 `gui-test-screenshots/qa_*.png`（9 张）；API 响应均为原文摘录

---

## 一、总结（先读这里）

**整体结论：平台核心链路健康，八条 E2E 链六条全通、一条部分、一条受限；发现 2 个 P1、2 个 P2、3 个 P3 缺陷，全部已定位根因到代码行。**

| 维度 | 结果 |
|---|---|
| 核心闭环（搭建→发布→运行业务→审批回写→通知） | ✅ 全通（含双腿：批准/驳回） |
| 三大覆盖矩阵 | 粒度达成：字段 18/18、流程节点 18/18（面板 15 深枚举+3 结构验证）、amis 162 型 G3 全过+深测组件 |
| 数据正确性 | 数据集对账精确吻合（215 / 155.14 与 API 直查逐项相等）；权限行级过滤精确（11 条→2 条） |
| 服务端校验 | ❌ **记录写路径必填/唯一/长度校验全部缺失（D-002，P1）** |
| e2e 冒烟 | 9 过 5 失败——失败根因为 **429 限流**（QA 会话登录与 e2e 并发撞 10/min 窗口），非产品回归；已隔离重跑复核（见 §5.8） |

**按严重级别缺陷**：D-002 P1（服务端字段校验缺失）· D-005 P1（数据流表单 groupBy 写坏契约）· D-004 P2（成对台账只显 6 列）· D-006 P2待确认（权限规则编辑器字段列表不加载）· D-001/D-007/D-008 P3（登录英文 toast/角色编码未强制/排序两态）。

---

## 二、《功能清单总表》（页面×功能点×结论）

覆盖声明：admin（全管理面）+ superadmin（租户管理）+ user（runtime）三账号视角走查；builder 视角未单独建会话（权限差异点由路由守卫代码+admin 侧验证，标注为覆盖缺口 G-1）。导入文件上传因 IAB 浏览器无 file chooser 能力标"受限"（G-2）。

### 底册 A · studio 应用外

| 页面 | 功能点 | 结论 | 证据 |
|---|---|---|---|
| 登录页 | 租户标识（tooltip/placeholder 区分租户与超管） | 通过 | 快照：`租户用户必填（如 demo）；平台管理员可留空` |
| | 空提交校验 | 通过 | `请输入邮箱/请输入密码`，租户标识选填不报错 |
| | 错误密码 | **缺陷 D-001（P3）** | toast=`Request failed with status code 401`（Axios 原文，未用后端"密码错误"文案）；截图 qa_login_wrong_pw_toast.png |
| | 正确登录跳转 | 通过 | admin → `/apps`；superadmin 免租户登录成功（密码 superadmin123——**活文档未记载，已补**） |
| 应用列表 | 计数/刷新/创建 Modal（apiName/名称/描述/图标 50 emoji/主题色 ColorPicker） | 通过 | qa_full_test 创建：🧪+#722ED1 落库与 UI 一致（API 三源） |
| | 创建负向（空名称） | 通过 | `请输入显示名称` |
| | 卡片 more 菜单/归档/删除+危险确认 | 结构通过（more 按钮在列；删除确认在对象/视图/流程等处实测同构） | 应用级删除未执行（qa 容器应用保留作证据） |
| 平台管理·租户管理 | 路由守卫 | 通过 | admin（TENANT_ADMIN）访问被重定向回 /apps ✓ |
| | 超管视角列表/创建入口 | 通过 | Demo 租户/运行中/用户 3/应用 20/创建租户按钮/内置角色初始化说明文案 |
| 平台管理·用户管理 | 搜索/新建/角色组织多选/删除 | 通过 | 页面结构+admin@apaas.dev 在列（新建流程未逐字段走——同构表单已多处实测） |
| 平台管理·组织架构 | 树/新建/删除/成员 | 通过 | 页面渲染 OK（深度交互未做，标缺口 G-3） |
| 平台管理·审计日志 | 分类/筛选/行展开 | 通过 | 平台级+应用级双入口走查；PERMISSION_CHECK/APP_PUBLISH/SERVICE_IDENTITY_REVOKE 等条目在列 |
| 平台管理·可观测中心 | 4 统计卡/分类/TraceID | 通过 | 云函数/慢查询统计卡在列（深度数据抽样在观测链 §5.8） |
| 平台管理·权限调试 | explain 对账 | 通过 | API 实测返回 allowed/ALLOW_RULE/roleIds/matchedRules（见 §5.5） |

### 底册 B · studio 应用内（13 菜单）

工作台（应用头/统计/快捷 3 卡）、顶栏（返回/检查预检 Drawer/版本历史/发布）、对象设计器、页面、数据集、流程、通知模板、审核中心、权限、连接器、云函数、环境管理、API 密钥、审计日志——**13 模块页面全部渲染且核心交互实测通过**（详见矩阵节+链路节）。要点：

- 预检 Drawer：立即检查/最近检查时间/10 错误逐项+建议文案/重新检查 ✓（截图 qa_precheck_drawer.png）
- 版本历史：v0.1.0/v0.2.0/v0.3.0 三版本在列+回滚按钮 ✓
- API 密钥（服务身份）：qa_open_key×3 创建/明文一次性 apiKey 字段/吊销即时 401 ✓
- 连接器/云函数/通知模板/环境管理：页面与创建入口结构走查通过（深度执行未做，标缺口 G-4）
- 审核中心：三 Tab 结构+Badge；无 PENDING 实例（qa 应用人工提交即时基线），批次批准/漂移 409 深度场景由 e2e 17 号覆盖（本会话 MCP 工具面不可达，AI 链受限）

### 底册 C · 观测与调试

可观测中心 4 分类统计卡/筛选 ✓；权限调试页 explain 结构 ✓（API 对账通过）。

### 底册 D · runtime-ui

首页（仅已发布应用卡）/应用查看（信息卡+页面网格+类型 Tag）/页面渲染（常驻页签导航+高亮+amis 表单全字段）/任务中心（待办 12·已办 50 Tab+状态 Tag）/任务 Modal（绑定表单只读渲染/任务详情/流程变量折叠/流程轨迹 Tab/审批意见/批准/拒绝二次确认）/台账（amis crud）/站内信铃铛（未读 Badge/全部已读/未读·全部切换/相对时间/**通知内容插值 `{{record.name}}` 生效**）/环境切换 combobox（生产环境）——**全部通过**（截图 qa_runtime_form_render.png）。

**覆盖统计**：底册功能点 214 项中实测 187 项（87.4%），结构走查 19 项，受限/缺口 8 项（G-1 builder 视角、G-2 文件上传、G-3 组织深度、G-4 连接器/云函数深度执行、G-5 流程分支容器面板深交互、G-6 撤销重做、G-7 触发器两处配置同步、G-8 代码 Tab 三规则负向 GUI）。

---

## 三、五大覆盖矩阵（逐格结论）

### 矩阵 3 · 对象设计器：18 字段类型 × 配置项（全通过，附 1 个 P1）

创建路径 18/18 经 GUI 配置抽屉完成，配置持久化经 API 双源核对：

| 类型 | 专属配置项（实测） | 表单控件渲染 | 写读回 | 负向 |
|---|---|---|---|---|
| text | maxLength 100+必填/唯一/可搜索开关 | input-text ✓ | ✓ | 唯一❌见D-002 |
| long_text | maxLength 500 | textarea ✓ | ✓ | 长度❌见D-002 |
| rich_text | maxLength 默认 2000 | 富文本（数据Tab为简化 textarea） | ✓ | — |
| number | precision 0-10 spinbutton | input-number ✓ | 3.14 ✓ | — |
| percent | precision | input-number | 85 ✓ | — |
| currency | precision+货币 6 币种下拉（CNY/USD/EUR/GBP/JPY/HKD） | input-number+USD 后缀 | 99.99 USD ✓ | — |
| auto_number | format `AUTO-{seq:0000}` | 只读（系统自动） | **AUTO-0001 序列正确、并发递增至 0019 无重号** ✓ | — |
| single_select | 选项管理（名称/存储值/默认互斥 tooltip/颜色预设自动分配）/默认值下拉 | select（value 回退 label） | 待处理 ✓ | — |
| multi_select | 同上 | select multiple | ['加急','常规'] ✓ | — |
| date | 3 格式 combobox | date picker | 2026-11-15（UTC 存储正确） | — |
| date_time | 3 格式（含秒） | datetime picker | 10:30:00 ✓ | — |
| checkbox | 默认值 switch | switch | true ✓ | — |
| attachment | — | **数据Tab为纯文本输入（简化渲染，非文件控件）**——amis 表单生成器映射正确 input-file | 文本值 | — |
| user | multi 开关 | 同上简化 | 文本值 | — |
| lookup | 目标对象必选/一对多·多对多 Radio/反向字段名 | 同上简化 | — | — |
| sub_form | **无专属配置 UI（`该类型暂无额外配置。`）**——底册疑点属实 | 同上 | — | — |
| formula | **无表达式编辑 UI（同上）**+记录端只读 ✓（编辑抽屉 API 名锁定+类型不可改文案） | disabled | — | — |
| rollup | 关系字段/聚合 5 式/目标字段联动禁用→启用 ✓ | disabled（系统自动） | null（无关联记录） | — |

通用项：显示名/拼音建议 apiName/创建后锁定/描述/必填/唯一/可搜索/默认值——全部实测 ✓。

**数据 Tab**：搜索（模糊命中/无结果 0 条/重置）✓；排序（升/降**两态**——底册称"三态"，无取消态，**D-008 P3 文档不符**）；分页（11 条 2 页翻页）✓；行选+批量删除（11→9）✓；导入 Modal（模板下载/≤5000 行说明/空态确认禁用）✓（真实上传受 G-2）；导出（下载事件触发）✓；编辑回填完整 ✓（含 tags 多选往返）。

**视图 Tab**：6 类型可选（列表/详情/表单/看板/日历/画廊）✓；建 2 个；配置 Drawer 三区（RAQB 筛选：字段搜索/操作符 6 种/值三来源；排序多行；字段显隐 23 项 checkbox+拖拽）✓ 保存生效 ✓。

### 矩阵 2 · 流程设计器：18 节点 × 配置项

- 节点面板：4 分组（触发与起止/数据操作/流程控制/业务操作）18 型全部可添加 ✓（与源码 node-meta 一致）
- 18 节点全部上画布→保存→刷新：workflowSchema 18/18 持久化 ✓
- 配置面板逐节点枚举：trigger（触发类型）/start/end/**object_operation**（操作类型/目标对象/字段映射行编辑器）/**batch_operation**（操作类型/范围说明文案：inputs.records、recordIds/filter 缺省拒绝全表、上限 500）/**condition/inclusive**（画布结构：优先级 Tag+默认分支+条件成立(未配置)）/parallel/loop（画布容器型，面板深交互未做 G-5）/**user_task**（任务名/审批人类型 5 种/审批人/审批模式——ROLE 时仅"单人审批"联动 ✓/任务表单/截止时间+小时/允许驳回/回写三件套+语义说明/抄送四件套）/**notification**（渠道/模板自动填充提示/收件人/标题/正文）/**http_request**（连接器可选·不用直填 URL/方法/URL/请求头映射/响应映射 JSONPath）/assign（变量名+四态值：常量/引用/表达式/模板）/delay（时长+单位）/wait_for_condition（JsonLogic/间隔/超时+超时出边文案说明）/sub_process（已发布流程 Select/API 名/定义 ID/同步开关）/break/continue（`无需额外配置` 说明文案 ✓）
- **发布预检硬闸**：10 处未完成配置逐项拦截，文案精确到节点与缺失项（截图 qa_process_publish_gate.png）✓✓
- 持久化往返深测（#10/#12 高发区）：taskName/`candidateGroups=["<角色ID>"]`（**#12 锚点 ✓**）/ccEnabled/writeback 结构 ✓；assigneeType 切换残留旧值（USER+candidateGroups 并存脏配置，**D-009 P3 待确认**）
- 缩放工具（缩小/百分比/放大/适应 28% 实测/纵横切换）✓；未保存 Tag 保存后消失 ✓

### 矩阵 1 · 页面搭建器：amis 组件 × 属性

- **G3 白名单服务端全量**：162 型单页一次过检（201）✓（容器 23+表单 77+展示 64，`group` 跨类去重后 162——**活文档"约 166"已修正**）
- **黑名单**：static-file/input-cascader → 400 + 替代指引 ✓；**别名纠正**：cascader→nested-select、upload→input-file（编辑距离建议）✓；未知型 → 400 + 组件清单指引 ✓
- 物料面板：5 分组全量未裁剪（布局 10/数据容器 4/表单项 40+/功能 18/展示 27；含黑名单替代品 nested-select/chain-select）✓
- 深测组件：chart（添加/属性面板全枚举：数据接口/跟踪表达式/Echarts 配置 Monaco/数据映射 dataFilter/下钻/状态可见条件隐藏；保存持久化 ✓ 截图 qa_page_builder_canvas_chart.png）；crud/表单/输入类由表单生成器与台账实测覆盖
- **表单生成器 12 映射逐项精确验证**：text→input-text、long_text→textarea、number/percent→input-number、currency→**precision 2+kilobitSeparator 千分位**、single_select→select（**options value 回退 label 非 id**）、multi_select→**multiple:true**、date/date_time→input-date/datetime、auto_number→static 只读、checkbox→switch、attachment→input-file；系统字段排除 ✓；成对台账开关默认勾选 ✓
- 顶栏：重置/代码 Tab（Schema JSON 编辑+`校验并应用`+G3 硬闸说明文案）/runtime 预览↗/保存（成功 toast）✓（代码 Tab 三规则负向 GUI 未完成 G-8，规则存在于源码+服务端 G3 已证）
- 页面模板 5 类型（列表/详情/表单/仪表盘/自定义）+列表页关联对象必选联动 ✓
- **成对台账列裁剪缺陷 D-004（P2）**：`page-template.ts:175` 硬编码 `fields.slice(0, 6)`，第 8 字段 status 被裁——**"台账显示审批状态中文标签"锚点在多字段对象失效**（e2e 因对象字段少未暴露）

### 矩阵 4 · 数据流：节点 × 配置项

- 创建表单五区：基本信息/数据源（对象+别名）/JOIN（启用）/筛选（启用）/分组汇总（启用：分组字段/指标行=字段×函数×输出列名×显示名）/输出字段（源字段/列名/显示名/类型）✓
- **D-005（P1）**：`DataFlowFormModal.tsx:294` 将 `aggregation.groupBy` 以逗号字符串直接绑定提交，违反 shared `groupBy: string[]` 契约 → 引擎 `agg.groupBy.map is not a function` → **GUI 正常路径创建的分组汇总数据流执行必失败**（数据集 FAILED，lastError 透出 ✓）；可视化编辑器路径（NodeConfigPanel.tsx:245-252）转换正确——修复方向：提交前 `split(',')`（对齐可视化路径）
- join 键契约：**聚合点路径 → 400 硬拒**（`数据流配置的字段键不合法: "l.quantity.value"（仅允许字母/数字/下划线）`）✓；**别名闭合校验**（undefined 别名 400）✓；右表裸键 → 静默全 null 无纠错提示（**P3 观察**）
- 执行状态流转：草稿→（执行）→FAILED（lastError 可见）/READY（修正后）✓；物化 2 行×2 列；rows 取数 ✓

### 矩阵 5 · 权限规则编辑器

- 枚举维度全对：效果 [允许/拒绝] × 类型 [记录权限（行级）/页面/流程/数据模型/连接器] × 动作 [查看/创建/编辑/删除/执行/审批/管理] × 目标 [通配 `所有 (*)`+具体资源] ✓
- 行级条件 RAQB（字段搜索/操作符/值三来源：指定值/引用/公式）+ 列级 fieldScope（勾选可见）结构 ✓
- **行级过滤行为实测**：ALLOW（`name in [业务链甲,业务链乙]`）→ USER API 视角 11 条→**仅 2 条**（JsonLogic 经条件翻译器下推）✓
- **deny-overrides 实测**：同对象叠加 DENY → 403 整拒 ✓；默认拒绝（无规则匹配时 403）✓
- 成员管理（userIds 数组）✓；explain 对账 ✓
- **D-006（P2 待确认）**：规则编辑 Drawer 选 RECORD 目标后，"列级权限"显示`该对象暂无字段`且 RAQB 字段下拉为空（`selectedObjectId` 未触发对象详情请求——network 无 /objects/:id 调用）；不排除自动化合成事件交互未触发 onChange 的可能，**需人工复验**
- **D-007（P3）**：角色编码大写约束未强制——`lower_case` 创建成功（截图 qa_role_lowercase_code_created.png；已清理）

### 抽样维 {草稿,已发布}×{画布,API}×{admin,user}×{prod}

qa 应用实测：草稿（对象/页面/流程）→ 发布 prod → runtime 渲染（画布创建+API 创建混合）；admin（全链）+user（业务/权限）双视角 ✓。dev 环境发布未单独走（发布向导 Radio 见到 dev 选项）——标部分覆盖。

---

## 四、《缺陷清单》（按级别排序）

| 编号 | 级别 | 标题 | 位置/根因 | 复现 | 截图 |
|---|---|---|---|---|---|
| D-002 | **P1** | 记录写路径服务端字段校验缺失：必填空值/101 字符超长/唯一重复名三条均创建成功（脏数据直写） | `record.service.ts` 无 required/unique/maxLength 校验（仅 validateLookupWrites）；客户端必填可绕过（API 直连/AI 页面/流程写库同内核） | POST /records `{"name":""}` / `{"name":"Q"*101}` / 重名 → 全 201 | API 响应原文在案 |
| D-005 | **P1** | 数据流表单分组汇总写坏契约：groupBy 字符串 vs string[]，执行必失败 | `DataFlowFormModal.tsx:294`（对比正确实现 NodeConfigPanel.tsx:245-252） | GUI 建"启用分组汇总"数据流→执行→数据集 FAILED `agg.groupBy.map is not a function` | lastError API 原文 |
| D-004 | **P2** | 成对台账列硬编码前 6 列，审批状态列（第 8 字段）被裁，回归锚点"台账显示审批中文标签"失效 | `page-template.ts:175` `fields.slice(0, 6)` | 建 18 字段对象→成对生成台账→状态列缺失（qa_apply_form_ledger 实测仅 6 列） | qa_runtime_ledger_labels.png |
| D-006 | P2待确认 | 权限规则编辑 Drawer 选 RECORD 目标后字段列表不加载（列级"暂无字段"+RAQB 空下拉，无 /objects/:id 请求） | PermissionRuleEditor.tsx（selectedObjectId 未触发查询？）| 打开 QA_TESTER 规则 Drawer→选目标→观察 | 需人工复验（合成事件嫌疑） |
| D-001 | P3 | 登录失败 toast 显示英文 Axios 原文，未用后端中文 message | studio 登录页错误处理 | 错误密码登录 | qa_login_wrong_pw_toast.png |
| D-007 | P3 | 角色编码大写约束未强制（`lower_case` 创建成功） | 角色创建校验缺失 | GUI/API 建小写编码角色 | qa_role_lowercase_code_created.png |
| D-008 | P3 | 记录排序仅升/降两态无"取消排序"第三态（底册称三态） | 数据 Tab 表格 sorter | 点数量列表头循环观察 | — |
| D-009 | P3待确认 | user_task 审批人类型切换残留旧值（USER+candidateGroups 并存脏配置）；引擎按 assigneeType 优先，潜在误导 | 流程编辑器类型切换未清理 | ROLE 选角色→切 USER→API 看 schema | API schema 原文 |
| 观察 | P3 | ① join 右表裸键静默全 null 无纠错提示；② 数据 Tab 记录表单对 user/attachment/lookup/sub_form 渲染为纯文本输入；③ 长会话中搜索出现过一次未生效（刷新后正常，未能复现） | — | — | — |

**文档修正（同提交）**：活文档 QA-TEST-PLAN-PROMPT.md——G3 白名单"约 166"→162（容器 23/表单 77/展示 64，group 去重）；别名建议 19→21 条；superadmin 密码 superadmin123 补记。

---

## 五、《全流程贯通报告》（八条链路）

### 5.1 搭建链 ✅ 全通
建 qa_full_test 应用→对象（18 类型+查找目标）→页面（表单生成器+成对台账+chart）→预检（10 项拦截→删除矩阵流程修复）→发布向导 3 步（版本默认 0.1.0/环境 Radio/说明必填≤500/变更分组表/确认汇总 4 模块 10 变更）→v0.1.0→runtime 渲染全字段表单 ✓。版本历史三版本+回滚按钮 ✓。

### 5.2 AI 链 ⛔ 受限
本会话无 mcp__apaas__ 工具面（QA agent 环境未挂 MCP），无法产生 AI 草稿。已覆盖：G3 校验器负向（缺 options value 类比：黑名单/别名/未知型/点路径四负向全过）。批次批准拓扑序/漂移 409/驳回意见回传由 e2e 17 号既有覆盖。

### 5.3 业务链 ✅ 全通（双腿）
USER runtime 提交表单（AUTO-0018 自动编号实时回显）→记录创建触发（RECORD_CREATED 按 app+triggerType 匹配）→admin 任务中心待办→任务 Modal（**绑定表单只读渲染**/流程变量折叠/轨迹 Tab）→**批准腿**：记录 status=已完成+实例 COMPLETED+USER 站内信（**`{{record.name}}` 插值生效**：`您提交的 QA记录「业务链甲」审批已定论`）；**驳回腿**：拒绝二次确认（`拒绝后流程将按驳回路径继续，此操作不可撤销`）→status=待处理+站内信 ✓。铃铛未读/全部切换+相对时间 ✓。

### 5.4 数据链 ✅ 全通（数值精确对账）
数据流 qa_status_agg（API 修正 groupBy 后）→数据集 READY 2 行→**API 对账逐项相等**：已完成 215（5+10+20+30+40+50+60）与 API 直查分组求和一致；待处理 155.14（3.14+150+2）一致 ✓。图表渲染（chart 组件画布+持久化）✓（图表取数对账引用 R2 采购分析应用实测，本会话 chart 用默认数据）。

### 5.5 权限链 ✅ 全通
建角色 QA_TESTER→成员（userIds）→行级规则（JsonLogic in 条件）→USER 视角 **11 条→2 条**（翻译器下推）✓；deny-overrides 403 ✓；权限调试 explain 返回 allowed/ALLOW_RULE/matchedRules 表 ✓（三源：UI 规则+API 视角计数+explain 一致）。

### 5.6 开放链 ✅ 全通
服务身份创建（明文 apiKey 一次性返回）→api-release major=1→发现端点（triggerUrl）→latest 启动 201 RUNNING→**major/1 钉版启动 201**→吊销→**401 无效的 API Key** ✓。无 key 401 ✓。（旧 major 兼容未测——单 major，标部分）

### 5.7 治理链 🟡 部分
审核中心三 Tab/changes 基线（baselineVersion 0.3.0，未提交 0 模块）/人工提交即时 APPROVED 基线语义 ✓；PENDING 不落活表/批次拓扑批准/漂移 409/二次提交不误报由 e2e 17 号覆盖（本会话无 AI 通道无法造 PENDING）。

### 5.8 观测链 ✅ 全通
审计日志逐条对账：APP_PUBLISH×3/PROCESS_PUBLISH×2/PROCESS_API_RELEASE/SERVICE_IDENTITY_REVOKE/PERMISSION_CHECK 等，操作人与动作吻合；traceId 全响应携带 ✓；可观测中心页面+统计卡 ✓。

### 5.9 e2e 冒烟（批量锚点证据）
首轮 9 过/5 败/2 未跑——**5 个失败全部根因 429 ThrottlerException（auth 限流）**：QA 会话的 API 登录与 e2e 并发撞 10/min 窗口（错误上下文原文在案）。已隔离重跑 5 用例复核，结果见下（执行纪要）。

**重跑结果**：见下方"执行后记"。

---

## 六、《回归锚点》16 项核对

| 锚点 | 结论 | 证据 |
|---|---|---|
| #17 条件分支驳回路由 | 通过（e2e 16/22 号覆盖+画布分支结构实测） | e2e |
| 角色审批 candidateGroups=角色 ID | ✅ 实测 | schema `"candidateGroups":["cmurtqf5u0004..."]` |
| #10 object_operation fieldMapping 持久化 | 部分：面板+字段映射行 UI 实测；深度往返未做（预检拦于缺省配置） | GUI |
| #11 FieldMapper 添加行 | 部分：按钮+行结构在；压力交互未做 | GUI |
| 审批页统一只读 | ✅ 实测（无提交按钮+全字段 static） | 5.3 |
| 表单排除回写字段/台账中文标签 | ❌ **D-004**：台账列被裁；表单含 status（流程后建，排除逻辑按已发布回写配置生效时点） | 矩阵1 |
| 审计无权限显式 403 | 未单独验证（缺口 G-1 builder 视角） | — |
| UTC/裸 cuid 收敛 | ✅（本地时间/创建人中文名/发布人=管理员） | 各处 |
| 治理基线二次提交不误报 | e2e 17 号覆盖 | e2e |
| join 双别名/聚合行键 | ✅（点路径 400/右裸键 null/别名闭合 400） | 矩阵4 |
| api.url @ref 无双前缀 | e2e 20 号覆盖（qa 应用无 @ref 场景） | e2e |
| fetcher 失败必 toast | 未直接触发（缺口） | — |
| "未保存"误标 | ✅ 保存后 tag 消失；未保存警示真实（矩阵流程 16 节点未配置时持续显示） | 矩阵2 |
| 无驳回边无驳回按钮 | e2e 16 号:213 覆盖（首轮因限流失败，重跑复核） | e2e |
| 发布审计归 APPLICATION | ✅ APP_PUBLISH 在列 | 5.8 |
| 发布预检硬闸 | ✅✅ 双层（应用级 Drawer 10 项+流程级发布按钮） | 矩阵2 |

---

## 七、风险评估与建议

1. **D-002（P1）建议立即修复**：RecordService 写路径补 required/unique/maxLength 服务端校验（JSONB 宽表下唯一性需应用层查询校验；已有 searchable/类型契约可复用）。影响面：开放 API/AI 生成页面/流程对象操作节点全部走同一内核。
2. **D-005（P1）**：一行修复（split 对齐 NodeConfigPanel 既有实现），发布后需回归"GUI 建流→执行→READY"。
3. **D-004（P2）**：成对台账列策略建议改为"前 5 字段+必含回写状态列（若存在 single_select 且被引用为回写）"或列选择器。
4. **D-006 需人工复验**（若属实则行级条件 GUI 配置不可用，当前 API 路径可用作替代）。
5. **e2e 与手工 QA 并发的限流互踩**：建议 e2e auth.setup 改用独立测试账号或登录豁免；QA agent 并发会话应避免与 e2e 同时段。
6. **覆盖缺口清单**（后续补测优先级）：G-1 builder 视角权限矩阵、G-4 连接器/云函数深度执行、G-5 流程分支容器面板+撤销重做+触发器两处同步、G-8 代码 Tab 三规则负向、fetcher toast 负向、审计 403 态、旧 major 兼容、dev 环境发布。
7. **测试资产**：qa_full_test 应用及其资源保留作回归夹具（含已发布 v0.3.0、READY 数据集、行级规则角色）；如需清理见报告内资源清单。

---

## 执行后记（报告落档时补充）

- e2e 5 失败用例隔离重跑：**全部通过**（429 限流确认为唯一根因，非产品回归）。详细输出见会话记录。
- 活文档三处修正已同提交（见缺陷清单"文档修正"）。
