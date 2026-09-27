# 设计方案：企业身份对接层 + 构建态环境变量与应用版本管控

- 日期：2026-09-27
- 状态：草案（评审中）
- 依据：ADR-0002（平台定位）、ROADMAP 重规划节 R1.1 / R1.2 / R1.4、实地对标报告
- 已确认输入：SSO 协议 = **CAS**；目录同步 = **LDAP**；另有**人力主数据 HTTP 接口**作为目录源；对接层必须**通用可扩展**（预留飞书适配器）；构建态一套 + 环境变量区分，运行时支持 **dev / 生产** 双环境；应用版本需支持 **并行版本线与 hotfix**（1.0 线上修复与 1.1 新需求并行）

---

## 1. 总览：三层模型

```
┌─────────────── 构建态（Studio，一套）───────────────┐
│ 开发者编辑：对象/页面/流程/云函数                      │
│ 草稿（自动保存）──提交──► 版本快照 AppVersion          │
│   ▸ 环境变量「定义」在这里（Key/描述/是否必填）          │
│   ▸ 语义化版本 major.minor.patch；hotfix 从历史快照拉出 │
└──────────────────────┬───────────────────────┘
                       │ 发布（选择目标环境 + 值预检）
                       ▼
┌─────────────── 版本快照层（不可变）──────────────────┐
│ AppVersion: 全量 JSON bundle（对象+页面+流程+函数+     │
│ 配置引用），immutable；v1.0.0 / v1.0.1 / v1.1.0 …    │
└──────────────────────┬───────────────────────┘
                       │ 指针切换（毫秒级）
                       ▼
┌─────────────── 运行时（Runtime，N 个环境）──────────┐
│ AppEnvironment: dev / prod（可扩展）                  │
│   ▸ currentVersionId（当前生效版本）                   │
│   ▸ EnvVarValue（同一套 Key，每个环境各自的值）          │
│   ▸ Deployment 历史（可一键回滚到上一版本）              │
│ 记录/流程实例等运行数据按 environmentId 隔离            │
└──────────────────────────────────────────────────┘
```

核心原则：**构建态一套（值与配置分离）；环境差异全部收敛到「环境变量值 + 环境指针」；版本快照不可变，发布只是切指针。**

---

## 2. 身份与组织对接层（R1.1）

### 2.1 统一抽象（通用协议）

```ts
// SSO：负责"人是谁"（认证）
interface AuthProvider {
  readonly type: 'cas' | 'feishu' | 'oauth2' | 'local';
  buildLoginUrl(state: string): string;              // 跳转外部登录页
  handleCallback(query: Record<string, string>): Promise<ExternalIdentity>;
  logout?(sessionId: string): Promise<void>;          // 可选单点登出
}

// 目录：负责"组织长什么样"（用户/部门主数据）
interface DirectorySource {
  readonly type: 'ldap' | 'hr-api' | 'feishu' | 'manual';
  pullDepartments(): Promise<DeptRecord[]>;           // 扁平+parentId，平台侧组树
  pullUsers(): Promise<UserRecord[]>;                 // 全量（首版不做增量游标）
  readonly supportsIncremental: boolean;
}

interface ExternalIdentity {                          // 两层的交点
  externalId: string;                                 // 全局唯一（CAS: username；LDAP: entryUUID/工号）
  name: string; email?: string; mobile?: string;
  departmentExternalId?: string;
  raw: Record<string, unknown>;                       // 原始属性，供映射规则调试
}
```

适配器以 NestJS 模块实现（`identity/`），注册表模式：`AuthProviderRegistry` / `DirectorySourceRegistry`，租户级配置选择启用哪套。**飞书适配器**实现同一接口（AuthProvider=OAuth2 网页授权，DirectorySource=通讯录 API），证明抽象足够通用。

### 2.2 CAS 适配器（M1）

