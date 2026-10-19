/**
 * 应用归属与协作成员（ADR-0005）——设计面成员闸 / 可见集 / 所有者级操作 / 运行面不受影响。
 *
 * 前置：seed 已把 builder 加为 procurement 的 MEMBER（协作态常驻夹具）；
 * admin（TENANT_ADMIN）恒全量；user@apaas.dev 为 END_USER-only（studio 纵深闸对照）。
 */
import { test, expect } from '@playwright/test';
import { loginViaApi, createApiClient, createTestApp, deleteTestApp } from './fixtures.js';

type Api = ReturnType<typeof createApiClient>;

let admin: Api;
let builder: Api;
let userOnly: Api;

/** 经 admin 的用户列表按邮箱取用户 ID（builder 无用户列表读权）。 */
async function userIdByEmail(email: string): Promise<string> {
  const users = await admin.get<Array<{ id: string; email: string }>>('/permissions/users');
  const u = users.find((x) => x.email === email);
  expect(u, `用户 ${email} 不存在——请先跑 pnpm db:seed`).toBeTruthy();
  return u!.id;
}

test.beforeAll(async () => {
  admin = createApiClient(await loginViaApi());
  builder = createApiClient(await loginViaApi('builder@apaas.dev', 'builder123'));
  userOnly = createApiClient(await loginViaApi('user@apaas.dev', 'user123'));
});

test.describe('应用归属与协作成员（ADR-0005）', () => {
  test.describe.configure({ mode: 'serial' });

  let adminAppId = '';

  test.afterAll(async () => {
    if (adminAppId) await deleteTestApp(admin, adminAppId);
  });

  test('非成员 builder：设计面列表不含 admin 的应用，深链 403', async () => {
    adminAppId = await createTestApp(admin, '归属闸夹具 ADR0005');

    const list = await builder.get<Array<{ id: string }>>('/design/apps');
    expect(
      list.some((a) => a.id === adminAppId),
      'builder 不应看到 admin 新建应用',
    ).toBe(false);

    const denied = await builder.raw('get', `/design/apps/${adminAppId}`);
    expect(denied.status).toBe(403);
    expect(denied.json.error?.message).toContain('无权访问该应用');
  });

  test('协作者 builder：procurement 出现在列表（myRole=member + ownerName），设计面可读', async () => {
    const list =
      await builder.get<
        Array<{ id: string; apiName: string; myRole?: string; ownerName?: string }>
      >('/design/apps');
    const proc = list.find((a) => a.apiName === 'procurement');
    expect(proc, 'seed 协作夹具：builder 应看到 procurement').toBeTruthy();
    expect(proc!.myRole).toBe('member');
    expect(proc!.ownerName, '协作卡片数据源：OWNER 姓名').toBeTruthy();

    const detail = await builder.get<{ id: string; myRole?: string }>(`/design/apps/${proc!.id}`);
    expect(detail.id).toBe(proc!.id);
    expect(detail.myRole).toBe('member');
  });

  test('协作者不可执行所有者级操作：MEMBER 删除应用 403', async () => {
    const list = await builder.get<Array<{ id: string; apiName: string }>>('/design/apps');
    const proc = list.find((a) => a.apiName === 'procurement')!;
    const denied = await builder.raw('delete', `/design/apps/${proc.id}`);
    expect(denied.status).toBe(403);
    expect(denied.json.error?.message).toContain('所有者');
  });

  test('owner 转移所有权：原 owner 降 MEMBER、新 owner 提升，admin 亦可操作', async () => {
    const builderId = await userIdByEmail('builder@apaas.dev');
    // admin 建的新应用 admin 是 OWNER；加 builder 为协作者 → 转移 → builder 变 OWNER
    const added = await admin.post<{ userId: string; role: string }>(
      `/design/apps/${adminAppId}/members`,
      { userId: builderId },
    );
    expect(added.role).toBe('member');

    const transfer = await admin.post<{ ownerUserId: string }>(
      `/design/apps/${adminAppId}/members/owner`,
      { userId: builderId },
    );
    expect(transfer.ownerUserId).toBe(builderId);

    const members = await builder.get<{
      items: Array<{ userId: string; role: string; name: string | null; email: string }>;
    }>(`/design/apps/${adminAppId}/members`);
    const rows = members.items;
    const builderRow = rows.find((m) => m.role === 'owner');
    expect(builderRow, 'builder 应成为新所有者').toBeTruthy();
    expect(rows.filter((m) => m.role === 'owner')).toHaveLength(1);
    // 原 OWNER（admin）自动降为 MEMBER，不丢访问
    const adminRow = rows.find((m) => m.role === 'member');
    expect(adminRow, '原所有者降为协作者').toBeTruthy();

    // 转回：新所有者 builder 把所有权转回 admin，恢复夹具
    const adminId = await userIdByEmail('admin@apaas.dev');
    const back = await builder.post<{ ownerUserId: string }>(
      `/design/apps/${adminAppId}/members/owner`,
      { userId: adminId },
    );
    expect(back.ownerUserId).toBe(adminId);
  });

  test('候选集：procurement 的候选不含已入会的 builder，且为 BUILDER 用户', async () => {
    const list = await admin.get<Array<{ id: string; apiName: string }>>('/design/apps');
    const proc = list.find((a) => a.apiName === 'procurement')!;
    const candidates = await admin.get<{ items: Array<{ userId: string; email: string }> }>(
      `/design/apps/${proc.id}/members/candidates`,
    );
    expect(
      candidates.items.some((c) => c.email === 'builder@apaas.dev'),
      'builder 已是 procurement 成员，不应出现在候选',
    ).toBe(false);
  });

  test('END_USER-only 用户深链设计面 403（hasStudioAccess 纵深，即使被错加成员）', async () => {
    const denied = await userOnly.raw('get', `/design/apps/${adminAppId}`);
    expect(denied.status).toBe(403);
  });

  test('运行面不受归属影响：builder 以业务身份可见已发布应用与详情', async () => {
    const runtimeApps =
      await builder.get<Array<{ id: string; apiName: string; status: string }>>('/apps');
    const proc = runtimeApps.find((a) => a.apiName === 'procurement');
    expect(proc, '已发布 procurement 对 builder（业务用户）可见').toBeTruthy();
    expect(proc!.status).toBe('PUBLISHED');

    const detail = await builder.get<{ id: string }>(`/apps/${proc!.id}`);
    expect(detail.id).toBe(proc!.id);
  });
});
