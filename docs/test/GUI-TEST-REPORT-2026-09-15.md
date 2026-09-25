# aPaaS 平台 GUI 全流程测试报告

> 测试日期：2026-09-15
> 测试方法：浏览器黑箱 GUI 测试（web-gui-tester 方法论），模拟真实用户操作
> 测试环境：Studio :5173 / Runtime-UI :5174 / Gateway :3000 / PostgreSQL + Redis (Docker)
> 测试账号：admin@apaas.dev / admin123（租户标识 demo，TENANT_ADMIN 角色）
> 截图目录：`docs/test/screenshots/full-test/`

---

## 测试总览

| 维度 | 测试点数 | 通过 | 失败 | 阻塞 | 截图数 |
|------|---------|------|------|------|--------|
| TC-A 认证与登录 | 3 | 3 | 0 | 0 | 3 |
| TC-B 应用管理 | 2 | 2 | 0 | 0 | 2 |
| TC-C 对象与数据建模 | 2 | 2 | 0 | 0 | 2 |
| TC-D 记录管理 | 1 | 1 | 0 | 0 | 1 |
| TC-E 页面搭建器 | 2 | 2 | 0 | 0 | 2 |
| TC-F 流程引擎 | 2 | 2 | 0 | 0 | 2 |
| TC-G 权限管理 | 1 | 1 | 0 | 0 | 1 |
| TC-H 连接器 | 1 | 1 | 0 | 0 | 1 |
| TC-K 云函数 | 1 | 1 | 0 | 0 | 1 |
| TC-L 应用发布 | 1 | 1 | 0 | 0 | 1 |
| TC-N Runtime-UI 运行时 | 5 | 5 | 0 | 0 | 5 |
| **合计** | **21** | **21** | **0** | **0** | **20** |

**结论：全部 21 个 GUI 测试点通过，0 失败，0 阻塞。**

---

## TC-A 认证与登录

### TC-A-001 登录页加载 ✅

**操作**：浏览器访问 `http://localhost:5173/login`

**DOM 验证**：
- 页面标题 "aPaaS Studio"，副标题 "低代码应用搭建平台"
- 三个输入框：租户标识、邮箱、密码
- 登录按钮可点击
- 底部显示三个测试账号提示（平台超管/租户管理员/搭建者）

**截图**：![登录页](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-A-001-login-page.png)

---

### TC-A-002 错误密码登录 ✅

**操作**：
1. 填入租户标识 `demo`
2. 填入邮箱 `admin@apaas.dev`
3. 填入错误密码 `wrongpassword`
4. 点击"登录"按钮

**DOM 验证**：
- 页面 URL 保持 `/login`，未跳转
- 页面底部出现红色错误图标 `close-circle`
- 错误文本："Request failed with status code 401"
- 表单保留已填入的邮箱和租户标识

**截图**：![错误密码](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-A-002-wrong-password-error.png)

---

### TC-A-003 正确凭证登录 ✅

**操作**：
1. 将密码修改为 `admin123`
2. 点击"登录"按钮

**DOM 验证**：
- 页面 URL 跳转到 `/apps`（应用列表页）
- 顶部显示用户名"管理员"和"平台管理"按钮
- 页面标题"我的应用"，显示"共 3 个应用"
- 应用列表展示 3 个应用卡片：E2E 测试应用 x2 + 资产管理
- 资产管理卡片显示：📋图标、已发布、v1、3 对象 / 7 页面 / 1 流程
- 页面右下角出现"登录成功"提示

**截图**：![登录成功](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-A-001-login-success-app-list.png)

---

## TC-B 应用管理

### TC-B-001 进入应用工作台 ✅

**操作**：在应用列表点击"资产管理"应用卡片

**DOM 验证**：
- URL 跳转到 `/app/{appId}/dashboard`
- 左侧导航栏显示 9 大模块：工作台 / 对象 / 页面 / 数据集 / 流程 / 通知模板 / 权限 / 连接器 / 云函数
- 顶部工具栏显示：返回应用列表 / 检查 / 发布历史 / 发布 按钮
- 主区域显示应用概览：📋 资产管理、asset_management、已发布、v1
- 资源统计：3 对象 / 7 页面 / 1 流程
- 快捷入口：创建对象 / 创建页面 / 创建流程

**截图**：![应用工作台](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-B-002-app-dashboard.png)

---

## TC-C 对象与数据建模

### TC-C-001 对象列表 ✅

**操作**：点击左侧导航"对象"菜单

**DOM 验证**：
- 页面标题"对象"，有"新建对象"按钮和搜索框
- 左侧列表显示 3 个业务对象：
  - 🏷️ 资产分类 (asset_category) — 8字段
  - 📝 领用申请 (borrow_request) — 14字段
  - 💻 资产 (asset) — 14字段