- 登录：302 → `{CAS_BASE}/login?service={平台回调URL}`；回调携 `ticket`
- 校验：`GET {CAS_BASE}/serviceValidate?ticket=&service=`（CAS 2.0 XML，兼容 3.0 p3 属性）；解析 `<cas:user>` 与属性（姓名/邮箱/工号）
- 平台侧：`externalId = cas:user` → 查 `UserIdentity` 绑定表 → 命中则签发平台 JWT（含 userId/tenantId/环境无关）；未命中走 2.6 的 provisioning 策略
- 单点登出：实现 CAS `logout` 回调（POST SLO）清除平台会话（首版可降级为前端跳转登出）

### 2.3 LDAP 同步（M1）

- 库：`ldapjs`；配置项（租户级，存 `IntegrationConfig`）：url / bindDN / bindPassword（AES-GCM 加密落库，复用连接器凭证加密）/ baseDN（人员、部门各一条）/ filter / 属性映射
- 默认映射（可在 UI 调整）：`employeeNumber→工号(externalId)`、`cn→姓名`、`mail→邮箱`、`departmentNumber→部门externalId`；部门用 `ou` 条目递归拉取（`objectClass=organizationalUnit`）
- 同步任务：BullMQ 队列 `directory-sync`；触发 = 手动「立即同步」+ 默认每日凌晨定时（cron 可配）；全量拉取 → diff → 写入
- 规模保护：单次同步上限（默认 50k 人）+ 分页（LDAP paged search）

### 2.4 人力主数据 HTTP 适配器（M1）

- DirectorySource 的 `hr-api` 实现：可配置 URL / Method / Headers（凭证走加密配置）/ 分页协议（page/pageSize 或 cursor）/ 数据路径（JSONPath）/ 字段映射表（外部字段→标准字段）
- 与 LDAP 同一 diff 管道；两个源可同时启用，**冲突规则：以优先级高的源为准**（默认 hr-api > ldap，可配），冲突记录进同步日志

### 2.5 账号生命周期与映射规则

| 场景 | 行为 |
|---|---|
| 新员工（目录有、平台无） | 自动建号（JIT provisioning）：写入系统对象「用户」，`_active=true`，默认绑定「全局只读角色」（可配默认角色）；**不自动授权写权限** |
| 在职信息变更 | 按**唯一键（externalId/工号）**更新姓名/邮箱/部门；工号不变者视为同人 |
| 离职（目录无、平台有） | **禁用不删除**：`_active=false` → 登录拒绝、运行时任务回收（沿用 H-4 租户挂起同款机制）；保留审计与历史记录归属 |
| 组织调整 | 部门树重建（保留 deptId 稳定键 = externalId）；用户部门引用更新；**不做**级联删除空部门（标记 inactive） |

### 2.6 数据模型（Prisma 草案）

```prisma
model UserIdentity {            // 外部身份 ↔ 平台用户 绑定（一人可多源）
  id            String @id @default(cuid())
  tenantId      String
  userId        String
  provider      String          // cas | ldap | hr-api | feishu
  externalId    String
  lastSyncAt    DateTime?
  @@unique([tenantId, provider, externalId])
}
model IntegrationConfig {       // 租户级对接配置（JSON，敏感字段加密）
  id String @id @default(cuid())
  tenantId String
  kind    String   // auth-provider | directory-source
  type    String   // cas | ldap | hr-api | feishu
  config  Json     // 结构按 type 校验（Joi）
  isActive Boolean @default(false)
  @@unique([tenantId, kind, type])
}
model DirectorySyncLog {        // 同步审计：全量/diff 统计/冲突/错误
  id String @id @default(cuid())
  tenantId String, source String, stats Json, status String, error String?
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt])
}
```

---

## 3. 构建态环境变量与应用版本管控（R1.2 / R1.4）

### 3.1 环境变量：定义在构建态，值按环境

- **构建态（Studio）**：「应用设置 → 环境变量」定义 **EnvVarDef**：`key`（大写下划线）/ 描述 / 必填与否 / 是否敏感。页面、流程节点、云函数、连接器配置里以 **`${env.KEY}`** 引用——**构建产物只存引用，不存值**。
- **运行时**：每个 AppEnvironment 持有 **EnvVarValue**（同一套 Key 各自的值）。发布前预检：目标环境缺失必填 Key → 拦截发布并列出缺失项。敏感值写后不可读（只可重置）。
- 解析时机：**运行时解析**（网关按当前环境注入），切换环境值即时生效，无需重新构建——这正是"构建态一套、环境变量区分"的落点。

