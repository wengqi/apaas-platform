/**
 * 方言指南 ↔ G3 校验器一致性测试（ADR-0004 决策 7 的牙齿）。
 *
 * 双向锚定：
 * 1. 正向——每个校验器实际产出的拦截规则码（源码静态提取）必须在其方言指南
 *    中有说明（校验器学会新拒绝 → 指南不更新即红）；
 * 2. 反向——指南中引用的规则码必须真实存在于对应校验器（指南先于实现写码
 *    或校验器删码 → 红）。
 * 另锁定：指南注册表的 kind 与校验器文件一一对应（新方言两侧同步落地）。
 *
 * 规则码提取方式为源码静态扫描（SCHEMA_ISSUE_CODES.X 字面量），与仓库既有
 * 静态守卫测试同模式；码值域以 shared SCHEMA_ISSUE_CODES 为 SSOT。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { DIALECT_GUIDES } from './mcp-server.factory.js';
import { SCHEMA_ISSUE_CODES } from '@apaas/shared';

const HERE = dirname(fileURLToPath(import.meta.url));

/** kind → 校验器源文件（相对本 spec）。新增方言时两侧同步登记。 */
const VALIDATOR_FILES: Record<string, string> = {
  amis_page: '../schema-contract/validators/amis-page.validator.ts',
  workflow: '../schema-contract/validators/workflow.validator.ts',
  object_meta: '../schema-contract/validators/object-meta.validator.ts',
  dataset: '../schema-contract/validators/dataset.validator.ts',
  permission: '../schema-contract/validators/permission.validator.ts',
};

/** 静态提取校验器源码中产出的全部拦截规则码。 */
function emittedCodes(kind: string): string[] {
  const src = readFileSync(join(HERE, VALIDATOR_FILES[kind]!), 'utf8');
  return [...new Set([...src.matchAll(/SCHEMA_ISSUE_CODES\.([A-Z_]+)/g)].map((m) => m[1]!))].sort();
}

/** 提取指南文本中引用的、属于 shared 码值域的规则码。 */
function mentionedCodes(guideText: string): string[] {
  const known = Object.values(SCHEMA_ISSUE_CODES) as string[];
  return [
    ...new Set(
      [...guideText.matchAll(/\b[A-Z][A-Z_]{3,}\b/g)]
        .map((m) => m[0]!)
        .filter((token) => known.includes(token)),
    ),
  ].sort();
}

describe('方言指南 ↔ G3 校验器一致性（ADR-0004 决策 7）', () => {
  it('指南注册表 kind 与校验器文件一一对应（五方言两侧同步落地）', () => {
    expect(Object.keys(DIALECT_GUIDES).sort()).toEqual(Object.keys(VALIDATOR_FILES).sort());
  });

  it('正向：校验器每条拦截规则码都在对应指南中有说明', () => {
    for (const [kind, file] of Object.entries(VALIDATOR_FILES)) {
      const emitted = emittedCodes(kind);
      expect(emitted.length).toBeGreaterThan(0); // 校验器必须真的会产码
      const mentioned = mentionedCodes(DIALECT_GUIDES[kind]!);
      const missing = emitted.filter((code) => !mentioned.includes(code));
      expect(
        missing,
        `${kind} 指南缺少规则码说明（校验器 ${file}）：${missing.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('反向：指南引用的规则码必须真实存在于对应校验器（防陈旧文档）', () => {
    for (const [kind] of Object.entries(VALIDATOR_FILES)) {
      const emitted = new Set(emittedCodes(kind));
      const mentioned = mentionedCodes(DIALECT_GUIDES[kind]!);
      const stale = mentioned.filter((code) => !emitted.has(code));
      expect(stale, `${kind} 指南引用了校验器不产出的规则码：${stale.join(', ')}`).toEqual([]);
    }
  });
});
