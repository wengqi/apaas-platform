# 评审整改记录（2026-09-26）

> 上游：`docs/knowledge-base/REVIEW-INDEPENDENT-2026-09-26.md`
> 范围：评审报告第七节"整改优先级"中的**立即 / 上线前必须 / 下一迭代**三项，以及整改过程中暴露的新缺陷。
> 验证方式：单元测试 + 本地完整 Playwright e2e + 真实浏览器手工回归（含 DB 只读核对）。

---

## 一、验证基线（整改后实测）

| 验证项 | 结果 |
|---|---|
| gateway 单元测试 | **492 / 492 通过** |
| 本地完整 e2e（含既有 10 spec + 新增 UI spec） | **50 / 50 通过** |
| studio / runtime-ui / gateway / shared typecheck | 全部通过 |
| 文档同步检查（check-doc-sync.sh） | 通过 |
| Docker 生产模式启动（NODE_ENV=production） | 通过（弱默认密钥被启动校验正确拦截，需强密钥） |

---

## 二、安全整改（评审 C-1 / H-2 / H-3 / H-4 / M-4~M-8）

| 编号 | 整改内容 | 证据 |
|---|---|---|
| C-1 | compose 的 `JWT_SECRET` / `CONNECTOR_ENCRYPTION_KEY` 改为**必填**；env.validation 生产环境拒绝已知弱密钥与全零密钥；seed 用户种子在生产必须显式提供 `SEED_BOOTSTRAP_PASSWORD`，否则跳过；双端登录页移除明文测试账号 | 实测：本地弱默认密钥启动被拦截（Config validation error）；生成强密钥后启动正常 |
| H-2 | 登录端点绑定 auth 限流桶 + 账号级锁定（连续 5 次失败锁 15 分钟，DB 计数多副本一致） | 实测：响应头 `x-ratelimit-limit-auth: 10`；第 5 次错误返回"账号已被临时锁定" |
| H-3 | 新增 `common/net/ssrf-guard`（协议白名单 + DNS 解析逐 IP 黑名单 + 手动重定向逐跳复检 + 超时），接入连接器 baseUrl、OAuth2 tokenUrl、流程 HTTP 节点 | 实测：连接器指向 `http://169.254.169.254` 被拒（400 + SSRF 防护提示） |
| H-4 | `jwt.strategy.validate()` 每请求联查租户状态，非 ACTIVE 立即拒绝 | 代码 + 单测通过 |
| M-4 | 已发布云函数锁定代码/输入模式 | 实测：PUT 改代码 → 400"已发布的云函数不可修改代码/输入模式" |
| M-5 | webhook 可选 HMAC-SHA256 签名 + 5 分钟时间戳防重放；webhook 路径访问日志脱敏 | 代码 + 单测 |
| M-6 | 生产环境不挂载 Swagger | 实测：`/api/docs` → 404 |
| M-8 | 云函数并发 Isolate 信号量（`CLOUD_FUNCTION_MAX_CONCURRENT`，排队超时 429） | 代码 + 单测 |
| M-2 | 流程实例详情/轨迹增加**实例级授权**（超管 / 发起人 / 任务参与人），非参与人 403 | 实测：管理员 200，终端用户 403 |
| M-3 | 前端静态服务加 CSP（`script-src 'self'` 等，禁止内联脚本）+ nosniff + Referrer-Policy | 实测：响应头存在，页面渲染正常且无 CSP 违规 |
| M-7 | 生产 compose 端口收口到 `127.0.0.1`（PG/Redis 不再暴露公网）；PG 口令走 `POSTGRES_PASSWORD`（必填）；Redis 支持 `REDIS_PASSWORD` | 实测：5432/6379 仅 localhost 监听 |
| — | 密码哈希 cost 10→12；`IMPORT_FILE_MAX_SIZE_MB` 接线；`AuditLogService` 注入缺失显式告警 | 代码 |

> ⚠️ 整改过程中的一次自引入回归（已修复并回归）：compose 的 `REDIS_URL` 曾改为从 .env
> 取值，而 .env 面向宿主（localhost），导致容器内 BullMQ 连不上 Redis、`POST /processes/:id/start`
> 挂起。现容器内地址固定走 compose 网络，锁客户端限制重连次数并快速降级。
> 另外：M-3 的"token 移出 localStorage"（真正的根治）仍建议后续迭代完成，CSP 只是纵深防御。

