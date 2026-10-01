/**
 * 环境解析服务（R1.4）——运行时元数据读路径的环境感知内核。
 *
 * 解析链：AppEnvironment.currentVersionId → AppVersion.snapshot（不可变 bundle）
 *        → 降级 Application.publishedSnapshot（存量应用兼容）
 *        → null（调用方走活表旧路径）。
 *
 * 缓存：内存 Map<appId:envKey, bundle>，发布/回滚/回切时显式失效
 * （invalidateApp）。快照不可变 + 指针切换频率低，缓存安全。
 *
 * 兼容不变量：无指针的应用（seed 直写 publishedSnapshot）永远走旧路径，
 * 行为零变化；新发布的应用获得完整环境语义。
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { AppSnapshot, EnvironmentKey } from '@apaas/shared';
import { substituteEnvRefs } from '@apaas/shared';

/** 解析出的环境运行时上下文 */
export interface ResolvedEnvironment {
  environmentId: string;
  versionId: string | null;
  /** 是否命中环境指针（true=bundle 模式；false=旧快照/活表降级模式） */
  bundleMode: boolean;
  /** bundle 模式下的快照（已做 ${env.*} 替换）；非 bundle 模式为 null */
  bundle: AppSnapshot | null;
}

/** 缓存的解析产物：rawBundle 不做 ${env.*} 替换（值可独立于指针变化，读取时实时替换） */
interface CachedResolution {
  environmentId: string;
  versionId: string | null;
  bundleMode: boolean;
  rawBundle: AppSnapshot | null;
}

@Injectable()
export class EnvironmentResolverService {
  private readonly logger = new Logger(EnvironmentResolverService.name);
  private readonly cache = new Map<string, CachedResolution>();

  /** 确保应用的 dev/prod 环境行存在（幂等），返回环境 key → 行 id 映射。 */
  async ensureEnvironments(
    tenantId: string,
    appId: string,
  ): Promise<Record<EnvironmentKey, string>> {
    const existing = await prisma.appEnvironment.findMany({ where: { appId, tenantId } });
    const map: Partial<Record<EnvironmentKey, string>> = {};
    for (const row of existing) {
      map[row.key as EnvironmentKey] = row.id;
    }
    for (const key of ['dev', 'prod'] as const) {
      if (!map[key]) {
        const created = await prisma.appEnvironment.create({
          data: { tenantId, appId, key },
        });
        map[key] = created.id;
      }
    }
    return map as Record<EnvironmentKey, string>;
  }

  /**
   * 解析应用在指定环境的运行时上下文（bundle 或降级标记）。
   * 结果按 appId+env 缓存，发布/回滚后失效。
   */
  async resolve(tenantId: string, appId: string, envKey: string): Promise<ResolvedEnvironment> {
    const cacheKey = `${appId}:${envKey}`;

    // 解析指针 → 原始 bundle（缓存：快照不可变 + 指针切换频率低）
    let cached = this.cache.get(cacheKey);
    if (!cached) {
      cached = await this.resolveRaw(tenantId, appId, envKey, cacheKey);
    }

    if (!cached.bundleMode || !cached.rawBundle) {
      return {
        environmentId: cached.environmentId,
        versionId: cached.versionId,
        bundleMode: false,
        bundle: cached.rawBundle,
      };
    }

    // bundle 模式：每次读取实时做 ${env.*} 替换（环境变量值可独立于发布变化）
    const values = await this.loadEnvVarValues(cached.environmentId);
    const substituted = substituteEnvRefs(cached.rawBundle, values);
    if (substituted.warnings.length > 0) {
      this.logger.warn(
        `bundle 存在未定义的环境变量引用: app=${appId} env=${envKey} ${substituted.warnings.join(', ')}`,
      );
    }
    return {
      environmentId: cached.environmentId,
      versionId: cached.versionId,
      bundleMode: true,
      bundle: substituted.value as AppSnapshot,
    };
  }

  /** 指针 → 原始快照（未替换），含降级链；结果入缓存 */
  private async resolveRaw(
    tenantId: string,
    appId: string,
    envKey: string,
    cacheKey: string,
  ): Promise<CachedResolution> {
    const env = await prisma.appEnvironment.findFirst({
      where: { appId, tenantId, key: envKey },
    });
    if (!env || !env.currentVersionId) {
      // 无环境行（极老数据）或未部署：旧快照降级
      return this.legacyFallbackRaw(appId, cacheKey);
    }

    const version = await prisma.appVersion.findFirst({
      where: { id: env.currentVersionId, tenantId },
    });
    if (!version) {
      this.logger.warn(`环境指针指向的版本缺失: app=${appId} env=${envKey}`);
      return this.legacyFallbackRaw(appId, cacheKey);
    }

    const cached: CachedResolution = {
      environmentId: env.id,
      versionId: version.id,
      bundleMode: true,
      rawBundle: version.snapshot as unknown as AppSnapshot,
    };
    this.cache.set(cacheKey, cached);
    return cached;
  }

  /** 加载环境的变量值映射（敏感值解密；替换时统一使用明文） */
  async loadEnvVarValues(appEnvironmentRowId: string): Promise<Record<string, string>> {
    const rows = await prisma.envVarValue.findMany({
      where: { environmentId: appEnvironmentRowId },
      include: { def: { select: { key: true, sensitive: true } } },
    });
    const values: Record<string, string> = {};
    for (const row of rows) {
      if (row.def.sensitive) {
        try {
          const { decryptJson } = await import('../connector/crypto.util.js');
          values[row.def.key] = decryptJson<string>(row.value);
        } catch {
          this.logger.warn(`环境变量解密失败: def=${row.def.key}`);
        }
      } else {
        values[row.def.key] = row.value;
      }
    }
    return values;
  }

  /** 旧快照降级（无指针）：publishedSnapshot 存在 → bundleMode=false + 旧快照；否则 null */
  private async legacyFallbackRaw(appId: string, cacheKey: string): Promise<CachedResolution> {
    const app = await prisma.application.findFirst({
      where: { id: appId },
      select: { publishedSnapshot: true },
    });
    const resolved: CachedResolution = {
      environmentId: '',
      versionId: null,
      bundleMode: false,
      rawBundle: (app?.publishedSnapshot ?? null) as unknown as AppSnapshot | null,
    };
    this.cache.set(cacheKey, resolved);
    return resolved;
  }

  /** 发布/回滚/指针变化后失效该应用的缓存 */
  invalidateApp(appId: string): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${appId}:`)) this.cache.delete(key);
    }
  }
}
