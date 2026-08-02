# 代码审计清理修复计划

基于全域审计结果，按优先级分 4 个阶段执行修复。共涉及 **19 个文件**的修改。

---

## 阶段一：安全漏洞修复（租户隔离）— 🔴 高优先级

### 1.1 修复 permission 模块租户隔离（H-1, H-3）

**关键约束**：`OrgMember` 和 `UserRole` 连接表无 `tenantId` 列，必须通过验证父级实体归属来实现隔离。

**`apps/gateway/src/permission/org.controller.ts`** — 3 个方法补 `@Req()`：
- `addMember`（行60）：加 `@Req() req: AuthenticatedRequest`，调用改为 `this.orgService.addMember(req.user.tenantId, id, body.userId)`
- `removeMember`（行66）：同上，调用改为 `this.orgService.removeMember(req.user.tenantId, id, userId)`
- `revokeRole`（行82）：同上，调用改为 `this.orgService.revokeRole(req.user.tenantId, id, roleId)`

**`apps/gateway/src/permission/org.service.ts`** — 4 个方法加 tenantId 校验：
- `getMembers`（行93）：where 改为 `{ orgId, role: { tenantId } }` 或先校验 org 归属
- `addMember`（行102）：签名加 `tenantId`，先验证 org 和 user 属于该租户，移除 `.catch(() => {})` 改为抛异常
- `removeMember`（行107）：签名加 `tenantId`，先校验 org 归属，移除 `.catch(() => {})`
- `revokeRole`（行121）：签名加 `tenantId`，deleteMany 的 where 加 `tenantId`（`OrgRoleGrant` 有此字段）
- `grantRole`（行114）：补充校验 `orgId`/`roleId` 属于当前租户
- `moveNode`（行85）：补充校验 `parentId` 属于当前租户

**`apps/gateway/src/permission/role.controller.ts`** — 2 个方法补 `@Req()`：
- `assignUsers`（行52）：加 `@Req()`，调用改为 `this.roleService.assignUsers(req.user.tenantId, id, body.userIds)`
- `removeUser`（行58）：加 `@Req()`，调用改为 `this.roleService.removeUser(req.user.tenantId, id, userId)`

**`apps/gateway/src/permission/role.service.ts`** — 3 个方法加 tenantId 校验：
- `getUsers`（行52）：where 改为 `{ roleId, role: { tenantId } }`
- `assignUsers`（行61）：签名加 `tenantId`，先验证 role 和所有 userIds 属于该租户
- `removeUser`（行69）：签名加 `tenantId`，先校验 role 归属再删除

**`apps/gateway/src/permission/user.controller.ts`** — 2 个方法补 `@Req()`：
- `setRoles`（行52）：加 `@Req()`，调用改为 `this.userService.setRoles(req.user.tenantId, id, body.roleIds)`
- `setOrgs`（行58）：加 `@Req()`，调用改为 `this.userService.setOrgs(req.user.tenantId, id, body.orgIds)`

**`apps/gateway/src/permission/user.service.ts`** — 2 个方法加 tenantId 校验：
- `setRoles`（行118）：签名加 `tenantId`，先校验 user 归属和所有 roleIds 属于该租户，deleteMany 加 `user: { tenantId }` 条件
- `setOrgs`（行128）：签名加 `tenantId`，先校验 user 归属和所有 orgIds 属于该租户，deleteMany 加条件
- `create`（行58）：补充校验 `roleIds`/`orgIds` 属于当前租户

### 1.2 修复 object 视图 CRUD 租户隔离（H-2）

**关键约束**：`View` 模型无 `tenantId` 列，通过 `ObjectMeta.tenantId` 间接校验。

**`apps/gateway/src/object/object.controller.ts`** — 4 个方法补 `@Req()`：
- `listViews`（行172）：加 `@Req()`，调用改为 `this.objectService.listViews(req.user.tenantId, objectId)`
- `createView`（行178）：加 `@Req()`，调用改为 `this.objectService.createView(req.user.tenantId, objectId, body)`
- `updateView`（行188）：加 `@Req()`，调用改为 `this.objectService.updateView(req.user.tenantId, viewId, body)`
- `deleteView`（行198）：加 `@Req()`，调用改为 `this.objectService.deleteView(req.user.tenantId, viewId)`

