# 租户管理 + 平台级角色体系

## 问题概述

当前系统：无租户管理 API/UI，角色只有 ADMIN（靠短路）和 BUILDER，缺 END_USER，登录不区分租户（跨租户 email 冲突隐患），用户管理端点无权限保护。

## 角色体系设计

```
平台级（跨租户）
├── SUPER_ADMIN — User.isPlatformAdmin=true，管理所有租户（创建/启停/分配租户管理员）

租户级（appId=null，租户内共享）
├── TENANT_ADMIN — 租户管理员，管理本租户用户/组织/角色/应用（短路权限检查）
├── BUILDER — 应用搭建者，搭建对象/页面/流程（已有 18 条权限规则）
└── END_USER — 终端用户，使用已发布应用/提交/审批

应用级（appId=非空，搭建者自定义）
└── 如"审批人"、"录入员" — 由 BUILDER 按应用需求创建
```

## 一、数据库 Schema 变更

**文件**: `packages/db/prisma/schema.prisma`

### User 模型
- 新增 `isPlatformAdmin Boolean @default(false) @map("is_platform_admin")`
- `tenantId` 改为可空 `String?` — 平台超管不属于任何租户
- `tenant` 关系改为可选 `Tenant?`
- 唯一约束 `@@unique([tenantId, email])` 保持（PostgreSQL 中 NULL 视为唯一，平台超管之间不会冲突）

### Tenant 模型
- 新增 `description String?` — 租户描述

### 生成迁移
- `npx prisma migrate dev --name add_platform_admin_and_tenant_mgmt`

## 二、后端实现

### 2.1 认证流程改造

**`apps/gateway/src/auth/auth.service.ts`**:
- `login()` 签名改为 `login(email, password, tenantSlug?: string)`
- 若 `tenantSlug` 提供：解析 slug → tenantId，在指定租户内查用户 `findFirst({ where: { email, tenantId, status: 'ACTIVE' } })`
- 若无 `tenantSlug`：查平台超管 `findFirst({ where: { email, isPlatformAdmin: true, status: 'ACTIVE' } })`，找不到则报错"请输入租户标识或使用平台管理员账号"
- JWT payload 新增 `isPlatformAdmin: boolean`，`tenantId` 改为 `string | null`
- 返回 `LoginUserDto` 新增 `isPlatformAdmin` 字段

**`apps/gateway/src/auth/auth.controller.ts`**:
- `LoginRequest` 接口新增 `tenantSlug?: string`
- 传递给 `authService.login(email, password, tenantSlug)`

**`apps/gateway/src/auth/jwt.strategy.ts`**:
- `JwtPayload` 接口：`tenantId` 改为 `string | null`，新增 `isPlatformAdmin?: boolean`
- `validate()` 改造：
  - 放宽 tenantId 检查：`if (!payload.sub) throw ...`（允许 tenantId 为 null）
  - 从 DB 查 user 验证 `isPlatformAdmin` 和 `status`（安全检查，防止已禁用的超管仍有效）
  - 平台超管跳过角色加载（roleIds/roleCodes 为空数组）
  - `isSuperAdmin = isPlatformAdmin || roleCodes.includes('TENANT_ADMIN')`
- `AuthenticatedUser` 接口新增 `isPlatformAdmin: boolean`，`tenantId` 改为 `string | null`

**`apps/gateway/src/auth/authenticated-request.ts`**:
- 无需改动（引用 AuthenticatedUser 类型）

### 2.2 新增 TenantModule

**新文件**:
- `apps/gateway/src/tenant/tenant.module.ts`
- `apps/gateway/src/tenant/tenant.service.ts`
- `apps/gateway/src/tenant/tenant.controller.ts`

**API 端点**（全部 `@UseGuards(PlatformAdminGuard)` — 仅平台超管）:
```
POST   /api/tenants              — 创建租户（name, slug, description?）
                                     创建后自动初始化 TENANT_ADMIN/BUILDER/END_USER 三个内置角色 + 权限规则
GET    /api/tenants              — 租户列表（含用户数、应用数统计）
GET    /api/tenants/:id          — 租户详情
PATCH  /api/tenants/:id          — 更新租户（name, description）
POST   /api/tenants/:id/suspend  — 挂起租户（status→SUSPENDED）
POST   /api/tenants/:id/activate — 激活租户（status→ACTIVE）
POST   /api/tenants/:id/admins   — 为租户分配管理员（email, name, password → 创建用户+TENANT_ADMIN角色）
GET    /api/tenants/:id/users    — 查看租户内用户列表（只读）
GET    /api/tenants/:id/apps     — 查看租户内应用列表（只读）
```

