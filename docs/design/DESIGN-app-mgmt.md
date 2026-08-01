# 应用管理与发布 技术方案设计 (DESIGN-app-mgmt)

> 模块: Phase 9 — 应用管理与发布 🔴 P0 最高优先级
> 角色: 技术方案设计，供开发 agent 直接实现
> 技术栈: NestJS + Prisma + PostgreSQL (后端) / React 18 + Ant Design 5 + React Query (前端)
> PRD 基准: `docs/prd/PRD-app-mgmt.md`
> 调研基准: `docs/research/RESEARCH-feishu-apaas-app-lifecycle.md`
> 类型契约来源: `packages/shared/src/application/index.ts`

---

## 0. 现状分析

### 0.1 已有基础设施

| 组件 | 状态 | 说明 |
|---|---|---|
| `Application` Prisma 模型 | ✅ 已有 | 含 `status`/`version`/`publishedSnapshot`/`publishedAt` 字段 |
| `ApplicationService` | ✅ 已有 | CRUD 完整（list/get/create/update/delete） |
| `ApplicationController` | ✅ 已有 | 5 个 REST 端点，已挂 PermissionGuard |
| `AppStatus` 枚举 | ✅ 已有 | DRAFT / PUBLISHED / ARCHIVED |
| `AppEnv` 枚举 | ✅ 已有 | Dev / Prod（仅 TS 层，未持久化） |
| `PublishAppRequest` 类型 | ✅ 已有 | `{ notes?: string }`（需扩展为 version + description） |
| 页面级发布 | ✅ 已有 | `PageMeta.isPublished` + `POST /pages/:id/publish` |
| 流程级发布 | ✅ 已有 | `ProcessDef.status` + `POST /processes/:id/publish` |
| runtime-ui 渲染引擎 | ✅ 已有 | `getBySlug` API + ComponentRenderer |

### 0.2 缺失部分

| 缺失 | 影响 |
|---|---|
| `ApplicationService.publish()` 方法 | 无应用级发布逻辑 |
| `AppVersion` 模型 | 无版本历史记录 |
| `ChangeLog` 模型 | 无变更追踪 |
| `AppCheck` 模型 | 无预检记录 |
| 预检引擎 | 发布前无法检查配置完整性 |
| 快照收集逻辑 | 无法生成 publishedSnapshot |
| 环境隔离 | runtime-ui 直接读开发态数据 |
| 发布向导 UI | 无发布操作界面 |
| 发布历史 UI | 无版本管理界面 |
| 命名空间自动生成 | 创建应用需手动输入 apiName |

---

## 1. 数据层设计

### 1.1 Prisma Schema 变更

在 `packages/db/prisma/schema.prisma` 中新增三个模型并修改现有模型：

```prisma
/// 应用发布版本 — 每次发布生成一条不可变记录。
model AppVersion {
  id            String           @id @default(cuid())
  tenantId      String           @map("tenant_id")
  appId         String           @map("app_id")
  versionNumber String           // 如 "0.1.0"
  description   String           // 更新说明
  snapshot      Json             // 完整应用配置快照 (AppSnapshot JSON)
  changeSet     Json?            // 变更清单 (ChangeSet JSON)，首次发布为 null
  status        AppVersionStatus @default(PUBLISHED)
  publishedBy   String           @map("published_by")
  publishedAt   DateTime         @default(now()) @map("published_at")

  tenant        Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application   Application  @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([appId])
  @@unique([appId, versionNumber])
  @@map("app_versions")
}

enum AppVersionStatus {
  PUBLISHED
  ROLLED_BACK
}

/// 开发态变更追踪 — 记录每次开发态操作。
model ChangeLog {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  appId             String   @map("app_id")
  module            String   // PAGE | OBJECT | PROCESS | PERMISSION | FUNCTION
  entityType        String   // ObjectMeta | PageMeta | ProcessDef | Role
  entityId          String   @map("entity_id")
  entityName        String?  @map("entity_name")
  changeType        String   // CREATE | UPDATE | DELETE
  changedBy         String   @map("changed_by")
  changeDescription String?  @map("change_description")
  changedAt         DateTime @default(now()) @map("changed_at")

  tenant       Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application  Application @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([appId])
  @@index([appId, module])
  @@map("change_logs")
}

/// 应用预检记录 — 记录每次预检的结果。
model AppCheck {
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  appId        String   @map("app_id")
  result       String   // PASS | FAIL
  issues       Json?    // 问题列表 JSON
  checkedBy    String   @map("checked_by")
  checkedAt    DateTime @default(now()) @map("checked_at")

  tenant       Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  application  Application @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([appId])
  @@map("app_checks")
}
```

