import { Controller, Get, HttpException, Inject, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { prisma } from '@apaas/db';
import { PROCESS_QUEUE } from './queue/queue.constants.js';

/** 依赖探测超时缺省（毫秒）——探活端点不得因依赖挂起而无限等待。 */
const HEALTH_PROBE_TIMEOUT_MS_DEFAULT = 2_000;

/**
 * 健康检查端点。Docker / 负载均衡器探活用。
 *
 * PE-12（R-B 波次④收官）：纯静态 ok 不探依赖——PG/Redis 不可达时探活仍绿，
 * 编排器不放流/不重启，故障发现延迟到业务报错。现对 PostgreSQL（SELECT 1）与
 * Redis（BullMQ getJobCounts，真实 Redis 往返）做带超时探测：
 * - 健康：200 `{status:'ok', dependencies:{database,redis}}`（shape 兼容既有探活）
 * - 任一失败/超时：503 `{status:'degraded', message}`——全局 AllExceptionsFilter
 *   仅透出 message 字段（OCR 复审 2026-11-10），失败依赖名单写入 message 才可达客户端
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(PROCESS_QUEUE) private readonly processQueue: Queue) {}

  @Get()
  async check() {
    const configured = Number(process.env['HEALTH_PROBE_TIMEOUT_MS']);
    // 钳值（OCR 复审：负值/非有限值经 || 会漏过——负数 truthy 且让 setTimeout
    // 立即触发，探活全 error 永久 503）
    const timeoutMs =
      Number.isFinite(configured) && configured > 0 ? configured : HEALTH_PROBE_TIMEOUT_MS_DEFAULT;
    // 并发探测（OCR 复审：串行最坏 2×timeout≈4s，编排器探活超时窗口可能先切）
    // 已知取舍：Promise.race 不取消败者——maxRetriesPerRequest:null 下 Redis 宕机
    // 期间每次探测在 ioredis 离线队列留一条待发命令，重连时一次性冲刷（探活频度
    // 低、命令轻量，接受）；探测失败原因记 warn 供排障（超时/拒连/配置错误可分）
    const [database, redis] = await Promise.all([
      probe('database', () => prisma.$queryRaw`SELECT 1`, timeoutMs, this.logger),
      probe('redis', () => this.processQueue.getJobCounts(), timeoutMs, this.logger),
    ]);
    const dependencies = { database, redis };
    const body = {
      status: Object.values(dependencies).every((d) => d === 'ok') ? 'ok' : 'degraded',
      dependencies,
      timestamp: new Date().toISOString(),
    };
    if (body.status !== 'ok') {
      const failed = Object.entries(dependencies)
        .filter(([, v]) => v !== 'ok')
        .map(([name]) => name)
        .join(',');
      throw new HttpException({ ...body, message: `依赖降级: ${failed}` }, 503);
    }
    return body;
  }
}

/** 带超时探测：ok / error（超时与异常同义——探活语义只关心可用与否）。 */
async function probe(
  name: string,
  fn: () => Promise<unknown>,
  timeoutMs: number,
  logger: Logger,
): Promise<'ok' | 'error'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), timeoutMs);
      }),
    ]);
    return 'ok';
  } catch (error) {
    logger.warn(`健康探测失败（${name}，${timeoutMs}ms）: ${String(error)}`);
    return 'error';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