新增环境变量（已同步 `.env.example` 与 compose 透传）：`SEED_BOOTSTRAP_PASSWORD`、`OUTBOUND_HTTP_TIMEOUT_MS`、`OUTBOUND_ALLOW_PRIVATE`、`CLOUD_FUNCTION_MAX_CONCURRENT`、`THROTTLE_*`（compose 可调）。

**审计补齐**：新增 `common/audit` 业务动作级审计——记录增删改（RECORD_CREATE/UPDATE/DELETE）、应用发布（APP_PUBLISH）、流程发布（PROCESS_PUBLISH）；实测 `audit_logs` 已入库。

---

## 三、引擎与数据一致性整改（P0-1 / P0-2 / P1 系列）

| 编号 | 整改内容 | 说明 |
|---|---|---|
| P0-1 | 批量更新改为"读旧 data → 字段级 merge → 逐条写回" | 此前 `updateMany` 整列覆盖 JSONB，可清空命中记录的全部其他字段 |
| P0-2 | 实例互斥升级为 Redis 分布式锁（SET NX PX + owner token + Lua 比较释放，Redis 不可用降级进程内互斥） | 消除多副本丢令牌；新增 `common/redis/redis-lock.service.ts` |
| P1-2 | `completeTask` 锁内校验实例状态 | 已取消/已结束实例不可被审批复活；任务标记 CANCELLED |
| P1-3 | 数据集 REFRESHING 增加 10 分钟租约 | worker 崩溃后可重新抢占，不再永久卡死 |
| P1-6 | 队列作业统一重试/清理（attempts=3 + 指数退避 + removeOnComplete/removeOnFail） | 消除"瞬时抖动 → 实例卡 RUNNING"与 Redis 无限堆积 |
| P1-7 | 应用级发布只发布 DRAFT 流程 + 为 SCHEDULED 流程即时注册定时触发器 | 此前草稿流程被强制上线、定时流程静默不执行 |
| P1-4 | 多角色 ALLOW 规则确定性合并（condition 取 OR 并集、fieldScope 取并集） | 不再依赖 findMany 无序"第一条" |
| P2-4 | 流程 HTTP 节点补超时 + SSRF 校验 | 此前无 AbortSignal，下游挂起占死 worker |
| — | 对象操作节点更新 0 行时显式报错 | 此前静默 COMPLETED，流程"假成功" |

---

## 四、产品与前端整改

| 项 | 整改内容 | 验证 |
|---|---|---|
| 手动流程无启动入口 | 流程列表新增"启动实例"（MANUAL + 已发布） | 浏览器实测启动成功 |
| 触发器无法配置 | 流程编辑器新增触发器配置弹窗（7 种类型 + 定时触发 cron 联动） | 浏览器实测选项与 cron 字段联动 |
| 单选值约定分裂 | `SelectOption` 支持稳定 `value`（未配置回退 label）；记录表单/筛选/默认值按 value 存取、展示用 label；字段配置面板新增"存储值"输入；seed-demo 选项补齐 value | **端到端实测**：新建申请存 `PENDING/BORROW` → 审批 → 记录状态变 `APPROVED` + 应用内通知生成（此前因条件不匹配永不执行） |
| 审批流程上下游不执行 | 修复 seed 流程节点定义：`inputs`(JSON-Schema 描述) → `inputsValues`(四态值)；对象操作 objectId 由资产对象改为领用申请对象；补驳回分支状态回写节点 | 节点链 start→userTask→condition→objectOp→notification→end 全部 COMPLETED |
| 记录表单暴露系统字段 | 创建人/时间等系统字段不再进表单（后端维护） | 浏览器实测 |
| 记录列表系统字段重复 | 列去重 | 浏览器实测 |
| 流程编辑器"打开即脏" | `updateNodeData` 无变化不置脏不推历史；首次导出与基线等价时 markSaved | 代码 + 浏览器 |
| 页面搭建器数据覆盖风险 | 移除加载失败静默回退空 Schema，改为显式错误态 + 重新加载 | 代码 |
| 页面搭建器无脏跟踪 | 基于已保存快照派生 `isDirty`，保存清脏、返回确认、beforeunload | 代码 |
| 数据组件无绑定入口 | 数据绑定面板注入 `data`/`record` 绑定项 | 代码 |
| 运行态可见 DRAFT 应用 | 首页仅显示 PUBLISHED | 代码 |
| 节点枚举未翻译 / 校验误报 | 副标题中文映射；校验字段与配置表单对齐（兼容历史 assigneeId） | 代码 |
| **新暴露：空 schema 白屏** | API 创建的页面 schema 为 `{}`（缺 root）导致 Canvas 崩溃且整页白屏 → `loadPage` 规范化 schema | e2e 实测：修复后保存页面路径通过 |
| **新暴露：无全局错误边界** | 双端新增 `GlobalErrorBoundary`（评审 P2-2），渲染异常显示错误页而非白屏 | 代码 |