**`apps/gateway/src/object/object.service.ts`** — 4 个方法加 tenantId 校验：
- `listViews`（行358）：签名加 `tenantId`，先校验 object 归属（`findFirst({ where: { id: objectId, tenantId } })`），where 改为 `{ objectId }`（view 表无 tenantId）
- `createView`（行378）：签名加 `tenantId`，存在检查改为 `findFirst({ where: { id: objectId, tenantId } })`
- `updateView`（行408）：签名加 `tenantId`，存在检查改为先查 view 获取 objectId，再校验 object 归属
- `deleteView`（行437）：同上模式

---

## 阶段二：功能修复与异常处理 — 🔴 高优先级

### 2.1 修复 trigger_process 占位实现（H-5/H-14）

**`packages/studio/src/components/page-builder/action-executor.ts`**（行256-261）：
- 将 `console.log` 占位替换为调用 `processesApi.start(processId, { processKey, variables })`
- 导入 `processesApi` from `../../api/processes.js`
- 参考同文件 `call_api` case 的 fetch 模式

**`packages/runtime-ui/src/runtime/action-executor.ts`**（行256-261）：
- 同样替换，但 runtime-ui 无 processesApi，需新建 `api/processes.ts` 或直接用 `client.post('/api/processes/${processId}/start', ...)`

### 2.2 标记通知渠道为未实现（M-11）

**`apps/gateway/src/process/node-executors/notification.executor.ts`**（行77-83）：
- `email` case：改为 `this.logger.warn(...)` 并在返回结果中标记 `success: false, message: '邮件渠道尚未实现'`
- `in_app` case：同上，标记为未实现
- 保持 `webhook` 渠道不变

### 2.3 标记图表渲染为未实现（H-15）

**`packages/runtime-ui/src/runtime/ComponentRenderer.tsx`**（行733-755）：
- 保持占位 div 但添加更明确的"未实现"标记注释
- 可选：在 console.warn 中输出警告

---

## 阶段三：死代码删除 — 🔴🟡 中高优先级

### 3.1 删除 gateway 死代码（M-1, M-2, M-3, M-4, M-5, M-6）

| 文件 | 删除内容 | 行号 |
|------|----------|------|
| `auth/auth.service.ts` | `validateUser()` 方法 | 65-74 |
| `permission/permission.service.ts` | `can()` 方法 | 115-127 |
| `permission/permission.service.ts` | `getUserOrgIds()` 方法 | 49-55 |
| `application/changelog.service.ts` | `listChanges()` 方法 | 114-137 |
| `process/process-utils.ts` | `renderTemplate()` 函数 | 21-30 |
| `process/node-executor.registry.ts` | `has()` 方法 | 78-80 |

### 3.2 删除 studio 死代码（H-8, H-13, M-8, M-9, M-10）

| 文件 | 删除内容 |
|------|----------|
| `features/process/simplified/src/SimplifiedProcessEditor.tsx` | **整个文件删除** |
| `features/process/simplified/src/index.ts` | 删除行10-11 的 `SimplifiedProcessEditor` re-export |
| `src/api/permissions.ts` | 删除 `permissionsApi`（行218-222） |
| `src/components/page-builder/ComponentRenderer.tsx` | 删除 `getComponentIcon`（行1087-1089） |
| `src/components/process/NodeConfigPanel.tsx` | 删除 `useSelectedNode`（行252-257） |
| `src/api/processes.ts` | 删除 11 个未消费的 re-export（行33-44 中除 `WorkflowSchema`、`WorkflowNode` 外的） |
| `src/constants/pageComponents.ts` | 删除 `COMPONENT_EVENTS`（行326-338）、`ACTION_TYPE_META`（行341-354） |

### 3.3 删除 shared 包死导出（H-6, H-7, H-9, H-10, H-11, H-12）

**`packages/shared/src/permission/index.ts`** — 删除 4 个完全无引用的类型：
- `PermissionContext`、`PermissionCheckRequest`、`PermissionCheckResult`、`AuditLog`

