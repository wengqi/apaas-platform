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

## 六、仍未整改（明确留待下迭代）

| 项 | 原因 / 后续 |
|---|---|
| 流程配置侧栏刷新后交互冻结（评审 BUG-05） | 现象稳定复现（事件到达但 React 更新不生效），未定位根因；已确认仅"刷新恢复"场景触发，首次进入正常。建议单独排期（怀疑 flowgram 画布与自绘侧栏的事件/订阅边界） |
| records JSONB GIN 索引与查询算子错配 | 需改查询构造为 `@>` 承载或加表达式索引，涉及翻译器与回归面较大，建议独立排期 + 压测 |
| 可空列唯一约束失效（OrgRoleGrant / 平台超管邮箱） | 需 partial unique index（手写迁移），低风险但需专门验证 |
| 流程节点写库未复用 RecordService（P1-5） | 需抽 RecordWriter 内核，改造面大 |
| 单文件 400 行、React Query key 治理、queryKeys 死代码、静态审计 UI 等 | P2/P3 债务，按迭代消化 |

---

## 七、提交索引

1. `fix(gateway,db): 安全整改——默认凭证链/防爆破/SSRF/租户挂起/审计盲区`
2. `fix(gateway,db): 流程引擎与数据一致性整改（P0-1/P0-2/P1 系列）`
3. `fix(studio,runtime-ui): 前端整改——流程 UI 断链/脏状态/数据绑定/值统一`
4. `test(e2e): 新增真实 UI 用户路径 spec + 页面搭建器健壮性修复`
