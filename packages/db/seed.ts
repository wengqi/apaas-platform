/**
 * 数据库种子脚本 — 创建测试租户、角色、用户。
 *
 * 用法：
 *   pnpm --filter @apaas/db exec tsx seed.ts
 *
 * 测试账号：
 *   admin@apaas.dev / admin123  (管理员)
 *   builder@apaas.dev / builder123 (搭建者)
 */

import { prisma } from './src/index.js';
import * as bcrypt from 'bcrypt';

async function main() {
  console.log('🌱 开始种子数据...');

  // 1. 创建租户
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo 租户',
      slug: 'demo',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ 租户: ${tenant.name} (${tenant.id})`);

  // 2. 创建角色
  const adminRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ADMIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: '系统管理员',
      code: 'ADMIN',
      description: '拥有全部权限',
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
  console.log(`✅ 角色: ${adminRole.name}, ${builderRole.name}`);

  // 3. 创建用户
  const adminHash = await bcrypt.hash('admin123', 10);
  const builderHash = await bcrypt.hash('builder123', 10);

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

  // 4. 分配角色
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: builder.id, roleId: builderRole.id } },
    update: {},
    create: { userId: builder.id, roleId: builderRole.id },
  });

  console.log(`✅ 用户: ${admin.email} (ADMIN), ${builder.email} (BUILDER)`);

  // 4.5 为 BUILDER 角色创建权限规则（允许搭建操作）
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

  // 5. 创建示例应用
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
  console.log('  管理员:   admin@apaas.dev / admin123');
  console.log('  搭建者:   builder@apaas.dev / builder123');
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