修改现有模型（新增关联）：

```prisma
model Application {
  // ... 已有字段保持不变 ...
  versions    AppVersion[]
  changeLogs  ChangeLog[]
  checks      AppCheck[]
}

model Tenant {
  // ... 已有字段保持不变 ...
  appVersions AppVersion[]
  changeLogs  ChangeLog[]
  appChecks   AppCheck[]
}
```

### 1.2 Migration 执行

```bash
cd packages/db
npx prisma migrate dev --name add_app_publish_models
```

### 1.3 Seed 数据

无需修改 seed 脚本。新模型在发布流程中被动态创建，不需要预置数据。

---

## 2. 共享类型契约设计

在 `packages/shared/src/application/index.ts` 中新增类型：

```typescript
// ============================
// 发布相关类型
// ============================

/** 应用版本状态 */
export enum AppVersionStatus {
  Published = 'PUBLISHED',
  RolledBack = 'ROLLED_BACK',
}

/** 发布应用请求 */
export interface PublishAppRequest {
  /** 语义化版本号，如 "0.1.0" */
  version: string;
  /** 更新说明（必填） */
  description: string;
}

/** 应用版本记录 */
export interface AppVersion {
  id: string;
  appId: AppId;
  versionNumber: string;
  description: string;
  snapshot: AppSnapshot;
  changeSet: ChangeSet | null;
  status: AppVersionStatus;
  publishedBy: UserId;
  publishedAt: ISODateString;
}

/** 应用配置快照 — 发布时生成的完整配置 JSON */
export interface AppSnapshot {
  meta: {
    appId: AppId;
    appName: string;
    apiName: string;
    version: string;
    publishedAt: ISODateString;
    publishedBy: UserId;
  };
  objects: Array<{
    id: string;
    apiName: string;
    name: string;
    fields: Array<{
      id: string;
      apiName: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      isRequired: boolean;
      isUnique: boolean;
      isSystem: boolean;
    }>;
    views: Array<{
      id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
    }>;
  }>;
  pages: Array<{
    id: string;
    apiName: string;
    name: string;
    type: string;
    schema: Record<string, unknown>;
    objectId: string | null;
  }>;
  processes: Array<{
    id: string;
    apiName: string;
    name: string;
    workflowSchema: Record<string, unknown>;
    triggerType: string;
    bpmnXml: string | null;
  }>;
  permissions: {
    roles: Array<{
      id: string;
      name: string;
      apiName: string;
      rules: Array<{
        id: string;
        permissionType: string;
        action: string;
        conditions: Record<string, unknown> | null;
        fieldScope: string[] | null;
      }>;
    }>;
  };
}

/** 预检结果 */
export interface CheckResult {
  status: 'PASS' | 'FAIL';
  issues: Array<{
    level: 'ERROR' | 'WARNING' | 'INFO';
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION';
    entityId: string;
    entityName: string;
    message: string;
    suggestion: string | null;
  }>;
  checkedAt: ISODateString;
  checkedBy: UserId;
}

/** 变更清单 */
export interface ChangeSet {
  modules: Array<{
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION' | 'FUNCTION';
    changes: Array<{
      entityId: string;
      entityName: string;
      changeType: 'CREATE' | 'UPDATE' | 'DELETE';
      changedBy: string;
      changedAt: string;
      description: string;
    }>;
  }>;
  baselineVersion: string | null;
}

/** 变更追踪记录 */
export interface ChangeLogEntry {
  id: string;
  appId: AppId;
  module: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  changedBy: UserId;
  changeDescription: string | null;
  changedAt: ISODateString;
}
```

修改现有类型：

```typescript
/** 修改 CreateAppRequest — apiName 改为可选（后端自动生成） */
export interface CreateAppRequest {
  /** API 名称（可选，不传则自动生成 package_xxxxxx 格式） */
  apiName?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}
```

---

## 3. 后端架构设计

### 3.1 文件结构

```
apps/gateway/src/application/
├── application.module.ts          # 模块定义（修改：新增 providers）
├── application.controller.ts      # 控制器（修改：新增发布相关端点）
├── application.service.ts         # 应用 CRUD 服务（修改：新增 publish/check/rollback）
├── snapshot.service.ts            # ★ 新增：快照收集服务
├── check.service.ts               # ★ 新增：预检引擎服务
├── changelog.service.ts           # ★ 新增：变更追踪服务
└── changelog.interceptor.ts       # ★ 新增：变更追踪拦截器（自动记录开发态操作）
```

