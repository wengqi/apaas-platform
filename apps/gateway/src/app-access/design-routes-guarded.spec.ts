/**
 * 设计面路由守卫锚定测试（ADR-0005 决策 9/11「路径即分类」）。
 *
 * 不变量：
 * 1. 凡 @Controller 前缀以 design/apps 开头的控制器，必须同时挂 PermissionGuard 与 DesignAccessGuard；
 * 2. 运行面控制器（前缀 apps / datasets / connectors / cloud-functions / 空前缀）不得挂 DesignAccessGuard
 *    （运行面语义 = 角色规则 + 已发布，与归属无关——ADR-0005 决策 8）；
 * 3. 不允许在空前缀控制器里用方法级路径声明 design/ 路由（设计面必须以控制器前缀整体归类）。
 *
 * 静态扫描源码而非反射路由表：新增设计面控制器漏挂守卫时在单测层即红，不等 e2e。
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// gateway 构建目标为 CommonJS（import.meta 不可用）；vitest 以 apps/gateway 为 cwd 运行（同 dialect-guide-consistency.spec）
const SRC_ROOT = join(process.cwd(), 'src');

function walkControllers(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walkControllers(full, acc);
    } else if (entry.endsWith('.controller.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function controllerPrefix(source: string): string | null {
  const m = source.match(/@Controller\(\s*(?:'([^']*)'|\{\s*path:\s*'([^']*)')?/);
  if (!m) return null;
  return m[1] ?? m[2] ?? '';
}

describe('设计面 /design 路由守卫锚定（ADR-0005）', () => {
  const files = walkControllers(SRC_ROOT);
  const parsed = files.map((file) => {
    const source = readFileSync(file, 'utf8');
    return {
      file: relative(SRC_ROOT, file),
      source,
      prefix: controllerPrefix(source),
      guarded: /@UseGuards\(([^)]*)\)/.exec(source)?.[1] ?? '',
    };
  });

  const designControllers = parsed.filter((c) => c.prefix?.startsWith('design/apps'));

  it('至少扫描到全部 13 个设计面控制器（防扫描路径失效导致假绿）', () => {
    expect(designControllers.length).toBeGreaterThanOrEqual(13);
  });

  it('每个 design/apps 控制器都挂 PermissionGuard + DesignAccessGuard', () => {
    const missing = designControllers
      .filter(
        (c) => !c.guarded.includes('PermissionGuard') || !c.guarded.includes('DesignAccessGuard'),
      )
      .map((c) => `${c.file} → @UseGuards(${c.guarded})`);
    expect(missing, '漏挂守卫的设计面控制器').toEqual([]);
  });

  it('运行面控制器不挂 DesignAccessGuard（归属不约束运行时）', () => {
    const leaked = parsed
      .filter((c) => c.prefix !== null && !c.prefix.startsWith('design/'))
      .filter((c) => c.guarded.includes('DesignAccessGuard'))
      .map((c) => `${c.file} (prefix='${c.prefix}')`);
    expect(leaked, '运行面控制器误挂设计面守卫').toEqual([]);
  });

  it('不在非 design 前缀控制器里用方法级路径声明 design/ 路由', () => {
    const stray = parsed
      .filter((c) => c.prefix !== null && !c.prefix.startsWith('design/'))
      .filter((c) => /@(Get|Post|Put|Patch|Delete)\(\s*'design\//.test(c.source))
      .map((c) => c.file);
    expect(stray, '方法级 design/ 路由必须收进 design/apps 前缀控制器').toEqual([]);
  });
});
