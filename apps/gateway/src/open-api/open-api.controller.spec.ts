/**
 * OpenApiController 单测——服务身份应用作用域（对抗审查 security-03 回归，2026-10-23）。
 *
 * 缺陷：服务身份按应用签发/门控（POST /design/apps/:appId/service-identities），
 * 但 verify() 返回体丢弃 appId，数据面（listProcesses/start）只消费 tenantId——
 * 应用 A 的 key 可发现并触发同租户任意其他应用的流程 API（裁判实测 201 真实落任务）。
 * 修复：verify 回传 appId + 控制器 assertAppScope 比对（绑定不匹配 403，租户级身份不限）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { OpenApiController } from './open-api.controller.js';
import type { ServiceIdentityUser } from '../service-identity/api-key.service.js';

function makeIdentity(appId: string | null): ServiceIdentityUser {
  return {
    id: 'si-1',
    tenantId: 't1',
    isSuperAdmin: false,
    serviceIdentityId: 'si-1',
    appId,
  };
}

function makeReq(appId: string | null) {
  return { user: makeIdentity(appId) } as Parameters<OpenApiController['listProcesses']>[0];
}

function makeController() {
  const releaseService = { listByApp: vi.fn().mockResolvedValue([]), resolve: vi.fn() };
  const observabilityService = { record: vi.fn().mockResolvedValue(undefined) };
  const engine = { startProcess: vi.fn() };
  const controller = new OpenApiController(
    releaseService as never,
    observabilityService as never,
    engine as never,
  );
  return { controller, releaseService };
}

describe('OpenApiController — 服务身份应用作用域（security-03 回归）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应用绑定 key 访问其他应用 → 403，不触达数据面', async () => {
    const { controller, releaseService } = makeController();
    await expect(controller.listProcesses(makeReq('app-A'), 'app-B')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(releaseService.listByApp).not.toHaveBeenCalled();
  });

  it('应用绑定 key 访问绑定应用 → 放行', async () => {
    const { controller, releaseService } = makeController();
    const r = await controller.listProcesses(makeReq('app-A'), 'app-A');
    expect(r.ok).toBe(true);
    expect(releaseService.listByApp).toHaveBeenCalledOnce();
  });

  it('租户级身份（appId=null）访问任意应用 → 放行', async () => {
    const { controller, releaseService } = makeController();
    const r = await controller.listProcesses(makeReq(null), 'app-B');
    expect(r.ok).toBe(true);
    expect(releaseService.listByApp).toHaveBeenCalledOnce();
  });

  it('start 同样受作用域约束：绑定不匹配 → 403', async () => {
    const { controller, releaseService } = makeController();
    await expect(
      controller.startLatest(makeReq('app-A'), 'app-B', 'flow1', { inputs: {} }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(releaseService.resolve).not.toHaveBeenCalled();
  });
});