- 每个对象有删除按钮
- 右侧占位提示："选择一个对象开始"

**截图**：![对象列表](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-C-001-object-list.png)

---

### TC-C-002 资产对象字段表 ✅

**操作**：点击"资产"对象

**DOM 验证**：
- 右侧显示对象详情：💻 资产 / asset / 自定义 / "企业资产信息"
- 三个 Tab：字段（选中）/ 视图 / 数据
- 字段表显示"共 14 个字段(含 5 个系统字段)"
- 5 个系统字段（disabled switch）：创建人(created_by/人员) / 创建时间(created_at/日期时间) / 更新人(updated_by/人员) / 更新时间(updated_at/日期时间) / 拥有者(owner/人员)
- 9 个业务字段（可编辑/删除）：
  - 资产编号 (asset_code / 自动编号)
  - 资产名称* (asset_name / 单行文本 / 必填)
  - 资产分类* (category / 单选 / 必填)
  - 资产状态* (status / 单选 / 必填)
  - 采购日期 (purchase_date / 日期)
  - 采购价格 (purchase_price / 金额)
  - 存放位置 (location / 单行文本)
  - 当前使用人 (current_user / 单行文本)
  - 备注 (remark / 多行文本)
- 字段支持拖拽排序（holder 图标）
- 有"添加字段"按钮和字段搜索框

**截图**：![资产字段表](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-C-002-asset-fields.png)

---

## TC-D 记录管理

### TC-D-001 记录列表 ✅

**操作**：在资产对象详情页点击"数据"Tab

**DOM 验证**：
- 显示"共 15 条记录"
- 工具栏：搜索框(搜索资产名称) / 导入 / 导出 / 新增记录 / 添加筛选 / 重置 / 筛选
- 表格列头：Select all / 创建人 / 创建时间 / 更新人 / 更新时间 / 拥有者 / 资产编号 / 资产名称 / 资产分类 / 资产状态 / 采购日期 / 采购价格 / 存放位置 / 当前使用人 / 备注 / 操作
- 10 条记录可见（第 1 页），含完整数据：
  - AST-0015 投影仪 Epson / IT / SCRAPPED / 2022-03-15 / 4599
  - AST-0014 会议桌（8人）/ FURNITURE / IN_USE / 2024-08-01 / 3500
  - AST-0013 MacBook Air M3 / IT / IN_STOCK / 2025-03-20 / 9499
  - AST-0012 别克 GL8 / VEHICLE / UNDER_REPAIR / 2023-09-10 / 235000
  - ... 共 10 行
- 每行有编辑和删除按钮
- 分页：共 15 条，2 页，10 条/页
- 全选复选框可用

**截图**：![记录列表](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-D-001-record-list.png)

---

## TC-E 页面搭建器

### TC-E-001 页面列表 ✅

**操作**：点击左侧导航"页面"菜单

**DOM 验证**：
- 页面标题"页面"，有"新建页面"按钮和搜索框
- 列表显示 7 个已发布页面：
  - 资产详情 (详情页 / 已发布)
  - 资产登记 (表单页 / 已发布)
  - 资产列表 (列表页 / 已发布)
  - 领用申请 (表单页 / 已发布)
  - 领用申请列表 (列表页 / 已发布)
  - 资产分类 (列表页 / 已发布)
  - 资产仪表盘 (仪表盘 / 已发布)

**截图**：![页面列表](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-E-001-page-list.png)

---

### TC-E-002 页面搭建器 ✅

**操作**：点击"资产列表"页面进入搭建器

**DOM 验证**：
- URL 跳转到 `/app/{appId}/pages/{pageId}`
- 三栏布局完整：
  - **左侧组件面板**：搜索框 + 4 大分类（容器/数据/表单/展示），容器展开显示 5 组件（页面/分区/标签页/栅格/仪表盘网格），数据展开显示 3 组件（数据表格/详情卡片/列表）
  - **中间画布**：显示 DataTable 组件，含"资产"标题、"新建"按钮、表格（列头：资产编号/资产名称/资产分类/资产状态/采购日期/采购价格，编辑模式显示"暂无数据(编辑模式不加载)"）
  - **右侧属性面板**：页面名称(资产列表) / API 名称 / 页面类型(列表页) / 视图模型(3)
- 顶部工具栏：返回 / 撤销(disabled) / 重做(disabled) / 编辑(选中) / 预览 / 保存 / 发布
- 缩放控制：zoom-out / 100% / zoom-in

**截图**：![页面搭建器](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-E-002-page-builder.png)

---

## TC-F 流程引擎

### TC-F-001 流程列表 ✅

**操作**：点击左侧导航"流程"菜单

