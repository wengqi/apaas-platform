/**
 * 人力主数据 HTTP 目录源单测 — dataPath 解析、字段映射、分页协议、唯一键校验。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { HrApiDirectorySource, resolvePath } from './sources/hr-api.directory-source.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolvePath', () => {
  it('点号路径取嵌套值；缺失返回 undefined', () => {
    const obj = { data: { list: [1, 2] } };
    expect(resolvePath(obj, 'data.list')).toEqual([1, 2]);
    expect(resolvePath(obj, 'data.missing')).toBeUndefined();
    expect(resolvePath(obj)).toBe(obj);
  });
});

describe('HrApiDirectorySource', () => {
  const baseConfig = {
    url: 'https://hr.example.com/api/users',
    paging: 'none' as const,
    fieldMap: { externalId: 'empNo', name: 'name', email: 'mail', departmentExternalId: 'dept' },
  };

  it('paging=none：dataPath 取数组并按 fieldMap 映射', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { list: [{ empNo: 'E1', name: '张三', mail: 'z@x.com', dept: 'D1' }] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const source = new HrApiDirectorySource({ ...baseConfig, dataPath: 'data.list' });
    const users = await source.pullUsers();
    expect(users).toEqual([
      {
        externalId: 'E1',
        name: '张三',
        email: 'z@x.com',
        mobile: undefined,
        departmentExternalId: 'D1',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('paging=page：满页翻页，短页停止', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { empNo: 'E1', name: 'a' },
          { empNo: 'E2', name: 'b' },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ empNo: 'E3', name: 'c' }] });
    vi.stubGlobal('fetch', fetchMock);
    const source = new HrApiDirectorySource({
      ...baseConfig,
      paging: 'page',
      pageSize: 2,
    });
    const users = await source.pullUsers();
    expect(users.map((u) => u.externalId)).toEqual(['E1', 'E2', 'E3']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallUrl = String(fetchMock.mock.calls[1]![0] as URL);
    expect(secondCallUrl).toContain('page=2');
    expect(secondCallUrl).toContain('pageSize=2');
  });

  it('唯一键缺失：抛错（整体失败，由同步管道记日志）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ name: 'no-key' }] }),
    );
    const source = new HrApiDirectorySource(baseConfig);
    await expect(source.pullUsers()).rejects.toThrow('empNo');
  });
});