---

## 五、质量防线补强

- 新增 `e2e/11-ui-user-paths.spec.ts`：**只走真实 UI 交互**，覆盖评审中"UI 断链而 CI 全绿"的全部路径（建对象 → 加字段 → 建记录 → 列表值渲染 → 建视图 → 保存页面落库校验；流程触发器入口 + 手动启动）。每文件只登录一次以适配 H-2 登录限流。
- 说明：既有 spec 保持"API 直调 + UI 断言"的定位不变，两套并存——前者覆盖业务能力，新 spec 覆盖用户操作路径。

---

## 五之二、BUG-05 闭环（流程配置侧栏交互冻结）

**缺陷现象**：配置侧栏经 `createPortal` 挂到 `document.body`；在"打开侧栏 → 刷新/恢复页面"后，
侧栏内所有 AntD Select 与 Input 表现为事件已到达 DOM 但 React 不更新（下拉打不开、输入框
无法录入、✕ 关闭无效）。

**定位过程（证据链）**：
1. 交互失效时侧栏 DOM 仍在、React props/fiber 完整、与主应用同属一个 root 且 `mounted=true`；
   侧栏外的左侧导航点击正常 → 排除"整页冻结"与"第二个 React root"。
2. React 事件委托标记在 `#root` 与 `body` 上均存在，点击命中的元素确为 Select 输入框，
   无遮挡、未禁用（`elementsFromPoint` / className 校验）。
3. **决定性实验**：把侧栏 DOM 从 `document.body` 移入 `#root` 后，同一控件点击立即生效
   → 结论：跨出应用 root 容器的 body portal 在本应用（flowgram 画布存在全局监听）下
   事件委托不可靠。
4. 供参考的排除项：CSP（M-3）下 AntD 样式完整（下拉行宽 439px、白底圆角阴影正常）、
   无 CSP 违规；`getByRole('option')` 命中的是 rc-select 宽度为 0 的隐藏 ARIA 列表，
   不能作为可见性断言（已写入用例注释）。

**修复**：侧栏改为在应用 root 内渲染（去掉 `createPortal(…, document.body)`），
定位由 `position: absolute` 改为 `position: fixed`（不再依赖 body 作为定位上下文，
也不被画布 `overflow: hidden` 裁剪）。同时为画布节点补 `data-testid="flow-node"` 等
测试钩子，便于用例精确定位。

**验证**：
- 浏览器回归（Docker/nginx + CSP 环境）：连续 3 轮"打开侧栏 → 刷新 → 点击下拉"全部正常；
  输入框可录入并保持、✕ 可关闭；侧栏几何 (960,0,480,900) 与修复前一致，无裁剪。
- 新增 `e2e/12-process-sidebar.spec.ts`（2 用例）：首次进入与**刷新后**均断言下拉可展开、
  输入可录入、✕ 可关闭；并加入机制守护——侧栏必须渲染于 `#root` 内。
- **负向对照**：临时还原为 body portal 后该用例失败（报"配置侧栏必须渲染于 #root 内"），
  证明用例可捕获该回归。
- 全量 e2e：**52/52 通过**。

**遗留说明（如实记录）**：原症状（事件不更新）在当前代码下已无法复现；上述机制是当时唯一
可确证的失效路径，修复即消除该路径。若后续再次出现同类现象，可先用"把侧栏节点移入 `#root`
后点击"这一判定手法快速二分（已写入本节）。

## 五之三、数据层高严重度项闭环（A-H1 / A-H2）

### A-H2 可空列唯一约束失效 → partial unique index

**缺陷**：PostgreSQL 中 NULL 互不相等，使既有唯一约束在参与列为 NULL 时完全失效——
`org_role_grants(org_id, role_id, app_id IS NULL)` 可无限重复插入；
`users(tenant_id IS NULL)` 平台超管同邮箱可重复创建。

