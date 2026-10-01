/**
 * PrismaClient 单例工厂 — 含租户隔离 $extends 查询扩展。
 *
 * 全平台共享一个 PrismaClient 实例，避免开发热重载时连接泄漏。
 * 各 NestJS 服务通过 @apaas/db 注入。
 *
 * ## 租户隔离 $extends（Layer 2）
 *
 * 基于 AsyncLocalStorage 的租户上下文，自动将 tenantId 注入到所有
 * 白名单模型的 Prisma 查询 where/data 中。即使开发者遗漏手动添加 tenantId，
 * 扩展也会自动补上，实现纵深防御。
 *
 * ### 注入逻辑
 * 1. 模型在 {@link TENANT_SCOPED_MODELS} 白名单中 → 继续注入
 * 2. ALS 中有 tenantId → 注入到 where/data
 * 3. ALS 中无 tenantId（系统上下文或未初始化）→ 跳过注入
 *    - 系统上下文（runAsSystem）：静默跳过
 *    - 无上下文：记录 warn 日志（fail-open，便于审计遗漏路径）
 *
 * ### 排除模型
 * Tenant / UserRole / OrgMember / View / NodeExecution 无 tenantId 列，
 * 不在白名单中，扩展自动跳过。
 *
 * ### Prisma 5.x Extended WhereUnique
 * update/delete 的 where 接受非唯一字段（如 tenantId），
 * 扩展可安全注入，无需迁移到 updateMany/deleteMany。
 */

import { PrismaClient } from '@prisma/client';
import { getEnvironmentId, getTenantContext } from './tenant-context.js';
import {
  decideEnvInjection,
  decideInjection,
  injectEnvToData,
  injectEnvToUpsert,
  injectEnvToWhere,
  injectToData,
  injectToUpsert,
  injectToWhere,
} from './tenant-injection.js';
import { ENV_SCOPED_MODELS, TENANT_SCOPED_MODELS } from './tenant-models.js';

// 开发热重载防泄漏：globalThis 缓存
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

/**
 * R1.4 多环境：对 ENV_SCOPED_MODELS 白名单模型注入 environmentId（第二维）。
 * ALS 环境上下文为空时跳过（不告警——兼容无环境概念的既有路径）。
 */
function applyEnvInjection(
  model: string,
  args: Record<string, unknown>,
  kind: 'read' | 'create' | 'upsert',
): void {
  const envDecision = decideEnvInjection(model, getEnvironmentId(), ENV_SCOPED_MODELS);
  if (!envDecision.inject || !envDecision.environmentId) return;
  if (kind === 'create') injectEnvToData(args, envDecision.environmentId);
  else if (kind === 'upsert') injectEnvToUpsert(args, envDecision.environmentId);
  else injectEnvToWhere(args, envDecision.environmentId);
}

/** 记录无租户上下文的告警（fail-open 模式） */
function warnNoTenantContext(model: string, operation: string): void {
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      `[TenantIsolation] 无租户上下文，查询未注入 tenantId: ${model}.${operation}()。` +
        '若非系统操作，请检查调用路径是否设置了租户上下文。',
    );
  }
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      /** 读操作：findMany / findFirst / findUnique / count — 注入 where.tenantId */
      async findMany({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'findMany');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      async findFirst({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'findFirst');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      async findUnique({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'findUnique');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      async count({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'count');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      /** 写操作：create / createMany — 注入 data.tenantId */
      async create({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToData(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'create');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'create');
        return query(args);
      },

      async createMany({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToData(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'createMany');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'create');
        return query(args);
      },

      /** 写操作：update / updateMany — 注入 where.tenantId（Prisma 5.x Extended WhereUnique） */
      async update({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'update');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      async updateMany({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'updateMany');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      /** 删除操作：delete / deleteMany — 注入 where.tenantId */
      async delete({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'delete');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      async deleteMany({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToWhere(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'deleteMany');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'read');
        return query(args);
      },

      /** upsert — 注入 where.tenantId + create.tenantId */
      async upsert({ model, args, query }) {
        const decision = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        if (decision.inject && decision.tenantId) {
          injectToUpsert(args as Record<string, unknown>, decision.tenantId);
        } else if (!decision.inject && !decision.systemContext && TENANT_SCOPED_MODELS.has(model)) {
          warnNoTenantContext(model, 'upsert');
        }
        applyEnvInjection(model, args as Record<string, unknown>, 'upsert');
        return query(args);
      },
    },
  },
});

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
export {
  getTenantId,
  getEnvironmentId,
  getTenantContext,
  isSystemContext,
  runWithTenant,
  runWithEnv,
  runAsSystem,
} from './tenant-context.js';
export {
  decideInjection,
  decideEnvInjection,
  injectToWhere,
  injectToData,
  injectToUpsert,
  injectEnvToWhere,
  injectEnvToData,
  injectEnvToUpsert,
} from './tenant-injection.js';
export { ENV_SCOPED_MODELS, TENANT_SCOPED_MODELS } from './tenant-models.js';