### 3.2 快照收集服务 (SnapshotService)

**职责**：收集应用下所有模块的开发态配置，序列化为 `AppSnapshot` JSON。

```typescript
@Injectable()
export class SnapshotService {
  /**
   * 收集应用完整配置快照。
   * 查询应用下所有对象(含字段+视图)、页面(含schema)、流程(含workflowSchema)、权限(角色+规则)。
   */
  async collectSnapshot(tenantId: string, appId: string): Promise<AppSnapshot> {
    // 1. 查询 Application 基本信息
    // 2. 查询所有 ObjectMeta（含 fields、views）
    // 3. 查询所有 PageMeta（含 schema）
    // 4. 查询所有 ProcessDef（含 workflowSchema、bpmnXml）
    // 5. 查询所有 Role（含 PermissionRule）
    // 6. 组装为 AppSnapshot 结构
    // 7. 返回
  }
}
```

**关键实现细节**：
- 使用 `prisma.application.findFirst` + `include` 嵌套查询一次性拉取所有关联数据
- 避免循环查询（N+1 问题），使用 Prisma 的嵌套 include
- 快照中的 `schema`/`workflowSchema`/`config` 等 JSON 字段直接从数据库读取，不做转换

### 3.3 预检引擎服务 (CheckService)

**职责**：发布前检查应用配置完整性，返回 `CheckResult`。

```typescript
@Injectable()
export class CheckService {
  /**
   * 执行预检。
   * 遍历所有模块，运行检查规则，收集问题。
   */
  async check(tenantId: string, appId: string, checkedBy: string): Promise<CheckResult> {
    const snapshot = await this.snapshotService.collectSnapshot(tenantId, appId);
    const issues: CheckResult['issues'] = [];

    // 运行各模块检查器
    issues.push(...this.checkPages(snapshot));
    issues.push(...this.checkProcesses(snapshot));
    issues.push(...this.checkObjects(snapshot));
    issues.push(...this.checkPermissions(snapshot));

    const result: CheckResult = {
      status: issues.some(i => i.level === 'ERROR') ? 'FAIL' : 'PASS',
      issues,
      checkedAt: new Date().toISOString(),
      checkedBy,
    };

    // 持久化检查记录
    await prisma.appCheck.create({ data: { ... } });

    return result;
  }

  /** 检查页面：绑定的对象是否存在 */
  private checkPages(snapshot: AppSnapshot): CheckResult['issues'] {
    // 对每个页面，如果 objectId 不为空，检查是否在 snapshot.objects 中存在
  }

  /** 检查流程：触发器配置、节点引用 */
  private checkProcesses(snapshot: AppSnapshot): CheckResult['issues'] {
    // 对每个流程，检查 triggerType 不为空
    // 检查条件节点引用的变量/字段是否存在
  }

  /** 检查对象：字段配置完整性 */
  private checkObjects(snapshot: AppSnapshot): CheckResult['issues'] {
    // 对每个对象的关联字段，检查目标对象是否存在
  }

  /** 检查权限：规则目标存在性 */
  private checkPermissions(snapshot: AppSnapshot): CheckResult['issues'] {
    // 对每条权限规则，检查目标资源是否存在
  }
}
```

### 3.4 变更追踪服务 (ChangeLogService)

**职责**：记录开发态操作，生成变更清单。

```typescript
@Injectable()
export class ChangeLogService {
  /**
   * 记录一条变更日志。
   * 在各 service 的 create/update/delete 操作后调用。
   */
  async log(params: {
    tenantId: string;
    appId: string;
    module: string;        // PAGE | OBJECT | PROCESS | PERMISSION
    entityType: string;    // ObjectMeta | PageMeta | ProcessDef | Role
    entityId: string;
    entityName?: string;
    changeType: string;    // CREATE | UPDATE | DELETE
    changedBy: string;
    changeDescription?: string;
  }): Promise<void> {
    await prisma.changeLog.create({ data: { ...params } });
  }

  /**
   * 获取自上次发布以来的变更清单。
   * 对比当前开发态与上次发布快照，生成 ChangeSet。
   */
  async getChangeSet(tenantId: string, appId: string): Promise<ChangeSet> {
    // 1. 获取最近一次 PUBLISHED 的 AppVersion
    // 2. 若无历史版本，返回 { modules: [...所有当前资源作为 CREATE...], baselineVersion: null }
    // 3. 若有历史版本，对比快照中的资源列表与当前开发态：
    //    - 在当前但不在快照中 → CREATE
    //    - 在两者中但内容不同 → UPDATE
    //    - 在快照中但不在当前 → DELETE
    // 4. 按 module 分组返回
  }
}
```

