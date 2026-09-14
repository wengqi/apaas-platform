# 测试质量报告 — 2026-09-13

> 测试范围：单元测试（gateway/db/studio 全包）+ Playwright E2E（10 spec 全量）+ vitest 覆盖率
> 测试环境：真实端到端（Docker PostgreSQL + Redis + Gateway:3000 + Studio:5173 + Runtime-UI:5174）
> 核心结论：**E2E 套件在本次会话前从未真正通过**（基础设施与 API 契约双重断裂）；修复后 48/48 全绿，并在过程中捕获并修复了 1 个 P0 产品回归

---

## 一、测试结果总览

| 维度 | 结果 |
|---|---|
| 单元测试（gateway） | **349/349 通过**（18 spec 文件，1.8s） |
| 单元测试（db） | **42/42 通过**（2 spec：租户上下文 18 + 注入逻辑 24） |
| 单元测试（studio） | **86/86 通过**（3 spec：流程配置 utils） |
| **单元测试合计** | **477/477，0 失败** |
| **E2E（Playwright, chromium, serial）** | **48/48 通过**（10 spec，33s） |
| 覆盖率（gateway, v8） | statements **40.55%** / branches **74.72%** / functions **61.71%** / lines **40.55%**（阈值 34/70/55/34 全部达标） |
| typecheck | 全包通过 |
| ESLint（--max-warnings 0） | 0 error 0 warning |

## 二、E2E 执行过程与发现（重要）

E2E 首次真实执行即暴露**三层断裂**，逐层修复后达到全绿。每一层都是独立的测试质量发现：

### 断裂层 1：认证基础设施从未工作过

| 缺陷 | 详情 | 修复 |
|---|---|---|
| auth.setup locator 错配 | `getByPlaceholder('邮箱')` — 登录页实际 placeholder 是 `name@example.com`；按钮 `name:'登录'` — 实际文本「登 录」（含空格）。**setup 自创建起永远超时**，意味着声称的"E2E 17 测试通过"（08-23）不可能发生过 | 改用可访问名称定位（`getByRole('textbox', {name:'邮箱'})` + `name:'登 录'`），e2e/auth.setup.ts + 01-auth.spec.ts 同步修复 |
| loginViaApi 缺 tenantSlug | `admin@apaas.dev` 是 demo 租户的租户管理员而非平台超管；不带 tenantSlug 走平台管理员分支 → 401「请输入租户标识」。**9 个 API 驱动 spec 全部无法登录** | fixtures.ts 统一传 `tenantSlug: 'demo'` |

### 断裂层 2：spec 与真实 API 契约大面积错配

9 个 spec 文件使用了**不存在的路由**或**错误的请求/响应形状**（证明这些用例从未执行成功）：

| 错配类型 | spec 中的写法 | 真实契约 | 影响范围 |
|---|---|---|---|
| 路由不存在 | `POST /pages`、`POST /objects`、`POST /records`、`POST /processes` | `POST /apps/:appId/pages`、`/apps/:appId/objects`、`/objects/:objectId/records`、`/apps/:appId/processes` | 02/03/04/05/07/09/10 |
| 请求体形状 | `POST records` body=`{data:{...}}` | body 即字段键值对（扁平） | 02/05/07 |
| 响应字段名 | `version`、`isPublished`、`apiName` | `versionNumber`、`published`、`slug` | 09/10 |
| Workflow 边键名 | `edges:[{source,target}]` | `{sourceNodeID,targetNodeID}`（引擎只认后者，错键静默丢边） | 04 |
| 流程启动路由 | `POST /processes/:id/instances` | `POST /processes/:id/start` | 04 |
| 数据流配置引用 | `groupBy:['orders.category']`、`source:'orders.amount'` | 非前缀字段名 `['category']`、`'amount'`（前缀引用静默退化单分组） | 07 |
| 页面级发布假设 | `POST /pages/:id/publish` 后访问 runtime slug | runtime slug 端点只读**应用级** publishedSnapshot → 404「应用尚未发布」 | 05（产品行为确认，spec 改为应用级发布） |

### 断裂层 3：E2E 触发限流 429（暴露配置缺陷）

套件请求量超过默认 100 req/min/IP，多个 spec 在 `beforeAll` 登录时被 429 打断。根因有二：
1. 限流阈值硬编码于 app.module.ts；
2. **Turbo 2.x 默认 strict env 模式**：未在 `turbo.json globalEnv` 声明的环境变量不会传给 dev 任务——`THROTTLE_DEFAULT_LIMIT=100000` 设置后 gateway 进程仍读到默认值（`x-ratelimit-limit: 100` 可证）。

**修复**：限流三参数改为环境变量驱动（`THROTTLE_TTL_MS`/`THROTTLE_DEFAULT_LIMIT`/`THROTTLE_AUTH_LIMIT`，Joi 默认 60000/100/10）→ env.validation.ts + .env.example + turbo.json globalEnv 同步补全（同时补齐 BATCH_MAX_ROWS 等此前同样传不进去的变量）。

## 三、E2E 捕获并修复的产品缺陷（P0）

