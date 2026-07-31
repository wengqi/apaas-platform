import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';

/**
 * 组织架构服务 — 树形组织节点 CRUD、成员管理、组织角色授权。
 */
@Injectable()
export class OrgService {
  /** 获取完整组织树（递归 children）。 */
  async getTree(tenantId: string) {
    const nodes = await prisma.orgNode.findMany({
      where: { tenantId },
      orderBy: { sort: 'asc' },
    });

    // 构建树
    const nodeMap = new Map<string, typeof nodes>();
    const roots: typeof nodes = [];
    for (const node of nodes) {
      const children = nodeMap.get(node.id) ?? [];
      (node as Record<string, unknown>).children = children;
      nodeMap.set(node.id, children);
    }
    for (const node of nodes) {
      if (node.parentId) {
        const parentChildren = nodeMap.get(node.parentId);
        if (parentChildren && !parentChildren.includes(node)) {
          parentChildren.push(node);
        }
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /** 获取节点详情（含成员）。 */
  async getNode(tenantId: string, id: string) {
    const node = await prisma.orgNode.findFirst({
      where: { id, tenantId },
      include: {
        memberships: { include: { user: true } },
        orgRoleGrants: { include: { role: true } },
      },
    });
    if (!node) throw new NotFoundException('组织节点不存在');
    return node;
  }

  /** 创建节点。 */
  async create(tenantId: string, data: {
    parentId?: string; name: string; code: string; nodeType?: string; sort?: number;
  }) {
    const exists = await prisma.orgNode.findFirst({ where: { tenantId, code: data.code } });
    if (exists) throw new BadRequestException('组织编码已存在');

    return prisma.orgNode.create({
      data: {
        tenantId,
        parentId: data.parentId ?? null,
        name: data.name,
        code: data.code,
        nodeType: data.nodeType ?? 'DEPARTMENT',
        sort: data.sort ?? 0,
      },
    });
  }

  /** 更新节点。 */
  async update(tenantId: string, id: string, data: { name?: string; sort?: number; parentId?: string }) {
    const node = await prisma.orgNode.findFirst({ where: { id, tenantId } });
    if (!node) throw new NotFoundException('组织节点不存在');
    if (data.parentId === id) throw new BadRequestException('不能将节点设为自身的子节点');
    return prisma.orgNode.update({ where: { id }, data });
  }

  /** 删除节点（子节点 SetNull）。 */
  async delete(tenantId: string, id: string) {
    const node = await prisma.orgNode.findFirst({ where: { id, tenantId } });
    if (!node) throw new NotFoundException('组织节点不存在');
    await prisma.orgNode.delete({ where: { id } });
  }

  /** 移动节点到新父节点。 */
  async moveNode(tenantId: string, id: string, parentId: string) {
    const node = await prisma.orgNode.findFirst({ where: { id, tenantId } });
    if (!node) throw new NotFoundException('组织节点不存在');
    if (id === parentId) throw new BadRequestException('不能将节点设为自身的子节点');
    return prisma.orgNode.update({ where: { id }, data: { parentId } });
  }

  /** 获取节点成员。 */
  async getMembers(tenantId: string, orgId: string) {
    const memberships = await prisma.orgMember.findMany({
      where: { orgId },
      include: { user: true },
    });
    return memberships.map((m) => m.user);
  }

  /** 添加成员。 */
  async addMember(orgId: string, userId: string) {
    await prisma.orgMember.create({ data: { orgId, userId } }).catch(() => {});
  }

  /** 移除成员。 */
  async removeMember(orgId: string, userId: string) {
    await prisma.orgMember.delete({
      where: { userId_orgId: { userId, orgId } },
    }).catch(() => {});
  }

  /** 组织角色授权。 */
  async grantRole(tenantId: string, orgId: string, roleId: string, appId?: string) {
    return prisma.orgRoleGrant.create({
      data: { tenantId, orgId, roleId, appId: appId ?? null },
    }).catch(() => {});
  }

  /** 撤销组织角色授权。 */
  async revokeRole(orgId: string, roleId: string) {
    await prisma.orgRoleGrant.deleteMany({
      where: { orgId, roleId },
    });
  }
}