**变更追踪植入策略**：

有两种方案实现变更追踪的自动记录：

**方案 A（推荐）：在各 Service 中显式调用**

在 `ObjectService`/`PageService`/`ProcessService`/`PermissionService` 的 create/update/delete 方法中，操作成功后调用 `changeLogService.log()`。

优点：精确控制，可附带描述信息。
缺点：需修改多个 service 文件。

**方案 B：NestJS 拦截器**

创建 `ChangeLogInterceptor`，在写操作（POST/PUT/DELETE）的 controller 路由上挂载，自动从请求中提取信息。

优点：不侵入 service 代码。
缺点：无法获取变更前后的 diff，描述信息不够精确。

**推荐方案 A**，因为变更描述的精确性对用户体验很重要。

### 3.5 应用服务扩展 (ApplicationService)

在现有 `ApplicationService` 中新增方法：

```typescript
@Injectable()
export class ApplicationService {
  // ... 已有 CRUD 方法保持不变 ...

  /**
   * 创建应用 — apiName 自动生成。
   * 修改现有 create 方法：若 req.apiName 未传，自动生成 package_xxxxxx 格式。
   */
  async create(tenantId: string, createdBy: string, req: CreateAppRequest): Promise<Application> {
    const apiName = req.apiName || this.generateApiName();
    // ... 创建逻辑 ...
    // 创建后自动初始化预置数据（P1，可延后）
  }

  /**
   * 生成命名空间 — package_ + 6位随机十六进制 + __c
   */
  private generateApiName(): string {
    const hex = Math.random().toString(16).substring(2, 8);
    return `package_${hex}`;
  }

  /**
   * 发布应用 — 核心方法。
   */
  async publish(
    tenantId: string,
    appId: string,
    publishedBy: string,
    req: PublishAppRequest,
  ): Promise<AppVersion> {
    // 1. 执行预检
    const checkResult = await this.checkService.check(tenantId, appId, publishedBy);
    if (checkResult.status === 'FAIL') {
      throw new BadRequestException({
        message: '预检未通过，请修复以下问题后再发布',
        issues: checkResult.issues.filter(i => i.level === 'ERROR'),
      });
    }

    // 2. 收集快照
    const snapshot = await this.snapshotService.collectSnapshot(tenantId, appId);

    // 3. 生成变更清单
    const changeSet = await this.changeLogService.getChangeSet(tenantId, appId);

    // 4. 创建 AppVersion 记录
    const version = await prisma.appVersion.create({
      data: {
        tenantId,
        appId,
        versionNumber: req.version,
        description: req.description,
        snapshot: snapshot as any,
        changeSet: changeSet as any,
        status: 'PUBLISHED',
        publishedBy,
      },
    });

    // 5. 更新 Application 状态
    await prisma.application.update({
      where: { id: appId },
      data: {
        status: 'PUBLISHED',
        version: { increment: 1 },
        publishedSnapshot: snapshot as any,
        publishedAt: new Date(),
      },
    });

    // 6. 同步发布各子资源（页面/流程的 isPublished/status）
    await this.syncResourcePublishStatus(tenantId, appId);

    return version;
  }

  /**
   * 回滚到指定版本。
   */
  async rollback(
    tenantId: string,
    appId: string,
    versionId: string,
    rolledBackBy: string,
  ): Promise<AppVersion> {
    // 1. 查找目标版本
    const targetVersion = await prisma.appVersion.findFirst({
      where: { id: versionId, tenantId, appId, status: 'PUBLISHED' },
    });
    if (!targetVersion) throw new NotFoundException('版本不存在');

    // 2. 将目标版本的快照写回 Application.publishedSnapshot
    await prisma.application.update({
      where: { id: appId },
      data: {
        publishedSnapshot: targetVersion.snapshot,
        publishedAt: new Date(),
      },
    });

    // 3. 将原版本标记为 ROLLED_BACK（可选，也可保留 PUBLISHED）
    // 4. 创建新的回滚版本记录
    const rollbackVersion = await prisma.appVersion.create({
      data: {
        tenantId,
        appId,
        versionNumber: this.incrementVersion(targetVersion.versionNumber),
        description: `回滚到版本 ${targetVersion.versionNumber}`,
        snapshot: targetVersion.snapshot,
        changeSet: null,
        status: 'PUBLISHED',
        publishedBy: rolledBackBy,
      },
    });

    return rollbackVersion;
  }

  /**
   * 获取版本列表。
   */
  async listVersions(tenantId: string, appId: string): Promise<AppVersion[]> {
    return prisma.appVersion.findMany({
      where: { tenantId, appId },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * 同步子资源发布状态。
   * 将所有页面 isPublished 置为 true，所有流程 status 置为 PUBLISHED。
   */
  private async syncResourcePublishStatus(tenantId: string, appId: string): Promise<void> {
    await prisma.pageMeta.updateMany({
      where: { tenantId, appId },
      data: { isPublished: true },
    });
    await prisma.processDef.updateMany({
      where: { tenantId, appId },
      data: { status: 'PUBLISHED' },
    });
  }

  /**
   * 版本号递增（patch +1）。
   */
  private incrementVersion(version: string): string {
    const [major, minor, patch] = version.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }
}
```

