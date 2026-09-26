/**
 * 回归守卫 — queryKey 治理（评审 P2-1）。
 *
 * 该测试是"静态一致性"守卫，覆盖三类回归：
 *  1. **别名 key 复活**：objects/pages 必须使用规范键（['objects', appId] /
 *     ['pages', appId]），不得再出现 'app-objects' / 'app-pages' 别名——别名会导致
 *     同一数据双缓存，且对规范键的失效无法刷新别名订阅者。
 *  2. **规范 key 无人使用（死代码再生）**：qk 的每个构造器必须至少被引用一次；
 *     历史教训是 queryKeys 注册表零引用却长期存在，且其声明的键形状与实际用法不一致。
 *  3. **失效覆盖**：发布/回滚影响的键（app/appObjects/appPages/appVersions/
 *     publishChanges）必须至少存在一处 invalidateQueries 调用点。
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 仓库根（vitest 工作目录为 packages/studio） */
const REPO_ROOT = resolve(process.cwd(), '../..');
const SCAN_DIRS = [
  join(REPO_ROOT, 'packages/studio/src'),
  join(REPO_ROOT, 'packages/runtime-ui/src'),
  join(REPO_ROOT, 'packages/shared/src'),
];

/** 需要排除的目录 */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo']);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const ALL_FILES = SCAN_DIRS.flatMap((d) => collectSourceFiles(d)).map((f) => ({
  path: f,
  rel: f.replace(`${REPO_ROOT}/`, ''),
  content: readFileSync(f, 'utf8'),
}));

/**
 * 排除守卫自身与规范 key 模块本身：
 *  - 守卫内含有待检测的字面量；
 *  - query-keys.ts 的文档注释需要引用被废弃的别名以说明迁移原因。
 */
const PRODUCTION_FILES = ALL_FILES.filter(
  (f) =>
    !f.rel.endsWith('query-keys.spec.ts') && !f.rel.endsWith('shared/src/stores/query-keys.ts'),
);

describe('queryKey 治理（P2-1）', () => {
  it('不得再使用 app-objects / app-pages 别名 key', () => {
    const offenders = PRODUCTION_FILES.filter(
      (f) => f.content.includes("'app-objects'") || f.content.includes("'app-pages'"),
    ).map((f) => f.rel);

    expect(
      offenders,
      `以下文件仍使用别名 key，请改用 qk.appObjects/qk.appPages：${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('objects / pages 的规范键形状唯一：读取点与失效点一致', () => {
    // 规范键：['objects', appId] 与 ['pages', appId]（由 qk 提供）
    const objectsUsingBuilder = PRODUCTION_FILES.filter((f) =>
      f.content.includes('qk.appObjects('),
    ).length;
    const pagesUsingBuilder = PRODUCTION_FILES.filter((f) =>
      f.content.includes('qk.appPages('),
    ).length;

    expect(objectsUsingBuilder).toBeGreaterThanOrEqual(3);
    expect(pagesUsingBuilder).toBeGreaterThanOrEqual(3);
  });

  it('qk 构造器不得成为死代码：每个构造器至少被使用一次', () => {
    const keys = [
      'apps',
      'app',
      'appObjects',
      'appPages',
      'appVersions',
      'publishChanges',
      'object',
      'objectRecords',
      'objectViews',
      'page',
    ];

    const unused = keys.filter((key) => {
      const usage = `qk.${key}(`;
      return !PRODUCTION_FILES.some((f) => f.content.includes(usage));
    });

    expect(unused, `以下 qk 构造器无人使用（死代码）：${unused.join(', ')}`).toEqual([]);
  });

  it('原 queryKeys 注册表已移除（0 引用的死代码）', () => {
    const offenders = PRODUCTION_FILES.filter((f) => /\bqueryKeys\./.test(f.content)).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });

  it('发布/回滚成功后失效受影响键（publishAffectedKeys 覆盖 5 个键且被调用）', () => {
    const queryKeysFile = ALL_FILES.find((f) => f.rel.endsWith('shared/src/stores/query-keys.ts'));
    expect(queryKeysFile, 'query-keys.ts 应存在').toBeTruthy();
    const content = queryKeysFile!.content;

    for (const builder of [
      'qk.app(appId)',
      'qk.appObjects(appId)',
      'qk.appPages(appId)',
      'qk.appVersions(appId)',
      'qk.publishChanges(appId)',
    ]) {
      expect(content, `publishAffectedKeys 应包含 ${builder}`).toContain(builder);
    }

    // 发布向导与版本历史必须调用该集合完成失效
    const callers = PRODUCTION_FILES.filter((f) => f.content.includes('publishAffectedKeys('));
    const callerRels = callers.map((f) => f.rel);
    expect(callerRels.some((r) => r.includes('PublishWizard'))).toBe(true);
    expect(callerRels.some((r) => r.includes('VersionHistory'))).toBe(true);
  });
});