**修复**（迁移 `20260926190000_partial_unique_indexes_nullable_columns`，Prisma schema 无法
表达 partial unique，手写迁移并保留原约束覆盖 NOT NULL 场景）：
- `users_platform_email_unique`：`UNIQUE (email) WHERE tenant_id IS NULL`
- `org_role_grants_global_scope_unique`：`UNIQUE (org_id, role_id) WHERE app_id IS NULL`
- 附带 `org_role_grants_app_scope_idx`（app_id 非空的查询路径）
- 迁移内含历史重复行清理（保留 id 最小者）

**验证**（事务内插入重复行后回滚，不留数据）：
```
ERROR: duplicate key value violates unique constraint "users_platform_email_unique"
ERROR: duplicate key value violates unique constraint "org_role_grants_global_scope_unique"
```

### A-H1 records JSONB 查询算子与 GIN 错配 + 业务字段排序语义错误

**缺陷**：
1. 过滤条件编译为 `data->'f' = x` / `data->>'f' LIKE ...`，**无法命中 GIN**
   （默认 jsonb_ops 仅加速 `@>`/`?`/`?|`/`?&`）；
2. 业务字段排序退化为**整列 JSONB 排序**（按 JSON 二进制序），与用户语义不符。

**修复**：
- 新增 `apps/gateway/src/record/record-query.ts`（纯函数，17 项单测）：
  `extractContainmentFilter`（AND 树内的 `==` 提取为 jsonb 包含对象）、
  `parseSortSpec`（兼容 `asc/desc` 与 AntD 的 `ascend/descend`）、
  `buildFieldOrderSql`（字段白名单校验 + 数值字段 `::numeric` + `NULLS LAST`）、
  `compareFieldValues`（不支持下推时的内存比较器）。
- `RecordService.query` 新增两条业务字段排序子路径：
  a) **GIN 下推**：条件可完整表达为包含（`rest === null`）且无行级权限条件时，
     raw SQL 完成 `data @> $::jsonb` + `ORDER BY <typed expr>` + `LIMIT/OFFSET` + `COUNT`，
     再按 id 取回记录；b) **回退**：其余情况取有界候选（5000）× 内存排序，语义同样正确。
- 过滤（无排序或系统列排序）保持 Prisma path 查询语义不变。

**验证**：
- GIN 可用性（EXPLAIN，硬证据）：
  `Bitmap Index Scan on records_data_idx` / `Index Cond: (data @> '{"status":"OPEN"}'::jsonb)`；
  对照旧算子 `(data->>'status') = 'OPEN'` → **Seq Scan（无索引可用）**。
- 排序语义（API + UI 双层）：
  `sort=amount:desc` → `1000,200,10,9,2`；`asc` → `2,9,10,200,1000`（旧实现会按 JSON 序错排）。
  业务数据对照（borrow_request）：旧 `ORDER BY data` 时"按 status 排序"被 asset_name 主导，
  新实现严格按 status 排序。
- 新增 `e2e/13-record-sort.spec.ts`：**真实 UI** 点击"金额"列头升/降序并校验行顺序（2 用例）。
- 全量：gateway 单测 **508/508**、完整 e2e **53/53**、typecheck 11/11。

**遗留（如实记录）**：LIKE/范围/OR 类条件本质上无法用 GIN 加速（jsonb_ops 不支持），
仍依赖 `(tenant_id, object_id)` btree 收窄；若后续出现大表慢查，建议按对象维度增加
表达式索引或引入物化列。

## 五之四、流程写库复用记录写内核（P1-5）

**缺陷**：对象操作/批量操作节点此前直接 `prisma.record.*` 写库，绕过
RecordService 的字段校验、AutoNumber/Formula/Rollup 计算与
`triggerService.onRecordEvent`——流程写入的记录缺编号/公式、父记录汇总不更新、
且不触发其他 RECORD_* 流程（自动化链路静默断裂）。

**修复**：
- 两个执行器改为注入并调用 `RecordService`（create/update/delete/batchCreate/
  batchUpdate/batchDelete），写路径与主 API 完全一致；批量写入的单条 merge
  语义也由内核保证（替代此前执行器内自实现）。
- 新增 `flow-actor.ts`：从触发上下文解析操作者（`triggeredByUser`/`startedBy`/
  `created_by` → 全局变量），无用户上下文（定时/Webhook/子流程）时回落为
  `system`，保证 createdBy/updatedBy 可追溯。