### 3.6 控制器扩展 (ApplicationController)

新增端点：

```typescript
@Controller('apps')
@UseGuards(PermissionGuard)
export class ApplicationController {
  // ... 已有 CRUD 端点保持不变 ...

  @Post(':appId/check')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async check(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const result = await this.appService.checkService.check(
      req.user.tenantId, appId, req.user.id
    );
    return { ok: true as const, data: result };
  }

  @Get(':appId/checks')
  async listChecks(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const checks = await prisma.appCheck.findMany({
      where: { tenantId: req.user.tenantId, appId },
      orderBy: { checkedAt: 'desc' },
      take: 20,
    });
    return { ok: true as const, data: checks };
  }

  @Get(':appId/changes')
  async getChanges(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const changeSet = await this.appService.changeLogService.getChangeSet(
      req.user.tenantId, appId
    );
    return { ok: true as const, data: changeSet };
  }

  @Post(':appId/publish')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async publish(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: PublishAppRequest,
  ) {
    const version = await this.appService.publish(
      req.user.tenantId, appId, req.user.id, body
    );
    return { ok: true as const, data: version };
  }

  @Get(':appId/versions')
  async listVersions(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const versions = await this.appService.listVersions(req.user.tenantId, appId);
    return { ok: true as const, data: versions };
  }

  @Get(':appId/versions/:versionId')
  async getVersion(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('versionId') versionId: string,
  ) {
    const version = await prisma.appVersion.findFirst({
      where: { id: versionId, tenantId: req.user.tenantId, appId },
    });
    if (!version) throw new NotFoundException('版本不存在');
    return { ok: true as const, data: version };
  }

  @Post(':appId/versions/:versionId/rollback')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async rollback(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('versionId') versionId: string,
  ) {
    const version = await this.appService.rollback(
      req.user.tenantId, appId, versionId, req.user.id
    );
    return { ok: true as const, data: version };
  }
}
```

### 3.7 环境隔离 — 修改 PageService

修改 `PageService.getBySlug()` 方法，改为从 publishedSnapshot 读取：

```typescript
// apps/gateway/src/page/page.service.ts

/**
 * 通过 slug 获取已发布页面（运行态使用）。
 * 修改：从 Application.publishedSnapshot 中读取页面 schema，而非 PageMeta.schema。
 */
async getPublishedBySlug(tenantId: string, appId: string, slug: string): Promise<PageMeta | null> {
  // 1. 查询 Application，获取 publishedSnapshot
  const app = await prisma.application.findFirst({
    where: { id: appId, tenantId },
  });
  if (!app || !app.publishedSnapshot) return null;

  // 2. 从快照中查找匹配 apiName 的页面
  const snapshot = app.publishedSnapshot as AppSnapshot;
  const pageData = snapshot.pages.find(p => p.apiName === slug);
  if (!pageData) return null;

  // 3. 返回快照中的页面数据（而非数据库中的开发态 PageMeta）
  return {
    id: pageData.id,
    apiName: pageData.apiName,
    name: pageData.name,
    type: pageData.type,
    schema: pageData.schema,
    objectId: pageData.objectId,
    isPublished: true,
    // ...
  } as PageMeta;
}
```

对应控制器修改：

```typescript
// page.controller.ts
@Get('apps/:appId/pages/slug/:slug')
async getBySlug(@Req() req: AuthenticatedRequest, ...) {
  // 修改：调用 getPublishedBySlug 而非直接查 PageMeta
  const page = await this.pageService.getPublishedBySlug(
    req.user.tenantId, appId, slug
  );
  if (!page) throw new NotFoundException('页面未发布或不存在');
  return { ok: true as const, data: page };
}
```