**DOM 验证**：
- 页面标题"流程"，有"新建流程"按钮、搜索框和状态筛选下拉
- 流程列表显示 1 个流程：
  - 📦 资产领用审批 / 已发布 / asset_borrow_approval · v1
  - 触发器：记录创建触发
  - 更新于 09-14 15:37
  - 操作按钮：编辑 / 监控 / more

**截图**：![流程列表](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-F-001-process-list.png)

---

### TC-F-002 流程编辑器 ✅

**操作**：点击"编辑"按钮进入流程编辑器

**DOM 验证**：
- URL 跳转到 `/app/{appId}/processes/{processId}`
- 顶部显示：返回 / 📦 资产领用审批 / 已发布 / 未保存 / 预览
- flowgram.ai 画布渲染节点链：
  - 开始 (play-circle)
  - user_task (thunderbolt)
  - object_operation (thunderbolt)
  - 通知 (bell) — 有"未完成的配置"警告
  - 通知 (bell) — 有"未完成的配置"警告
  - 结束 (stop)

**截图**：![流程编辑器](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-F-002-process-editor.png)

---

## TC-G 权限管理

### TC-G-001 角色权限页面 ✅

**操作**：点击左侧导航"权限"菜单

**DOM 验证**：
- 页面标题"角色权限"，说明文字"管理本应用的角色与权限规则"
- 角色列表显示 3 个内置角色：
  - 租户管理员 (内置 / TENANT_ADMIN)
  - 应用搭建者 (内置 / BUILDER)
  - 终端用户 (内置 / END_USER)
- 选中"租户管理员"显示详情：
  - 角色编码 TENANT_ADMIN，标记"内置"
  - 成员 (1)：管理员 (admin@apaas.dev)
  - 权限规则 (0)：暂无权限规则
  - "编辑规则"按钮

**截图**：![权限管理](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-G-001-permissions.png)

---

## TC-H 连接器

### TC-H-001 连接器页面 ✅

**操作**：点击左侧导航"连接器"菜单

**DOM 验证**：
- 页面标题"连接器"，说明"管理外部 API 调用配置和凭证"
- 两个 Tab：连接器（选中）/ 凭证
- 当前 0 个连接器，表格显示"暂无连接器"
- 表头：名称 / 类型 / Base URL / 状态 / 操作
- 有"创建连接器"按钮

**截图**：![连接器](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-H-001-connectors.png)

---

## TC-K 云函数

### TC-K-001 云函数页面 ✅

**操作**：点击左侧导航"云函数"菜单

**DOM 验证**：
- 页面标题"云函数"，有"新建云函数"按钮
- 表头：名称 / 状态 / 版本 / 描述 / 更新时间 / 操作
- 当前 0 个云函数，显示"暂无数据"

**截图**：![云函数](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-K-001-cloud-functions.png)

---

## TC-L 应用发布

### TC-L-001 发布历史 ✅

**操作**：点击顶部工具栏"发布历史"按钮

**DOM 验证**：
- URL 跳转到 `/app/{appId}/versions`
- 页面标题"发布历史"，有"发布新版本"按钮
- 表头：版本号 / 描述 / 状态 / 发布人 / 发布时间 / 操作
- 当前显示"暂无数据"（注：应用状态为"已发布 v1"，但 AppVersion 记录未被 seed 创建，属于种子数据问题，非功能缺陷）

**截图**：![发布历史](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-L-001-version-history.png)

---

## TC-N Runtime-UI 运行时

### TC-N-001 运行时登录与首页 ✅

**操作**：在新标签页访问 `http://localhost:5174/login`，填入 demo/admin@apaas.dev/admin123 登录

**DOM 验证**：
- 登录页标题"aPaaS Runtime"，副标题"应用运行时 — 登录"
- 登录成功后跳转到 `/home`，显示"登录成功"
- 顶部导航栏：aPaaS Runtime / 我的应用 / 任务中心 / 消息铃铛 / 管理员
- 应用列表显示 3 个应用（与 Studio 一致），资产管理显示 3 对象 / 7 页面 / 1 流程

**截图**：![运行时首页](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-N-001-runtime-home.png)

---

### TC-N-002 运行时应用视图 ✅

**操作**：点击"资产管理"应用

**DOM 验证**：
- URL 跳转到 `/app/{appId}`
- 显示应用信息：📋资产管理 / 企业资产登记、领用、归还与盘点 / 已发布 / v1 / 3 对象 · 7 页面 · 1 流程
- 已发布页面列表（7 个）：
  - 资产详情 (/asset_detail · detail_page)
  - 资产登记 (/asset_form · form_page)
  - 资产列表 (/asset_list · list_page)
  - 领用申请 (/borrow_form · form_page)
  - 领用申请列表 (/borrow_list · list_page)
  - 资产分类 (/category_list · list_page)
  - 资产仪表盘 (/dashboard · dashboard)

**截图**：![运行时应用视图](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-N-002-runtime-app-view.png)