- 保留原有防呆：更新未命中记录显式失败；筛选范围删除先解析受影响 ID（上限
  BATCH_MAX_ROWS）；批量创建部分失败透出错误明细（不再"看似成功"）。
- 批量更新兼容两种载荷形状（`inputs.data = {…}` 文档约定 与 扁平 inputs）。
- DI：`ProcessModule` 以 `forwardRef` 引入 `RecordModule`（后者已 forwardRef
  ProcessModule 取 TriggerService），执行器以 `@Inject(forwardRef(…))` 注入。

**验证**：
- 单测（513/513）：执行器单测断言"经写内核"且 `prisma.record.create/update/
  deleteMany` **未被调用**；新增操作者解析（system / triggeredByUser）与扁平载荷
  兼容用例。
- 端到端（新增 `e2e/14-flow-record-writer.spec.ts`，真实引擎执行流程）：
  * 流程创建记录 → `code = ORD-0001`（自动编号）、`total = 15`（公式 qty*price）、
    `createdBy = 触发用户`；
  * 同一记录创建**触发了应用内 RECORD_CREATED 联动流程**（实例数 0 → 1）；
  * 流程批量更新 → 目标字段写入且 `code/qty/price/total` 全部保留（merge）。
- 全量：gateway 单测 **513/513**、完整 e2e **55/55**、typecheck 11/11。

**遗留（如实记录）**：流程读取（query 节点）仍为系统范围直读（流程上下文无终端
用户行级条件），未接入 ABAC 条件注入；如后续需要"按发起人权限读"，可在 query
节点传入发起人 PermissionContext。

## 五之五、React Query key 治理（P2-1）

**缺陷**：
1. `packages/shared/src/stores/query-client.ts` 的 `queryKeys` 注册表 **0 引用**（死代码），
   且其声明的键形状与实际用法不一致（`objects.byApp` 声明 `['objects','app',appId]`，
   实际全仓用 `['objects', appId]`）——迁移反而会改变 key 语义；
2. objects/pages 存在 `'app-objects'` / `'app-pages'` 别名 key（9 处）：同一数据双缓存，
   且对规范 key 的失效无法刷新别名订阅者；
3. 发布/回滚成功后**不做任何缓存失效**（PublishWizard 只跳转；VersionHistory 仅失效
   app-versions/app），已挂载的对象/页面/版本/变更视图保持陈旧。

**修复**：
- 删除死注册表；新增 `packages/shared/src/stores/query-keys.ts`，构造器与**既有事实键**
  形状一致（`qk.appObjects(appId) = ['objects', appId]` 等），并导出
  `publishAffectedKeys(appId)`（app/appObjects/appPages/appVersions/publishChanges）。
- 全量迁移读写点至构造器（studio 20+ 文件与 runtime-ui 2 文件），**读什么 key 就失效什么 key**；
  别名 key 清零。
- 发布向导与版本回滚成功后统一失效 `publishAffectedKeys` 集合。

**验证**：
- 新增守卫测试 `packages/studio/src/api/query-keys.spec.ts`（5 用例，静态一致性）：
  ① 别名 key 不得复活；② 规范键形状唯一且被多方使用；③ `qk` 每个构造器不得成为死代码
  （历史教训即注册表零引用）；④ 原 `queryKeys` 注册表不得再被引用；
  ⑤ `publishAffectedKeys` 覆盖 5 个键且 PublishWizard/VersionHistory 均调用。
- **负向对照**：临时新增一个含 `['app-objects', …]` 的文件 → 守卫立即失败并指名该文件；
  删除后恢复通过。
- 用户可见回归：浏览器经 UI 发布新版本（0.2.0）→ 进入版本页显示最新版本列表；
- 全量：studio 单测 96/96、gateway 513/513、完整 e2e **55/55**、typecheck 11/11。

## 五之六、应用级审计日志 UI（ROADMAP 9.9）

**缺口**：ROADMAP 9.9「应用管理后台 = 概览 + 环境信息 + 审计日志」此前为部分完成——
审计查询只有平台级页面（`/platform/audit-logs`），应用内无视图；且审计记录本身不带
应用维度，无法按应用过滤。

**修复**：
- 数据层：`audit_logs` 增加 `app_id`（可空，平台级事件为 NULL）+ `@@index([tenantId, appId])`，
  迁移 `20260927010000_add_audit_log_app_id`。
- 写入：`writeAudit` 支持 `appId`，并在记录增删改、应用发布、流程发布处透传；
  权限守卫的 PERMISSION_CHECK/DENIED 也带上路由 `appId`（存在时）。