---

## 4. 前端架构设计

### 4.1 文件结构

```
packages/studio/src/
├── pages/
│   ├── PublishWizard.tsx          # ★ 新增：发布向导页面
│   ├── CheckPanel.tsx             # ★ 新增：预检面板
│   └── VersionHistory.tsx         # ★ 新增：发布历史页面
├── components/publish/
│   ├── ChangeSetViewer.tsx        # ★ 新增：变更清单展示组件
│   ├── CheckResultList.tsx        # ★ 新增：检查结果列表
│   └── VersionTable.tsx           # ★ 新增：版本列表表格
├── api/
│   └── publish.ts                 # ★ 新增：发布相关 API
└── router.tsx                     # 修改：新增发布相关路由

packages/runtime-ui/src/
└── (无需修改，getBySlug API 改后自动生效)
```

### 4.2 路由新增

```typescript
// packages/studio/src/router.tsx 新增路由

// 发布向导
<Route path="publish" element={<PublishWizard />} />
// 预检面板（可作为构建器内嵌面板，也支持独立路由）
<Route path="check" element={<CheckPanel />} />
// 发布历史
<Route path="versions" element={<VersionHistory />} />
```

### 4.3 API 客户端

```typescript
// packages/studio/src/api/publish.ts

export interface PublishParams {
  version: string;
  description: string;
}

export const publishApi = {
  /** 执行预检 */
  check: (appId: string) =>
    client.post<ApiResponse<CheckResult>>(`/api/apps/${appId}/check`)
      .then(res => res.data.data),

  /** 获取预检记录 */
  listChecks: (appId: string) =>
    client.get<ApiResponse<AppCheck[]>>(`/api/apps/${appId}/checks`)
      .then(res => res.data.data),

  /** 获取变更清单 */
  getChanges: (appId: string) =>
    client.get<ApiResponse<ChangeSet>>(`/api/apps/${appId}/changes`)
      .then(res => res.data.data),

  /** 发布应用 */
  publish: (appId: string, params: PublishParams) =>
    client.post<ApiResponse<AppVersion>>(`/api/apps/${appId}/publish`, params)
      .then(res => res.data.data),

  /** 获取版本列表 */
  listVersions: (appId: string) =>
    client.get<ApiResponse<AppVersion[]>>(`/api/apps/${appId}/versions`)
      .then(res => res.data.data),

  /** 获取版本详情 */
  getVersion: (appId: string, versionId: string) =>
    client.get<ApiResponse<AppVersion>>(`/api/apps/${appId}/versions/${versionId}`)
      .then(res => res.data.data),

  /** 回滚到指定版本 */
  rollback: (appId: string, versionId: string) =>
    client.post<ApiResponse<AppVersion>>(`/api/apps/${appId}/versions/${versionId}/rollback`)
      .then(res => res.data.data),
};
```

### 4.4 发布向导组件 (PublishWizard)

```typescript
// packages/studio/src/pages/PublishWizard.tsx

/**
 * 发布向导 — 三步流程。
 *
 * 步骤 1: 版本信息（版本号 + 更新说明）
 * 步骤 2: 变更内容（自动生成的变更清单）
 * 步骤 3: 确认发布
 */
export default function PublishWizard() {
  const { appId } = useParams();
  const [current, setCurrent] = useState(0);
  const [version, setVersion] = useState('0.1.0');
  const [description, setDescription] = useState('');
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null);

  // 获取变更清单
  const { data: changes } = useQuery({
    queryKey: ['publish-changes', appId],
    queryFn: () => publishApi.getChanges(appId!),
    enabled: !!appId,
  });

  // 发布 mutation
  const publishMutation = useMutation({
    mutationFn: () => publishApi.publish(appId!, { version, description }),
    onSuccess: () => {
      message.success('发布成功');
      navigate(`/app/${appId}/versions`);
    },
  });

  // Steps: 版本信息 → 变更内容 → 确认发布
  const steps = [
    { title: '版本信息', content: <VersionInfoStep ... /> },
    { title: '变更内容', content: <ChangeSetViewer changeSet={changes} /> },
    { title: '确认发布', content: <ConfirmStep ... /> },
  ];

  return (
    <Card>
      <Steps current={current} items={steps.map(s => ({ title: s.title }))} />
      <div style={{ marginTop: 24 }}>{steps[current].content}</div>
      <div style={{ marginTop: 24, textAlign: 'right' }}>
        {current > 0 && <Button onClick={() => setCurrent(current - 1)}>上一步</Button>}
        {current < steps.length - 1 ? (
          <Button type="primary" disabled={...} onClick={() => setCurrent(current + 1)}>
            下一步
          </Button>
        ) : (
          <Button type="primary" loading={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}>
            确认发布
          </Button>
        )}
      </div>
    </Card>
  );
}
```