### 3.2 数据模型（Prisma 草案）

```prisma
model AppVersion {              // 不可变版本快照
  id           String @id @default(cuid())
  tenantId     String
  applicationId String
  version      String           // semver：1.0.0；hotfix 1.0.1
  line         Int              // 版本线：1→1.0.x，2→1.1.x（按 major*10+min... 简化为整数序号）
  baseVersionId String?         // hotfix 时指向被修复的快照
  changelog    String
  bundle       Json             // 全量快照：objects/pages/processes/functions/configRefs
  checkReport  Json?            // 提交时"检查"结果
  createdBy    String, createdAt DateTime @default(now())
  @@unique([applicationId, version])
}
model AppEnvironment {
  id            String @id @default(cuid())
  applicationId String
  key           String          // dev | prod（内置两个，可扩展 staging）
  currentVersionId String?     // 当前生效版本（发布=切此指针）
  @@unique([applicationId, key])
}
model EnvVarDef {               // 构建态定义（一套）
  id String @id @default(cuid())
  applicationId String, key String, description String
  required Boolean @default(false), sensitive Boolean @default(false)
  @@unique([applicationId, key])
}
model EnvVarValue {             // 按环境的值
  id String @id @default(cuid())
  environmentId String, defId String, value String  // 敏感值加密落库
  @@unique([environmentId, defId])
}
model Deployment {              // 发布/回滚历史
  id String @id @default(cuid())
  environmentId String, versionId String
  kind String                   // deploy | rollback
  operator String, note String?, createdAt DateTime @default(now())
  @@index([environmentId, createdAt])
}
```

运行时数据隔离：`records / process_instance / execution_logs` 等增加 `environmentId`（沿用 tenantId 的 `$extends` 自动注入模式，双层租户+环境）。dev 与 prod 各自独立的记录、流程实例、触发器注册。

### 3.3 发布 / 回滚流程

```
提交草稿 → 校验（复用编辑器"检查"：必填/引用完整性/环境变量引用合法）
        → 生成 AppVersion（bundle 冻结）→ 版本号规则见 3.4
发布到 dev/prod：
  1) 预检：目标环境必填环境变量齐全；schema 降级检查（相对该环境当前版本的破坏性变更→警告确认）
  2) 写 Deployment + 切 currentVersionId（事务）
  3) 触发器随版本启停：停用旧版本注册的流程触发器 → 按 bundle 注册新触发器（BullMQ repeatable jobs 以 environmentId+processId 为 key）
回滚：Deployment 列表「回滚到此处」→ 切回旧 versionId + 触发器同样重建（记录数据不回滚）
```

### 3.4 并行版本与 hotfix 走查（用户场景）

| 时间线 | 操作 | 结果 |
|---|---|---|
| T0 | v1.0.0 已发布 prod（line=1） | prod 指针→v1.0.0 |
| T1 | 新需求：从当前草稿开发 1.1（line=2），随时提交 v1.1.0-rc 到 **dev** 环境验证 | dev 指针→v1.1.0-rc；**prod 仍 v1.0.0，不受影响** |
| T2 | 线上 bug：在版本列表对 v1.0.0 点「**从该版本创建修复**」→ 编辑器载入 v1.0.0 bundle 为新草稿（baseVersionId=v1.0.0, line=1） | 与 1.1 草稿**互不影响**（两份草稿并存，按版本线隔离） |
| T3 | 修复提交 → v1.0.1 → 发布 prod | prod 指针→v1.0.1；必要时先发 dev 验证 |
| T4 | 1.1 完成时：**hotfix 变更清单**（v1.0.0→v1.0.1 的 diff 摘要）展示给开发者，人工确认是否需在 1.1 重做（首版**不做自动 schema 合并**——低代码结构 diff/merge 复杂且高风险，成本收益不支持）→ 发布 v1.1.0 | 版本线收敛 |

版本号规则：提交时自动递增 patch；跨 line 提交时递增 minor；破坏性 schema 变更（删字段/改字段类型）由"检查"标记后递增 major——首版可半自动（建议+确认）。