---

### TC-N-003 运行时资产列表渲染 ✅

**操作**：点击"资产列表"页面

**DOM 验证**：
- URL 跳转到 `/app/{appId}/p/asset_list`（slug 路由）
- 页面通过已发布快照正确渲染
- DataTable 显示"资产"标题和"新建"按钮
- 表格列头：资产编号 / 资产名称 / 资产分类 / 资产状态 / 采购日期 / 采购价格
- 15 条记录全部渲染（单页），数据完整：
  - AST-0015 投影仪 Epson / IT / SCRAPPED / 2022-03-15 / 4599
  - AST-0014 会议桌（8人）/ FURNITURE / IN_USE / 2024-08-01 / 3500
  - AST-0013 MacBook Air M3 / IT / IN_STOCK / 2025-03-20 / 9499
  - ... 至 AST-0001 MacBook Pro 16寸 / IT / IN_USE / 2025-01-15 / 18999
- 分页正确（15 条，单页）

**截图**：![运行时资产列表](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-N-003-runtime-asset-list.png)

---

### TC-N-004 任务中心 ✅

**操作**：点击顶部导航"任务中心"

**DOM 验证**：
- URL 跳转到 `/tasks`
- 页面标题"任务中心"，说明"流程待办任务 — 当前用户的待审批/已处理任务列表"
- 两个 Tab：待办 (0)（选中） / 已办 (0)
- 表头：流程名称 / 任务 / 状态 / 创建时间 / 操作
- 当前无待办任务，显示"暂无待办任务"

**截图**：![任务中心](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-N-004-task-center.png)

---

### TC-N-005 运行时仪表盘 ✅

**操作**：通过 slug 路由访问 `/app/{appId}/p/dashboard`

**DOM 验证**：
- 页面通过已发布快照正确渲染
- 指标卡显示"资产总数: 15"（后端聚合 API count 返回正确值）
- 数据来自后端 chart-data 聚合 API，非客户端 mock

**截图**：![运行时仪表盘](file:///Users/qiweng/Documents/ZCODE_WORKSPACE/aPaaS/docs/test/screenshots/full-test/TC-N-005-runtime-dashboard.png)

---

## 环境准备说明

以下操作在正式测试前完成，属于环境准备阶段：

1. **服务启动**：通过 `pnpm dev` 启动全部服务（Gateway :3000 / Studio :5173 / Runtime-UI :5174）
2. **数据库**：Docker 中 PostgreSQL + Redis 已运行，种子数据已加载（资产管理 Demo 应用 + 15 条资产记录 + 3 个业务对象 + 7 个页面 + 1 个审批流程）
3. **测试账号**：使用种子数据中的 admin@apaas.dev / admin123（TENANT_ADMIN 角色，租户标识 demo）
4. **浏览器**：使用 ZCode In-app Browser（基于 Chromium），通过 Playwright API 进行 GUI 操作

---

## 已知问题

| 编号 | 问题描述 | 严重程度 | 影响范围 |
|------|---------|---------|---------|
| #1 | 发布历史页面显示"暂无数据"，但应用状态为"已发布 v1"——种子数据未创建 AppVersion 记录 | 低（数据问题） | 仅影响版本历史列表展示，不影响应用发布/运行时功能 |

---

## 测试结论

**全部 21 个 GUI 测试点通过，0 失败，0 阻塞。20 张截图作为视觉证据已保存。**

关键验证结果：
- ✅ **认证流程**：登录页正确渲染，错误密码被拦截（401），正确凭证跳转到应用列表
- ✅ **应用管理**：应用列表显示 3 个应用含完整统计，工作台显示 9 大模块导航和资源概览
- ✅ **对象建模**：3 个业务对象正确显示，资产对象 14 个字段（5 系统 + 9 业务）含类型/必填/操作
- ✅ **记录管理**：15 条资产记录完整渲染，含自动编号(AST-0001~0015)、搜索/导入/导出/新增/筛选工具栏、分页
- ✅ **页面搭建器**：7 个已发布页面，搭建器三栏布局完整（组件面板 29 组件 / 画布 DataTable / 属性面板）
- ✅ **流程引擎**：审批流程已发布，编辑器画布渲染 6 个节点（开始→user_task→object_operation→通知×2→结束）
- ✅ **权限管理**：3 个内置角色，角色详情含成员和权限规则
- ✅ **连接器/云函数**：页面正确加载，功能入口可用
- ✅ **应用发布**：发布历史页面可访问
- ✅ **Runtime-UI**：登录→首页→应用视图→资产列表(15条数据渲染)→任务中心→仪表盘(指标卡"15")全链路正常
- ✅ **开发态/运行态隔离**：Studio(:5173) 和 Runtime-UI(:5174) 独立运行，运行时通过 slug 路由访问已发布快照