- 查询：`AuditLogService.query` 与控制器支持 `appId` 过滤；DTO 透出 appId。
- 前端：新增应用内页面 `/app/:appId/audit-logs`（操作类型/资源类型/用户筛选 + 分页 +
  详情 JSON），侧边栏新增「审计日志」入口。

**验证**：
- 单测：新增 `audit-log.service.spec.ts`（4 用例）——appId 过滤下推、平台级不注入该条件、
  写入 appId/null、DTO 透出。
- e2e：新增 `e2e/15-app-audit-logs.spec.ts`（3 用例）——侧边栏入口可见、应用级列表展示
  RECORD_CREATE、平台级接口按 appId 过滤仅返回本应用事件。
- 浏览器实测：应用内写入记录后，审计页按 appId 正确显示该 RECORD_CREATE（无 appId 的
  历史条目按设计被排除）。
- 全量：gateway 单测 **517/517**、studio 96/96、完整 e2e **58/58**、typecheck 11/11。

## 五之七、单文件 400 行规范拆分（AGENTS.md 前端组件规范）

**背景**：独立评审指出 19 个前端文件超出 AGENTS.md「单文件最大 400 行（含注释）」上限。

**做法**：纯搬移式重构（不改任何行为、不改测试）——按职责抽出同级子模块（纯逻辑/常量/类型抽 `.ts`，
子组件抽 `.tsx`），主文件保留组合与状态；对已有外部调用的模块（`api/objects.ts`、`stores/pageBuilder.ts`、
`constants/process.ts`、`templates.ts`、`shared/stores/action-executor.ts`、`nodeRenderers.tsx`）
通过 re-export 保持既有导入路径与导出名 100% 兼容，调用点零改动。

**结果**：20 个文件拆分完毕，**前端源码已无 > 400 行文件**（最大 383 行）。拆分清单（原行数 → 主文件行数 + 新增子模块）：

| 主文件 | 行数变化 | 新增子模块（行数） |
|---|---|---|
| components/object/RecordList.tsx | 850 → 383 | record-list/：filter-logic.ts 173（+其 12 项单测 112）、FilterBar.tsx 113、RecordToolbar.tsx 77、FilterValueInput.tsx 78、RecordCellValue.tsx 74、systemColumns.tsx 56、utils.ts 30 |
| components/object/FieldConfigDrawer.tsx | 822 → 288 | field-config/：TypeSpecificConfig.tsx 190、utils.ts 186、OptionManager.tsx 130、DefaultValueItem.tsx 58、FieldTypeBadge.tsx 20 |
| pages/AppList.tsx | 702 → 314 | app-list/：AppCard.tsx 176、AppHeader.tsx 170、AppFormModals.tsx 137、constants.ts 26 |
| components/process/ProcessMonitor.tsx | 635 → 238 | process-monitor/：columns.tsx 145、TaskProcessPanel.tsx 127、InstanceDetail.tsx 88、InstanceListTab.tsx 68、formatDuration.ts 16 |
| pages/ProcessEditor.tsx | 543 → 244 | process-editor/：ProcessEditorToolbar.tsx 147、TriggerConfigModal.tsx 90、EditorErrorBoundary.tsx 68 |
| pages/ProcessList.tsx | 500 → 221 | process-list/：ProcessCard.tsx 205、CreateProcessModal.tsx 80 |
| components/process/nodeRenderers.tsx | 443 → 145 | node-renderers/：BusinessNodeRenderer.tsx 163、BlockOrderIconLabel.tsx 160 |
| components/process/configs/ConditionConfigForm.tsx | 442 → 218 | condition-config/：styles.ts 143、ConditionEditor.tsx 94、types.ts 26 |
| components/process/configs/CustomRule.tsx | 437 → 221 | custom-rule/：ValueInputs.tsx 112、rule-helpers.ts 78、operators.ts 58 |
| components/object/FieldTable.tsx | 446 → 262 | field-table/：fieldColumns.tsx 125、SortableRow.tsx 58、utils.ts 39 |
| components/object/ViewConfigurator.tsx | 418 → 312 | view-configurator/：SortRow.tsx 68、SortableFieldRow.tsx 58、SectionHeader.tsx 19、helpers.ts 15 |
| components/page-builder/EventsTab.tsx | 441 → 59 | events-tab/：ActionParamsEditor.tsx 178、EventEditor.tsx 151、actionProps.ts 50、constants.ts 30 |
| components/page-builder/PageList.tsx | 446 → 188 | page-list/：PageListItem.tsx 141、CreatePageModal.tsx 123 |
| components/page-builder/ViewModelPanel.tsx | 451 → 168 | view-model-panel/：VariableEditor.tsx 181、variableMeta.ts 67、VariableHeader.tsx 54 |
| components/page-builder/templates.ts | 457 → 23 | templates/：object-page-templates.ts 189、helpers.ts 160、dashboard-template.ts 73、dispatch.ts 47 |
| constants/process.ts | 472 → 42 | process/：node-meta.ts 256、status-meta.ts 99、trigger-meta.ts 84、types.ts 56 |
| api/objects.ts | 440 → 143 | objects/：types.ts 260、records.ts 98 |
| stores/pageBuilder.ts | 535 → 348 | page-builder/：utils.ts 145、types.ts 87 |
| shared/stores/action-executor.ts | 410 → 70 | action-executor/：actions.ts 238、types.ts 52、params.ts 45、script.ts 30、interrupt.ts 12 |
| runtime-ui/pages/TaskCenter.tsx | 409 → 179 | task-center/：TaskDetailTabs.tsx 132、columns.tsx 101、TaskModalFooter.tsx 56、constants.ts 20、utils.ts 14 |