**`apps/gateway/src/app.module.ts`**: imports 新增 `TenantModule`

### 2.3 新增 Guards

**新文件**: `apps/gateway/src/auth/platform-admin.guard.ts`
```ts
@Injectable()
export class PlatformAdminGuard extends JwtAuthGuard {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context).then((result) => {
      if (!result) return false;
      const req = context.switchToHttp().getRequest();
      return req.user?.isPlatformAdmin === true;
    });
  }
}
```
用于 TenantModule 所有端点。

**新文件**: `apps/gateway/src/auth/tenant-admin.guard.ts`
```ts
// 检查 isSuperAdmin（包含平台超管 + TENANT_ADMIN）
// 用于用户/组织/角色管理端点
```

### 2.4 权限引擎更新

**`apps/gateway/src/permission/permission.service.ts`**:
- `check()` 短路逻辑不变：`if (user.isSuperAdmin) return { allowed: true }`
- `isSuperAdmin` 已在 JwtStrategy 中包含 `isPlatformAdmin`，无需额外改动

**`apps/gateway/src/permission/permission.guard.ts`**:
- 短路逻辑不变（已有 `if (user.isSuperAdmin)` 检查）

### 2.5 用户管理端点加固

**`apps/gateway/src/permission/user.controller.ts`**:
- `@UseGuards(JwtAuthGuard)` 改为 `@UseGuards(TenantAdminGuard)`
- 仅 TENANT_ADMIN 或平台超管可管理用户

**`apps/gateway/src/permission/role.controller.ts`** 和 **`org.controller.ts`**:
- 同上，改用 `TenantAdminGuard`

### 2.6 AuthModule 更新

**`apps/gateway/src/auth/auth.module.ts`**:
- 新增 `PlatformAdminGuard` 和 `TenantAdminGuard` 到 providers 并 export

## 三、种子数据更新

**文件**: `packages/db/seed.ts`

### 新增平台超管
```
superadmin@apaas.dev / superadmin123
isPlatformAdmin: true, tenantId: null
```

### ADMIN → TENANT_ADMIN 迁移
```ts
// 先迁移已有 ADMIN 角色编码
await prisma.role.updateMany({
  where: { code: 'ADMIN' },
  data: { code: 'TENANT_ADMIN', name: '租户管理员', description: '管理本租户用户、组织、角色和应用' },
});
```
然后 upsert TENANT_ADMIN（若不存在则创建）。

### 新增 END_USER 角色
```ts
code: 'END_USER', name: '终端用户', isBuiltIn: true
```

### END_USER 权限规则（5 条）
```
PAGE:VIEW:*, RECORD:CREATE:*, RECORD:VIEW:*, PROCESS:EXECUTE:*, PROCESS:APPROVE:*
```

### 新增测试用户
```
user@apaas.dev / user123 → END_USER 角色（租户 demo 内）
```

### 测试账号更新
```
平台超管:  superadmin@apaas.dev / superadmin123（无需租户标识）
租户管理员: admin@apaas.dev / admin123（租户标识: demo）
搭建者:    builder@apaas.dev / builder123（租户标识: demo）
终端用户:  user@apaas.dev / user123（租户标识: demo）
```

## 四、前端 Studio 改造

### 4.1 认证 Store

**`packages/studio/src/stores/auth.ts`**:
- `User` 接口新增 `isPlatformAdmin: boolean`，`tenantId` 改为 `string | null`

### 4.2 登录页

**`packages/studio/src/pages/Login.tsx`**:
- 表单新增"租户标识"输入框（可选，placeholder: "留空则使用平台管理员登录"）
- 支持 `/t/:slug/login` 路由参数预填租户标识
- 提交时发送 `{ email, password, tenantSlug }`
- 登录成功后：
  - `isPlatformAdmin === true` → 跳转 `/platform/tenants`
  - 否则 → 跳转 `/apps`
- 更新测试账号提示（4 个账号 + 租户标识说明）

### 4.3 路由

**`packages/studio/src/router.tsx`**:
- 新增 `/t/:slug/login` → `<Login />`（预填 slug）
- 新增 `/platform/tenants` → `<TenantManagement />`（`PlatformAdminRoute` 守卫）
- 新增 `/platform/tenants/:id` → `<TenantDetail />`（`PlatformAdminRoute` 守卫）
- 新增路由守卫组件：
  - `PlatformAdminRoute` — 检查 `user.isPlatformAdmin === true`
  - `TenantAdminRoute` — 检查 `user.isSuperAdmin`（含 TENANT_ADMIN 角色）
- `/platform/users` 和 `/platform/orgs` 改用 `TenantAdminRoute` 守卫

