/**
 * PrismaClient 单例工厂。
 *
 * 全平台共享一个 PrismaClient 实例，避免开发热重载时连接泄漏。
 * 各 NestJS 服务通过 @apaas/db 注入，或自建 Module 包装。
 */

import { PrismaClient } from '@prisma/client';

// 开发热重载防泄漏：globalThis 缓存
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
