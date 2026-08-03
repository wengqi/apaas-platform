import { Module } from '@nestjs/common';
import { RoleController } from './role.controller.js';
import { OrgController } from './org.controller.js';
import { UserController } from './user.controller.js';
import { RoleService } from './role.service.js';
import { OrgService } from './org.service.js';
import { UserService } from './user.service.js';
import { PermissionService } from './permission.service.js';
import { PermissionGuard } from './permission.guard.js';
import { AuditLogService } from './audit-log.service.js';

/**
 * 权限模块 — 角色管理、组织架构、用户管理、权限引擎、审计日志。
 *
 * 导出 PermissionService 和 PermissionGuard 供其他模块使用。
 */
@Module({
  controllers: [RoleController, OrgController, UserController],
  providers: [RoleService, OrgService, UserService, PermissionService, PermissionGuard, AuditLogService],
  exports: [PermissionService, PermissionGuard, AuditLogService],
})
export class PermissionModule {}