### 4.4 租户管理页面（新文件）

**`packages/studio/src/pages/TenantManagement.tsx`**:
- 租户列表表格（名称、标识、状态、用户数、应用数、创建时间）
- 创建租户弹窗（名称、slug、描述）
- 挂起/激活操作
- 点击进入详情

**`packages/studio/src/pages/TenantDetail.tsx`**:
- 租户基本信息卡片
- 用户列表 Tab（只读）
- 应用列表 Tab（只读）
- 分配管理员按钮（弹窗：email/name/password → POST /tenants/:id/admins）

**`packages/studio/src/api/tenants.ts`**（新文件）:
- `tenantsApi.list() / create() / get() / update() / suspend() / activate() / assignAdmin() / getUsers() / getApps()`

### 4.5 导航栏

**`packages/studio/src/pages/AppList.tsx`**:
- 平台超管：显示"租户管理"入口（替代当前的"平台管理"下拉）
- TENANT_ADMIN：显示"用户管理"+"组织架构"入口
- BUILDER：不显示管理入口
- 平台超管访问 `/apps` 时重定向到 `/platform/tenants`

## 五、前端 Runtime 改造

### 5.1 登录页

**`packages/runtime-ui/src/pages/Login.tsx`**:
- 表单新增"租户标识"输入框（必填）
- 支持 `/t/:slug/login` 路由参数预填
- 提交时发送 `{ email, password, tenantSlug }`
- 移除硬编码的快速登录按钮（或改为带租户标识的版本）

### 5.2 认证 Store

**`packages/runtime-ui/src/stores/auth.ts`**:
- `AuthUser` 接口新增 `tenantId: string | null`

### 5.3 路由

**`packages/runtime-ui/src/router.tsx`**:
- 新增 `/t/:slug/login` → `<Login />`

## 六、构建部署 + 验证

1. `npx prisma migrate dev`（生成并应用迁移）
2. `pnpm --filter @apaas/db exec tsx seed.ts`（重新播种）
3. `pnpm build`
4. `docker compose build --no-cache gateway studio runtime-ui`
5. `docker compose up -d gateway studio runtime-ui`
6. 验证：
   - 平台超管登录（无租户标识）→ 跳转租户管理页 → 创建/挂起租户
   - 租户管理员登录（租户标识 demo）→ 跳转应用列表 → 可管理用户/组织
   - 搭建者登录（租户标识 demo）→ 跳转应用列表 → 不可见管理入口
   - 终端用户登录 → Runtime → 提交申请/审批
   - 多租户隔离：不同租户同 email 可各自登录

## 改动文件清单

**新增** (10 个文件):
- `apps/gateway/src/tenant/tenant.module.ts`
- `apps/gateway/src/tenant/tenant.service.ts`
- `apps/gateway/src/tenant/tenant.controller.ts`
- `apps/gateway/src/auth/platform-admin.guard.ts`
- `apps/gateway/src/auth/tenant-admin.guard.ts`
- `packages/studio/src/pages/TenantManagement.tsx`
- `packages/studio/src/pages/TenantDetail.tsx`
- `packages/studio/src/api/tenants.ts`
- `packages/studio/src/components/RoleRoute.tsx`（路由守卫组件）

**修改** (15 个文件):
- `packages/db/prisma/schema.prisma` — User + Tenant 模型
- `packages/db/seed.ts` — 平台超管 + TENANT_ADMIN + END_USER
- `apps/gateway/src/auth/auth.service.ts` — 登录逻辑
- `apps/gateway/src/auth/auth.controller.ts` — LoginRequest
- `apps/gateway/src/auth/jwt.strategy.ts` — isPlatformAdmin + tenantId 可空
- `apps/gateway/src/auth/auth.module.ts` — 注册新 guards
- `apps/gateway/src/app.module.ts` — 注册 TenantModule
- `apps/gateway/src/permission/user.controller.ts` — TenantAdminGuard
- `apps/gateway/src/permission/role.controller.ts` — TenantAdminGuard
- `apps/gateway/src/permission/org.controller.ts` — TenantAdminGuard
- `packages/studio/src/stores/auth.ts` — User 接口
- `packages/studio/src/pages/Login.tsx` — 租户标识
- `packages/studio/src/router.tsx` — 新路由 + 守卫
- `packages/studio/src/pages/AppList.tsx` — 角色化导航
- `packages/runtime-ui/src/pages/Login.tsx` — 租户标识
- `packages/runtime-ui/src/stores/auth.ts` — AuthUser 接口
- `packages/runtime-ui/src/router.tsx` — /t/:slug/login
