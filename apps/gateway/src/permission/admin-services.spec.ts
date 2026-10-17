/**
 * 权限管理服务与应用发布服务单元测试 — org / role / user / check / mail。
 *
 * 覆盖：组织树 CRUD 与成员/角色授权、角色 CRUD 与用户分配、
 * 用户创建校验（邮箱冲突/角色组织归属）、发布预检（页面绑定对象校验）、邮件服务。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoleService } from './role.service.js';
import { UserService } from './user.service.js';
import { OrgService } from './org.service.js';
import { CheckService } from '../application/check.service.js';
import { SchemaContractService } from '../schema-contract/schema-contract.service.js';
import { MailService } from '../notification/mail.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

// ---------------------------------------------------------------------------
// RoleService
// ---------------------------------------------------------------------------

describe('RoleService', () => {
  const prisma = getMockPrisma();
  const service = new RoleService();

  it('create：角色编码重复抛错', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'r-1' });
    await expect(service.create('t-1', { name: 'X', code: 'DUP' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('create：编码唯一时创建成功', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    prisma.role.create.mockResolvedValue({ id: 'r-2', code: 'NEW' });
    const role = await service.create('t-1', { name: 'X', code: 'NEW' });
    expect(role.code).toBe('NEW');
  });

  it('delete：内置角色不可删除', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'r-1', isBuiltIn: true });
    await expect(service.delete('t-1', 'r-1')).rejects.toThrow('内置角色不可删除');
  });

  it('delete：非内置角色删除成功', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'r-2', isBuiltIn: false });
    prisma.role.delete.mockResolvedValue({ id: 'r-2' });
    await expect(service.delete('t-1', 'r-2')).resolves.toBeUndefined();
  });

  it('assignUsers：包含无效用户时抛错', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'r-1' });
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1' }]);
    await expect(service.assignUsers('t-1', 'r-1', ['u-1', 'ghost'])).rejects.toThrow(
      '部分用户不存在',
    );
  });

  it('get：角色不存在抛 NotFound', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    await expect(service.get('t-1', 'ghost')).rejects.toThrow(NotFoundException);
  });

  it('setPermissionRules：先删旧规则再批量创建', async () => {
    await service.setPermissionRules('t-1', 'r-1', [
      { type: 'RECORD', action: 'VIEW', targetId: 'obj-1' },
    ]);
    expect(prisma.permissionRule.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't-1', roleId: 'r-1' },
    });
    expect(prisma.permissionRule.createMany).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// UserService
// ---------------------------------------------------------------------------

describe('UserService', () => {
  const prisma = getMockPrisma();
  const service = new UserService();

  it('create：邮箱重复抛错', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    await expect(
      service.create('t-1', { email: 'a@x.dev', name: 'A', password: 'pwd123' }),
    ).rejects.toThrow('邮箱已存在');
  });

  it('create：角色归属校验失败抛错', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.role.findMany.mockResolvedValue([]);
    await expect(
      service.create('t-1', {
        email: 'a@x.dev',
        name: 'A',
        password: 'pwd123',
        roleIds: ['ghost-role'],
      }),
    ).rejects.toThrow('部分角色不存在');
  });

  it('create：合法输入创建用户并分配角色/组织', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.role.findMany.mockResolvedValue([{ id: 'r-1' }]);
    prisma.orgNode.findMany.mockResolvedValue([{ id: 'org-1' }]);
    prisma.user.create.mockResolvedValue({ id: 'u-9' });

    const user = await service.create('t-1', {
      email: 'new@x.dev',
      name: 'N',
      password: 'pwd123',
      roleIds: ['r-1'],
      orgIds: ['org-1'],
    });

    expect(user.id).toBe('u-9');
    expect(prisma.userRole.createMany).toHaveBeenCalledOnce();
    expect(prisma.orgMember.createMany).toHaveBeenCalledOnce();
  });

  it('get：用户不存在抛 NotFound', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.get('t-1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// OrgService
// ---------------------------------------------------------------------------

describe('OrgService', () => {
  const prisma = getMockPrisma();
  const service = new OrgService();

  it('update：不能把节点设为自己的子节点', async () => {
    prisma.orgNode.findFirst.mockResolvedValue({ id: 'o-1' });
    await expect(service.update('t-1', 'o-1', { parentId: 'o-1' })).rejects.toThrow(
      '不能将节点设为自身',
    );
  });

  it('moveNode：目标父节点必须存在且属于本租户', async () => {
    prisma.orgNode.findFirst
      .mockResolvedValueOnce({ id: 'o-1' }) // 节点本身
      .mockResolvedValueOnce(null); // 目标父节点
    await expect(service.moveNode('t-1', 'o-1', 'ghost-parent')).rejects.toThrow(
      '目标父节点不存在',
    );
  });

  it('moveNode：合法移动更新 parentId', async () => {
    prisma.orgNode.findFirst
      .mockResolvedValueOnce({ id: 'o-1' })
      .mockResolvedValueOnce({ id: 'p-1' });
    prisma.orgNode.update.mockResolvedValue({ id: 'o-1', parentId: 'p-1' });
    const node = await service.moveNode('t-1', 'o-1', 'p-1');
    expect(node.parentId).toBe('p-1');
  });

  it('addMember：org/user 都必须存在且属于本租户', async () => {
    prisma.orgNode.findFirst.mockResolvedValue({ id: 'org-1' });
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.addMember('t-1', 'org-1', 'ghost-user')).rejects.toThrow('用户不存在');
  });

  it('grantRole：授权成功', async () => {
    prisma.orgNode.findFirst.mockResolvedValue({ id: 'org-1' });
    prisma.role.findFirst.mockResolvedValue({ id: 'r-1' });
    prisma.orgRoleGrant.create.mockResolvedValue({ id: 'gr-1', orgId: 'org-1', roleId: 'r-1' });
    const grant = await service.grantRole('t-1', 'org-1', 'r-1');
    expect(grant.roleId).toBe('r-1');
  });

  it('revokeRole：按租户+org+role 删除', async () => {
    await service.revokeRole('t-1', 'org-1', 'r-1');
    expect(prisma.orgRoleGrant.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't-1', orgId: 'org-1', roleId: 'r-1' },
    });
  });
});

// ---------------------------------------------------------------------------
// CheckService — 发布预检
// ---------------------------------------------------------------------------

describe('CheckService', () => {
  const prisma = getMockPrisma();
  let snapshotService: { collectSnapshot: ReturnType<typeof vi.fn> };
  let service: CheckService;

  beforeEach(() => {
    snapshotService = {
      collectSnapshot: vi.fn().mockResolvedValue({ objects: [], pages: [], processes: [] }),
    };
    prisma.appCheck.create.mockResolvedValue({ id: 'chk-1' });
    service = new CheckService(snapshotService as never, new SchemaContractService());
  });

  it('快照无问题：PASS', async () => {
    const result = await service.check('t-1', 'app-1', 'user-1');
    expect(result.status).toBe('PASS');
    expect(prisma.appCheck.create).toHaveBeenCalledOnce();
  });

  it('页面绑定的对象不存在：ERROR → FAIL', async () => {
    snapshotService.collectSnapshot.mockResolvedValue({
      objects: [{ id: 'obj-1', name: '资产' }],
      pages: [{ id: 'p-1', name: '表单页', objectId: 'obj-missing' }],
      processes: [],
    });
    const result = await service.check('t-1', 'app-1', 'user-1');
    expect(result.status).toBe('FAIL');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: 'ERROR', module: 'PAGE' }),
    );
  });

  it('配置完整的流程不产生问题：PASS', async () => {
    snapshotService.collectSnapshot.mockResolvedValue({
      objects: [{ id: 'obj-1', apiName: 'asset' }],
      pages: [],
      processes: [
        {
          id: 'pr-1',
          name: '流程',
          triggerType: 'RECORD_CREATED',
          workflowSchema: { nodes: [{ id: 'start' }], edges: [] },
        },
      ],
    });
    const result = await service.check('t-1', 'app-1', 'user-1');
    expect(result.status).toBe('PASS');
    expect(result.issues).toHaveLength(0);
  });

  it('页面渲染契约缺陷出 WARNING 不拦截（R6：crud 选择列缺 mapping / datetime 缺 valueFormat）', async () => {
    snapshotService.collectSnapshot.mockResolvedValue({
      objects: [
        {
          id: 'obj-1',
          apiName: 'vehicle_request',
          fields: [
            { apiName: 'status', name: '状态', type: 'single_select' },
            { apiName: 'plan_time', name: '计划时间', type: 'date_time' },
          ],
        },
      ],
      pages: [
        {
          id: 'p-1',
          name: '台账',
          objectId: 'obj-1',
          schema: {
            type: 'page',
            body: [
              {
                type: 'crud',
                columns: [{ name: 'status', label: '状态' }],
              },
              {
                type: 'form',
                body: [{ type: 'input-datetime', name: 'plan_time', label: '计划时间' }],
              },
            ],
          },
        },
      ],
      processes: [],
    });
    const result = await service.check('t-1', 'app-1', 'user-1');
    expect(result.status).toBe('PASS'); // warning 不拦截
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((i) => i.level === 'WARNING' && i.module === 'PAGE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MailService
// ---------------------------------------------------------------------------

describe('MailService', () => {
  function makeConfig(values: Record<string, string | undefined>) {
    return { get: vi.fn((key: string) => values[key]) };
  }

  it('SMTP 未配置：isConfigured=false，sendMail 返回 false 不抛异常', async () => {
    const service = new MailService(
      makeConfig({}) as unknown as ConstructorParameters<typeof MailService>[0],
    );
    expect(service.isConfigured).toBe(false);
    await expect(service.sendMail({ to: ['a@b.c'], subject: 'S', html: '<p>x</p>' })).resolves.toBe(
      false,
    );
  });

  it('SMTP 已配置：createTransport + sendMail 被调用', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'm-1' });
    vi.doMock('nodemailer', () => ({
      createTransport: vi.fn().mockReturnValue({ sendMail }),
    }));
    // 动态导入被测服务，确保 doMock 生效后再实例化
    const { MailService: FreshMailService } = await import('../notification/mail.service.js');
    const service = new FreshMailService(
      makeConfig({
        SMTP_HOST: 'smtp.test',
        SMTP_PORT: '587',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
      }) as unknown as ConstructorParameters<typeof FreshMailService>[0],
    );
    expect(service.isConfigured).toBe(true);
    await expect(service.sendMail({ to: ['a@b.c'], subject: 'S', html: 'H' })).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.c', subject: 'S' }));
  });
});