### 4.5 预检面板组件 (CheckPanel)

```typescript
// packages/studio/src/pages/CheckPanel.tsx

/**
 * 预检面板 — 可内嵌在构建器右侧或底部。
 *
 * 交互流程:
 * 1. 点击「检查」按钮 → 打开面板
 * 2. 首次显示「立即检查」按钮
 * 3. 点击后显示进度（loading）
 * 4. 完成后显示结果列表或「暂无问题」
 * 5. 支持「重新检查」
 */
export default function CheckPanel({ appId }: { appId: string }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  const checkMutation = useMutation({
    mutationFn: () => publishApi.check(appId),
    onMutate: () => setChecking(true),
    onSuccess: (data) => {
      setResult(data);
      setChecking(false);
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Text strong>问题</Text>
        {result && (
          <Text type="secondary">最近检查 {formatTime(result.checkedAt)}</Text>
        )}
      </div>
      {!result && !checking && (
        <Button onClick={() => checkMutation.mutate()}>立即检查</Button>
      )}
      {checking && <Progress percent={50} status="active" />}
      {result && (
        <>
          {result.issues.length === 0 ? (
            <Empty description="暂无问题" />
          ) : (
            <CheckResultList issues={result.issues} />
          )}
          <Button onClick={() => checkMutation.mutate()}>重新检查</Button>
        </>
      )}
    </div>
  );
}
```

### 4.6 构建器顶部工具栏修改

在 `StudioLayout` 或构建器顶部工具栏中添加「检查」和「发布」按钮：

```typescript
// 在构建器顶部工具栏区域新增
<Space>
  <Button icon={<CheckCircleOutlined />} onClick={() => setCheckPanelOpen(true)}>
    检查
  </Button>
  <Button type="primary" onClick={() => navigate(`/app/${appId}/publish`)}>
    发布
  </Button>
</Space>

// 检查面板作为 Drawer 或 折叠面板嵌入
<Drawer title="预检" open={checkPanelOpen} onClose={() => setCheckPanelOpen(false)}>
  <CheckPanel appId={appId} />
</Drawer>
```

### 4.7 应用创建流程修改

修改 `AppList.tsx` 中的创建表单：

```typescript
// 修改创建应用弹窗
const CreateAppModal = () => {
  // apiName 不再需要用户手动输入，后端自动生成
  // 新增图标选择器（P1，可先用预设图标列表）
  // 新增颜色选择器（P1）

  return (
    <Modal title="新建应用" ...>
      <Form>
        <Form.Item label="图标">
          <IconPicker value={icon} onChange={setIcon} />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input placeholder="输入应用名称" />
        </Form.Item>
        <Form.Item label="描述">
          <Input.TextArea placeholder="简要描述应用用途" />
        </Form.Item>
        {/* apiName 不再显示在表单中，由后端自动生成 */}
      </Form>
    </Modal>
  );
};
```

---

## 5. 数据流图

### 5.1 发布流程数据流

```
用户点击「发布」
  ↓
前端: navigate('/app/:appId/publish')
  ↓
前端: GET /api/apps/:appId/changes → 获取变更清单
  ↓
用户填写版本号 + 更新说明 → 点击「确认发布」
  ↓
前端: POST /api/apps/:appId/publish { version, description }
  ↓
后端 ApplicationService.publish():
  ├── CheckService.check()
  │     ├── SnapshotService.collectSnapshot() → 收集开发态配置
  │     ├── 运行检查规则 → 收集 issues
  │     ├── 写入 AppCheck 记录
  │     └── 若有 ERROR → 抛出 BadRequestException
  ├── SnapshotService.collectSnapshot() → 再次收集完整快照
  ├── ChangeLogService.getChangeSet() → 生成变更清单
  ├── prisma.appVersion.create() → 写入版本记录（不可变快照）
  ├── prisma.application.update() → 更新状态/版本号/快照/发布时间
  └── syncResourcePublishStatus() → 同步子资源发布状态
  ↓
返回 AppVersion
  ↓
前端: message.success('发布成功') → navigate('/app/:appId/versions')
```

### 5.2 运行态读取数据流