**记录创建/更新 API 对所有字段数据返回 400 — DTO 规范化引入的回归**
- 现象：`POST /objects/:id/records` body `{category:'A'}` → 400 "property category should not exist"
- 根因：全局 ValidationPipe（`whitelist:true, forbidNonWhitelisted:true`，main.ts）对 `RecordCreateDto`（`[key:string]:unknown` index signature、零装饰属性）校验 — class-validator 的 index signature 不参与白名单，所有动态字段被拒。路由级 `ValidationPipe({whitelist:false})` 无法豁免全局管道（两条管道都执行，全局先抛）
- 影响：**自 08-23 DTO 规范化提交起，运行时/API 的记录创建与更新全部失败**（种子数据 prisma 直写 + E2E 从未跑通，故一直未暴露）
- 修复：create/update 参数类型改为 `Record<string, unknown>`（Object metatype 时 NestJS 管道跳过校验），Swagger 文档经 `@ApiBody` 保留；移除路由级冗余管道
- 回归验证：gateway 349 单测 + 48 E2E 全部通过

## 四、测试覆盖度评估

### 4.1 单元测试盲区（高风险路径零覆盖）

| 模块 | 状态 | 风险 |
|---|---|---|
| 14 个流程节点执行器 | **0 spec** | 审批/条件/对象操作等核心业务逻辑无回归保障 |
| trigger.service（含定时注册） | **0 spec** | B3 类生命周期缺陷无法被单测捕获 |
| process.service（任务/实例/模板） | **0 spec** | 权限校验逻辑无保障 |
| application check/snapshot/changelog | **0 spec** | 发布链路核心 |
| cloud-function.runner（沙箱） | **0 spec** | 安全组件；B8 内存泄漏类缺陷不可见 |
| auto-number（Counter 版） | **0 spec** | 并发正确性依赖 DB 约束，无验证 |
| 全部 20 个 controller | 被排除在覆盖率统计外 | 装饰器/守卫/管道组合无度量 |
| runtime-ui | **0 测试** | 渲染核心的 UI 集成层裸奔 |
| shared 渲染核心 | 仅经 studio 3 spec 间接覆盖 | action-executor 12 动作无直接测试 |

### 4.2 E2E 场景缺口

现有 10 spec：auth / object-crud / page-builder / process / dashboard / connector / dataset / cloud-function / app-publish（含回滚）/ demo-app。**缺失的关键场景**：
1. **完整审批旅程**（运行时创建记录 → 触发器点火 → TaskCenter 审批 → 条件分支路由 → 资产状态更新 → 通知送达）— 旗舰 Demo 旅程从未被端到端验证（本轮发现通知链路断裂正是此缺口）
2. 跨租户隔离访问拒绝（$extends Layer 2 无 E2E 断言）
3. 权限拒绝路径（fieldScope 裁剪 / 行级条件过滤的 UI 体现）
4. CSV 导入导出往返
5. Webhook 入站触发
6. 定时触发器点火
7. 组织权限继承
8. 子流程调用
9. 移动端视口

### 4.3 覆盖率明细（低分模块）

| 模块 | Stmts | 说明 |
|---|---|---|
| changelog.service | 0% | — |
| check.service | 0% | 发布预检核心 |
| snapshot.service | 0% | — |
| jwt.strategy | 0% | 认证核心 |
| queue/processor | 0% | — |
| dataset 服务群 | 低 | 物化/引擎仅引擎单测 |
| 整体 | 40.55% | 距 60% 目标差 ~20pp |

## 五、测试基础设施改进（本次落地）

1. **auth.setup.ts / 01-auth.spec.ts**：可访问名称定位（ placeholder/按钮文本双错配修复）
2. **fixtures.ts**：loginViaApi 统一 demo 租户登录
3. **7 个 spec 文件 API 契约对齐**：真实路由 + 真实请求/响应形状 + 引擎配置格式
4. **限流可配置**：THROTTLE_* 三参数 env 化 + turbo.json globalEnv 修复 env 传播（strict 模式认知沉淀）
5. **P0 产品回归修复**：record create/update 动态字段校验豁免（见第三节）

## 六、结论与建议

**结论**：单元测试层质量良好（477/477、0 `as any`、0 TODO、分支覆盖 74.7%）；E2E 层此前为零有效覆盖（基础设施从未跑通），本次修复后达到 48/48 全绿并已捕获 1 个 P0 产品回归 — **验证了"E2E 是唯一能捕获此类跨层回归的手段"**。

**建议（按优先级）**：
1. **将 E2E 纳入 CI 必过门槛**（GitHub Actions e2e job 已存在，确认其真实执行而非仅 lint）
2. 补齐"完整审批旅程"E2E（含通知送达断言）— 同时驱动修复 seed recipients 断裂
3. 补 14 个 node-executor + cloud-function.runner + auto-number 单测（安全关键路径）
4. 覆盖率阈值随整改逐步上调：statements 34%→45%（ Autumn 目标 60%）
5. runtime-ui 建立最小测试基建（至少 RuntimeStore/动作链单测）
6. E2E 增加跨租户与权限拒绝两个安全场景
