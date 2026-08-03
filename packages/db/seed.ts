/**
 * 数据库种子脚本 — 创建平台超管、租户、角色、用户。
 *
 * 用法：
 *   pnpm --filter @apaas/db exec tsx seed.ts
 *
 * 测试账号：
 *   平台超管:  superadmin@apaas.dev / superadmin123（无需租户标识）
 *   租户管理员: admin@apaas.dev / admin123（租户标识: demo）
 *   搭建者:    builder@apaas.dev / builder123（租户标识: demo）
 *   终端用户:  user@apaas.dev / user123（租户标识: demo）
 */

import { prisma } from './src/index.js';
import * as bcrypt from 'bcrypt';

async function main() {
  console.log('🌱 开始种子数据...');

  // 0. 创建平台超管（跨租户，tenantId=null）
  const superAdminHash = await bcrypt.hash('superadmin123', 10);
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@apaas.dev', isPlatformAdmin: true },
  });
  let superAdmin;
  if (existingSuperAdmin) {
    superAdmin = await prisma.user.update({
      where: { id: existingSuperAdmin.id },
      data: { isPlatformAdmin: true },
    });
  } else {
    superAdmin = await prisma.user.create({
      data: {
        tenantId: null,
        email: 'superadmin@apaas.dev',
        name: '平台超管',
        passwordHash: superAdminHash,
        isPlatformAdmin: true,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`✅ 平台超管: ${superAdmin.email}`);

  // 1. 创建租户
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo 租户',
      slug: 'demo',
      description: '演示租户',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ 租户: ${tenant.name} (${tenant.id})`);

  // 2. 迁移旧 ADMIN 角色 → TENANT_ADMIN（若存在）
  await prisma.role.updateMany({
    where: { tenantId: tenant.id, code: 'ADMIN' },
    data: { code: 'TENANT_ADMIN', name: '租户管理员', description: '管理本租户用户、组织、角色和应用' },
  });

  // 3. 创建/更新内置角色
  const tenantAdminRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'TENANT_ADMIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: '租户管理员',
      code: 'TENANT_ADMIN',
      description: '管理本租户用户、组织、角色和应用',
      isBuiltIn: true,
    },
  });

  const builderRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'BUILDER' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: '应用搭建者',
      code: 'BUILDER',
      description: '可搭建应用、页面、流程',
      isBuiltIn: true,
    },
  });

  const endUserRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'END_USER' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: '终端用户',
      code: 'END_USER',
      description: '使用已发布应用、提交申请、审批',
      isBuiltIn: true,
    },
  });
  console.log(`✅ 角色: ${tenantAdminRole.name}, ${builderRole.name}, ${endUserRole.name}`);

  // 4. 创建用户
  const adminHash = await bcrypt.hash('admin123', 10);
  const builderHash = await bcrypt.hash('builder123', 10);
  const userHash = await bcrypt.hash('user123', 10);

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@apaas.dev' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@apaas.dev',
      name: '管理员',
      passwordHash: adminHash,
      status: 'ACTIVE',
    },
  });

  const builder = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'builder@apaas.dev' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'builder@apaas.dev',
      name: '搭建者',
      passwordHash: builderHash,
      status: 'ACTIVE',
    },
  });

  const endUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'user@apaas.dev' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'user@apaas.dev',
      name: '终端用户',
      passwordHash: userHash,
      status: 'ACTIVE',
    },
  });

  // 5. 分配角色
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: tenantAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: tenantAdminRole.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: builder.id, roleId: builderRole.id } },
    update: {},
    create: { userId: builder.id, roleId: builderRole.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: endUser.id, roleId: endUserRole.id } },
    update: {},
    create: { userId: endUser.id, roleId: endUserRole.id },
  });

  console.log(`✅ 用户: ${admin.email} (TENANT_ADMIN), ${builder.email} (BUILDER), ${endUser.email} (END_USER)`);

  // 6. 为 BUILDER 角色创建权限规则（允许搭建操作）
  const builderRules = [
    { type: 'PAGE', action: 'MANAGE', targetId: '*' },
    { type: 'PAGE', action: 'CREATE', targetId: '*' },
    { type: 'PAGE', action: 'EDIT', targetId: '*' },
    { type: 'PAGE', action: 'DELETE', targetId: '*' },
    { type: 'PAGE', action: 'VIEW', targetId: '*' },
    { type: 'DATA_MODEL', action: 'CREATE', targetId: '*' },
    { type: 'DATA_MODEL', action: 'EDIT', targetId: '*' },
    { type: 'DATA_MODEL', action: 'DELETE', targetId: '*' },
    { type: 'DATA_MODEL', action: 'VIEW', targetId: '*' },
    { type: 'PROCESS', action: 'CREATE', targetId: '*' },
    { type: 'PROCESS', action: 'EDIT', targetId: '*' },
    { type: 'PROCESS', action: 'DELETE', targetId: '*' },
    { type: 'PROCESS', action: 'EXECUTE', targetId: '*' },
    { type: 'PROCESS', action: 'VIEW', targetId: '*' },
    { type: 'RECORD', action: 'CREATE', targetId: '*' },
    { type: 'RECORD', action: 'EDIT', targetId: '*' },
    { type: 'RECORD', action: 'DELETE', targetId: '*' },
    { type: 'RECORD', action: 'VIEW', targetId: '*' },
  ];
  await prisma.permissionRule.createMany({
    data: builderRules.map((rule) => ({
      tenantId: tenant.id,
      roleId: builderRole.id,
      type: rule.type,
      action: rule.action,
      targetId: rule.targetId,
      effect: 'ALLOW',
    })),
    skipDuplicates: true,
  });
  console.log(`✅ BUILDER 权限规则: ${builderRules.length} 条`);

  // 7. 为 END_USER 角色创建权限规则（查看页面 + 提交记录 + 查看记录 + 执行流程 + 审批）
  const endUserRules = [
    { type: 'PAGE', action: 'VIEW', targetId: '*' },
    { type: 'RECORD', action: 'CREATE', targetId: '*' },
    { type: 'RECORD', action: 'VIEW', targetId: '*' },
    { type: 'PROCESS', action: 'EXECUTE', targetId: '*' },
    { type: 'PROCESS', action: 'APPROVE', targetId: '*' },
  ];
  await prisma.permissionRule.createMany({
    data: endUserRules.map((rule) => ({
      tenantId: tenant.id,
      roleId: endUserRole.id,
      type: rule.type,
      action: rule.action,
      targetId: rule.targetId,
      effect: 'ALLOW',
    })),
    skipDuplicates: true,
  });
  console.log(`✅ END_USER 权限规则: ${endUserRules.length} 条`);

  // 8. 创建示例应用
  const app = await prisma.application.upsert({
    where: { tenantId_apiName: { tenantId: tenant.id, apiName: 'asset_management' } },
    update: {},
    create: {
      tenantId: tenant.id,
      apiName: 'asset_management',
      name: '资产管理',
      description: '企业资产登记、领用、归还与盘点',
      icon: '📋',
      color: '#1677ff',
      status: 'DRAFT',
      version: 0,
      createdBy: admin.id,
    },
  });
  console.log(`✅ 应用: ${app.name} (${app.id})`);

  console.log('');
  console.log('📋 测试账号:');
  console.log('  平台超管:  superadmin@apaas.dev / superadmin123（无需租户标识）');
  console.log('  租户管理员: admin@apaas.dev / admin123（租户标识: demo）');
  console.log('  搭建者:    builder@apaas.dev / builder123（租户标识: demo）');
  console.log('  终端用户:  user@apaas.dev / user123（租户标识: demo）');
  console.log('');
  console.log('📦 示例应用: 资产管理 (asset_management)');
  console.log('');
  console.log('🌱 种子数据完成!');
}

main()
  .catch((e) => {
    console.error('❌ 种子失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