```
业务用户访问 runtime-ui
  ↓
前端: GET /api/apps/:appId/pages/slug/:slug
  ↓
后端 PageService.getPublishedBySlug():
  ├── 查询 Application.publishedSnapshot
  ├── 从快照 JSON 中查找匹配 apiName 的页面
  └── 返回快照中的页面 schema
  ↓
runtime-ui ComponentRenderer 渲染页面
```

### 5.3 回滚数据流

```
管理员在发布历史页面点击「回滚」
  ↓
前端: POST /api/apps/:appId/versions/:versionId/rollback
  ↓
后端 ApplicationService.rollback():
  ├── 查找目标 AppVersion
  ├── 将目标版本快照写回 Application.publishedSnapshot
  └── 创建新的 AppVersion 记录（描述为「回滚到版本 x.y.z」）
  ↓
runtime-ui 自动读取新的 publishedSnapshot → 恢复旧版本内容
```

---

## 6. 实现顺序

按依赖关系排序的实现步骤：

| 步骤 | 任务 | 依赖 | 预估工期 |
|------|------|------|---------|
| 1 | Prisma schema 新增 AppVersion/ChangeLog/AppCheck + migration | 无 | 0.5天 |
| 2 | shared 类型契约新增 PublishAppRequest/AppSnapshot/CheckResult/ChangeSet | 步骤1 | 0.5天 |
| 3 | SnapshotService — 快照收集服务 | 步骤1,2 | 1天 |
| 4 | CheckService — 预检引擎 | 步骤3 | 1天 |
| 5 | ChangeLogService — 变更追踪服务 | 步骤1,2 | 0.5天 |
| 6 | ApplicationService.publish()/rollback()/listVersions() | 步骤3,4,5 | 1天 |
| 7 | ApplicationController 新增发布相关端点 | 步骤6 | 0.5天 |
| 8 | PageService.getPublishedBySlug() — 环境隔离 | 步骤2 | 0.5天 |
| 9 | 前端 publish.ts API 客户端 | 步骤2,7 | 0.5天 |
| 10 | 前端 PublishWizard 发布向导 | 步骤9 | 1.5天 |
| 11 | 前端 CheckPanel 预检面板 | 步骤9 | 1天 |
| 12 | 前端 VersionHistory 发布历史 | 步骤9 | 0.5天 |
| 13 | 构建器工具栏集成（检查/发布按钮） | 步骤10,11 | 0.5天 |
| 14 | 应用创建流程修改（apiName 自动生成） | 步骤2 | 0.5天 |
| 15 | 在各 Service 中植入 ChangeLog 调用 | 步骤5 | 1天 |
| 16 | E2E 测试 | 全部 | 1天 |

**总预估：10-11天**

---

## 7. 风险与注意事项

### 7.1 快照大小

完整快照可能较大（含所有对象的字段定义、页面 schema、流程 workflowSchema）。
- **预估**：中等规模应用（10对象×20字段+20页面+10流程）快照约 100KB-500KB
- **PostgreSQL JSON** 字段无大小限制（受 row 总大小 1GB 限制）
- **无需压缩**，但应避免在列表 API 中返回 snapshot 字段

### 7.2 变更追踪植入

需要在 `ObjectService`/`PageService`/`ProcessService`/`PermissionService` 的 create/update/delete 方法中植入 `changeLogService.log()` 调用。需注意：
- 在事务成功后调用，避免记录失败的操作
- 不阻塞主操作（catch 错误后静默失败，不影响业务）
- 变更追踪的失败不应导致主操作回滚

### 7.3 预检规则覆盖度

初始版本预检规则可以精简，优先覆盖 ERROR 级别：
- 页面绑定对象存在性检查
- 流程触发器配置完整性检查
- 对象关联字段目标存在性检查

WARNING 和 INFO 级别可后续迭代补充。

### 7.4 与现有页面/流程级发布的关系

当前有页面级 `POST /pages/:id/publish` 和流程级 `POST /processes/:id/publish`。
- 应用级发布 `POST /apps/:id/publish` 发布后会同步设置所有子资源的发布状态
- 保留页面/流程级发布 API（可用于单独发布单个资源，不走完整快照流程）
- 但推荐用户使用应用级发布，确保版本一致性

### 7.5 版本号冲突

`AppVersion` 有 `@@unique([appId, versionNumber])` 约束，如果用户手动输入了已存在的版本号会冲突。
- 前端预检：发布前检查版本号是否已存在
- 后端兜底：捕获 Prisma unique constraint 错误，返回友好提示