### 3.5 运行时入口与路由

- Runtime UI：应用运行页顶部**环境切换**（dev/prod，按角色限制：prod 仅被授予发布权限的角色可见）+ URL 显式 `?env=dev`
- 网关：所有运行时读写 API 携带 `environmentId`（由 env key 解析，纳入与 tenantId 同款的自动注入）；未指定默认 prod
- 已发布应用对外入口（应用中心）固定指向 prod

### 3.6 与现有实现的衔接

- 现有 `publishedSnapshot` 字段 → 迁移为首个 `AppVersion`（数据迁移脚本一次性转换）；`发布`按钮语义从"快照+上线一体"拆分为"提交版本"与"发布到环境"两步
- 现有触发器注册（应用发布触发器）→ 改挂到 `AppEnvironment` 维度
- Studio 编辑器读取草稿模型不变；「提交」按钮对接 AppVersion；「历史」读 AppVersion/Deployment

### 3.7 环境变量硬性规则（G1–G4，写入校验器与发布预检）

「构建态一套、环境变量区分」成立的前提是**环境差异只存在于"值"**。以下四条为硬性规则，违反即拦截：

| # | 规则 | 理由 | 校验点 |
|---|---|---|---|
| G1 | **env 只放值，不放逻辑**：`${env.KEY}` 仅允许出现在值位置（连接地址/阈值/收件人/文案等）；禁止出现在条件、公式、表达式等逻辑位置；首版不提供 `env()` 表达式函数 | 一旦逻辑分支依赖环境，dev 验证不再覆盖 prod 行为，"同一版本"失去等价性 | 提交校验器：扫描 bundle 中 env 引用位置，仅放行值位置白名单 |
| G2 | **三分类归位**：随环境变的**值** → EnvVar；随环境变的**配置对象**（审批人、连接器凭证）→ 环境级配置；**不随环境变的** → schema 本身。禁止把审批人/凭证等结构化配置塞进环境变量 | 环境变量是字符串键值，承载不了结构化配置语义（脱敏/成员选择/引用关系） | 字段/节点配置引导 + 评审约定 |
| G3 | **值变更可审计**：EnvVarValue 每次修改写入操作记录（谁/何时/环境/Key）；敏感值写入后不可读、仅可重置 | 防 prod 配置漂移且无据可查 | EnvVarValue 写接口强制审计 + 敏感值加密 |
| G4 | **发布预检双闸**：目标环境必填 Key 缺失 → 拦截发布；相对该环境当前版本的破坏性 schema 变更（删字段/改字段类型）→ 强制二次确认 | 缺配置上线即故障；破坏性变更需明确知悉 | 发布流程预检（3.3 第 1 步） |

**边界说明**：本节"环境变量"指**应用级**环境变量（租户应用的构建态）。平台自身（gateway）的配置仍走现有 `.env` + `env.validation.ts`（Joi）构建态机制——两套命名空间互不混用：平台配置属于"平台这个应用的构建态"，应用环境变量属于"租户应用的构建态"。

---

## 4. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | CAS SSO + LDAP 同步 + JIT provisioning + 绑定表 | 企业账号可登录平台；组织树/人员在系统对象中可见；离职禁用生效 |
| M2 | 版本模型数据层 + Studio 提交/版本列表 UI | 提交生成快照；版本列表/详情/对比（changelog）可用 |
| M3 | 环境变量（定义/按环境值/`${env.*}` 运行时解析）+ 发布/回滚 + 触发器随版本启停 | dev/prod 各自发布与回滚演练通过；**G1–G4 护栏校验生效** |
| M4 | hotfix 流（从版本创建修复/变更清单）+ 人力主数据 HTTP 适配器 + 飞书适配器骨架 | 1.0 hotfix 与 1.1 并行走查通过；HR 接口接入同步成功 |

## 5. 开放问题

1. CAS 服务端版本/属性集（是否有工号属性）——M1 联调前需提供测试环境账号
2. 人力主数据接口的鉴权方式与分页协议（文档/样例）
3. dev 环境是否需要独立的连接器凭证集（建议：是，凭证挂到环境而非应用——与 EnvVarValue 同模式，M3 一并实现）