**验证**：
- 行数审计：`find … | awk '$1>400'` 前端源码为空（最大 383 行）。
- `pnpm typecheck` 11/11 通过；单测 gateway **517/517**、studio **108/108**（含新增 filter-logic 12 项）。
- 构建：studio / runtime-ui / shared 均构建成功。
- **完整 e2e 58/58 通过**（含 UI 全路径、对象/字段/记录/视图/页面搭建器/流程监控/任务中心等被拆分模块的界面）。
- 未修改任何测试文件；未改变任何行为（仅搬移 + props 接线 + re-export）。

## 五之八、CI e2e 全红闭环（本地绿 / CI 红的根因链）

**背景**：整改分支首次推送后 PR CI 全量跑红——e2e 58 例中 4 例确定性失败
（10-demo-app 对象/页面设计器 UI 断言 ×2、12-process-sidebar 画布节点点击 ×2），
而本地全量 e2e 始终 58/58。复跑两次失败集合完全一致，排除抖动。

**证据链**（`02d6db8` 新增的失败现场上传发挥了关键作用）：
1. 失败截图/页面快照：编辑器页结构完整但**画布零节点**；页面列表呈现 `/app/undefined`
   特征（空态 + 通用标题）。
2. trace 网络记录：API 全部 200、schema 数据完整 → 排除后端；10 号 spec retry 访问
   `/app/undefined` → 暴露 appId 依赖测试副作用的设计缺陷。
3. trace console 记录：**21,004 次** antd Modal 警告 + **201 次** `Maximum update depth
   exceeded` → 定位渲染循环；栈顶组件为 HistoryBridge。

**根因与修复**（各为独立问题）：

| # | 根因 | 修复 |
|---|---|---|
| 1 | e2e job 全局 `NODE_ENV=test` 被 Vite 6 当作构建模式 → studio bundle 打入 **React development 版本** → flowgram 画布在 dev bundle 下不渲染节点。生产构建从未受影响——这就是"本地全绿、CI 确定性全红"的来源（CI console 里的 React DevTools 提示是 dev bundle 的铁证） | ci.yml「Build studio & gateway」步骤覆盖 `NODE_ENV=production`（gateway 运行时仍继承 test） |
| 2 | HistoryBridge effect 依赖不稳定的 `tools` 实例，每次执行经 `setHistoryApi` 喂新对象 → 重渲染 → 新 tools → effect 再跑，**setState 死循环**（dev bundle 下 21k 次渲染饿死画布；生产 bundle 自愈但属真实隐患，vite dev 本地开发同样暴露） | tools 实例经 ref 读取，effect 仅依赖 canUndo/canRedo 布尔值；ProcessEditor 侧 historyApi 入 ref、布尔 state 驱动渲染且值不变时返回 prev 使 setState 退出——上报路径在构造上有界 |
| 3 | studio 单测偶发失败（`newQbId` 100 个 ID 出现碰撞，expected 100 got 99）：RAQB 的 `Utils.uuid()` 以毫秒时间戳+模 16 计数器为主体、仅 8 个 hex 位真随机，同毫秒批量生成实测约 **1.5% 碰撞率**（200 次采样命中 3 次） | 按红线不动测试、修产品实现：`newQbId` 与 `emptyTree` 根节点 ID 改用 `crypto.randomUUID()`（CSPRNG v4，2 万 ID 采样零碰撞） |
| 4 | e2e 脆弱点放大器：`10-demo-app` 的 appId 由文件内首个测试的**副作用**赋值，Playwright 失败重试会更换 worker 并重跑 beforeAll 但不重跑其它测试 → appId 恒为 undefined，一次失败级联成多个 `/app/undefined` 必然失败 | appId 改为 beforeAll 独立解析；AntD Typography ellipsis 字体测量窗口期会渲染隐藏副本导致 strict exact 文本误判，断言改 `filter({ visible: true }).first()` |