**`packages/shared/src/common/index.ts`** — 删除 7 个死导出：
- `asFieldId`、`asRecordId`、`asViewId`、`asProcessId`、`asRoleId`（5 个 helper）
- `PaginationParams`、`SortParam`（2 个分页类型）

**`packages/shared/src/object/index.ts`** — 删除 8 个完全无引用的类型：
- `LookupConfig`、`RelationType`、`SubFormConfig`、`AutoNumberConfig`
- `QueryRecordsRequest`、`QueryRecordsResponse`、`CreateRecordRequest`、`UpdateRecordRequest`

**`packages/shared/src/process/index.ts`** — 删除 3 个死导出：
- `LoopConfig`、`StartProcessRequest`、`TaskRunRequest`

**`packages/shared/src/application/index.ts`** — 删除 1 个死导出：
- `AppEnv`

### 3.4 删除冗余注入（M-16）

**`apps/gateway/src/application/application.controller.ts`**：
- 删除行15 `import { CheckService }`
- 删除行34 构造函数中的 `private readonly checkService: CheckService`

---

## 阶段四：验证

1. **TypeScript 编译检查**：对每个修改过的包运行 `tsc --noEmit` 确认无类型错误
2. **构建验证**：运行 `pnpm build` 确认整个 monorepo 构建通过
3. **Grep 验证**：确认删除的符号不再被任何文件引用

---

## 修改文件清单（共 19 个文件）

### 修改文件（17 个）：
1. `apps/gateway/src/permission/org.controller.ts`
2. `apps/gateway/src/permission/org.service.ts`
3. `apps/gateway/src/permission/role.controller.ts`
4. `apps/gateway/src/permission/role.service.ts`
5. `apps/gateway/src/permission/user.controller.ts`
6. `apps/gateway/src/permission/user.service.ts`
7. `apps/gateway/src/object/object.controller.ts`
8. `apps/gateway/src/object/object.service.ts`
9. `apps/gateway/src/process/node-executors/notification.executor.ts`
10. `apps/gateway/src/auth/auth.service.ts`
11. `apps/gateway/src/permission/permission.service.ts`
12. `apps/gateway/src/application/application.controller.ts`
13. `apps/gateway/src/application/changelog.service.ts`
14. `apps/gateway/src/process/process-utils.ts`
15. `apps/gateway/src/process/node-executor.registry.ts`
16. `packages/studio/src/components/page-builder/action-executor.ts`
17. `packages/runtime-ui/src/runtime/action-executor.ts`
18. `packages/runtime-ui/src/runtime/ComponentRenderer.tsx`
19. `packages/studio/features/process/simplified/src/index.ts`
20. `packages/studio/src/api/permissions.ts`
21. `packages/studio/src/api/processes.ts`
22. `packages/studio/src/components/page-builder/ComponentRenderer.tsx`
23. `packages/studio/src/components/process/NodeConfigPanel.tsx`
24. `packages/studio/src/constants/pageComponents.ts`
25. `packages/shared/src/permission/index.ts`
26. `packages/shared/src/common/index.ts`
27. `packages/shared/src/object/index.ts`
28. `packages/shared/src/process/index.ts`
29. `packages/shared/src/application/index.ts`

### 删除文件（1 个）：
1. `packages/studio/features/process/simplified/src/SimplifiedProcessEditor.tsx`

### 可能新建文件（1 个）：
1. `packages/runtime-ui/src/api/processes.ts`（如 runtime-ui 的 trigger_process 需要调用流程 API）

---

## 不在本次修复范围（留作后续技术债）

- permission 模块的 DTO 风格统一（内联匿名类型 → 具名 DTO，L-17~L-19）
- record 模块的裸 JSON body 校验（M-17）
- sub-process sync 等待、parallel AND-join（M-12, M-13）— 需要流程引擎架构变更
- JSONB 字段排序（M-14）— 需要 raw SQL 支持
- studio 与 runtime-ui 的 action-executor.ts 代码重复 — 需要架构重构
- 各 Props/ConfigData 类型的过度导出（L-12）— 纯风格问题