**方法论教训**（沉淀为规约）：
- 本地 e2e `reuseExistingServer: true` 会静默复用 Docker 旧构建服务——**验证重构/修复前必须
  确认被测产物由当前代码构建**（本轮本地"全绿"实际测的是旧 bundle）。
- 本地绿 ≠ CI 绿：排查时按 CI 完全相同的构建模式与环境变量复现（`NODE_ENV=test pnpm exec
  vite build` 一步复现画布空白），比阅读代码推测快得多。
- Playwright trace 的 console 记录与网络记录是 CI-only 失败的第一现场；失败时先看 console
  是否出现 dev-only 警告（React DevTools 提示 / antd dev 警告），它们直接指认构建模式错误。

**验证**：
- 复现闭环：`NODE_ENV=test` 构建 → 12 号 spec 必现失败（与 CI 一致）；修复后同构建 12 号
  spec 通过、超限警告与万次重渲染消失（Modal 警告 21,004 → 6，即正常挂载次数）。
- 本地按 CI 同路径（`NODE_ENV=production` turbo 构建）完整 e2e **58/58**；typecheck 11/11；
  单测 gateway 517/517、studio 108/108（连跑 3 次）。
- CI：run `36306418165` 全绿（static / test / build / e2e 四 job）。

## 六、遗留项（技术边界与设计取舍，非缺陷）

评审报告「整改优先级」中的实质缺陷已全部闭环（安全 C-1/H-1~H-4/M-2~M-8、引擎 P0-1/P0-2 与 P1 系列、
数据层 A-H1/A-H2、产品与前端的 BUG-05 与 P1 系列、P1-5、P2-1、ROADMAP 9.9、400 行规范）。以下为
**需要外部条件或产品决策**的条目，如实保留：

| 项 | 性质 | 后续条件 |
|---|---|---|
| LIKE/范围类条件无法命中 GIN | 技术边界 | jsonb_ops 仅支持 `@>`/`?` 系列；需大表压测后再评估按对象维度建表达式索引 |
| 流程 query 节点未接入发起人 ABAC 条件 | 设计取舍 | 流程为系统上下文，当前按系统范围直读；如需「按发起人权限读」可传 PermissionContext |
| 多副本部署的 Redis 锁与队列压测 | 部署前置 | 引擎已内置 Redis 分布式锁（含降级）；水平扩展前建议压测 BullMQ 与 Redis 连接数 |
| dev/prod 环境隔离运行时切换 | ROADMAP 9.3 剩余项 | 需产品定义环境语义后实施 |

---

## 七、提交索引

1. `fix(gateway,db): 安全整改——默认凭证链/防爆破/SSRF/租户挂起/审计盲区`
2. `fix(gateway,db): 流程引擎与数据一致性整改（P0-1/P0-2/P1 系列）`
3. `fix(studio,runtime-ui): 前端整改——流程 UI 断链/脏状态/数据绑定/值统一`
4. `test(e2e): 新增真实 UI 用户路径 spec + 页面搭建器健壮性修复`

CI e2e 闭环增量（2026-09-27）：

- `fix(config,studio) 0a88129` — e2e 构建强制 NODE_ENV=production + HistoryBridge/ProcessEditor 循环加固
- `fix(studio) 709bc53` — newQbId 改用 crypto.randomUUID 修复唯一性缺陷
- `fix(studio,e2e) e50752a` — 切断 initialSchema 反馈环 + e2e 抗 worker 替换与隐藏节点
- `ci(e2e) 02d6db8` — 失败时上传 Playwright 现场证据（本轮排查的全部依据）
