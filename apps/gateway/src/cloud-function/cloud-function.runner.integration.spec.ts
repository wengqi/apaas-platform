/**
 * CloudFunctionRunner 集成测试（真实 isolated-vm，对抗审查 security-05/R2 + security-04/R1）。
 *
 * runner.service.spec 的 isolated-vm 桩验证不了真实执行语义，本文件用真实原生模块钉住两条不变量：
 * 1. 异步 run（P0-3）：租户代码在 isolate 自有线程执行——忙循环期间宿主事件循环保持响应
 *    （原 runSync 实测 4.5s 忙循环冻结 /health 4513ms，~12 次/min 可近持续冻结全进程）；
 * 2. 日志上限（P0-7）：host 侧 logs 容量封顶 200 行 + logsTruncated 丢弃计数
 *    （原实现实测单函数 3s 窗口灌 14.7GB host 堆，跨租户 OOM DoS）。
 */

import { describe, it, expect } from 'vitest';
import ivm from 'isolated-vm';
import { ConfigService } from '@nestjs/config';
import { CloudFunctionRunner } from './cloud-function.runner.service.js';

function makeRunner(): CloudFunctionRunner {
  const config = { get: () => undefined } as unknown as ConfigService; // 走默认 128MB / 5000ms
  return new CloudFunctionRunner(config);
}

const ivmUsable = (() => {
  try {
    new ivm.Isolate({ memoryLimit: 16 }).dispose();
    return true;
  } catch {
    return false; // 原生模块不可用的环境跳过（CI 运行镜像与生产一致，通常可用）
  }
})();

describe.skipIf(!ivmUsable)('CloudFunctionRunner 集成（真实 isolated-vm）', () => {
  it('异步 run：忙循环期间宿主事件循环保持响应（P0-3 回归）', async () => {
    const runner = makeRunner();
    // 事件驱动度量（禁轮询原则）：与忙循环并行的 10ms sleep——事件循环被冻结时
    // sleep 的实际完成时间会被拖到忙循环结束（runSync 实测 ≈ 忙循环时长 1200ms）
    const sleepElapsed = new Promise<number>((resolve) => {
      const start = Date.now();
      setTimeout(() => resolve(Date.now() - start), 10);
    });
    const [, elapsed] = await Promise.all([
      runner.execute(
        'async function handler(input) { const end = Date.now() + input.ms; while (Date.now() < end) {} return "done"; }',
        { ms: 1200 },
        't1',
        'app-1',
      ),
      sleepElapsed,
    ]);
    // 异步 run：sleep ≈10ms 正常完成；runSync：≈1200ms（冻结至忙循环结束）
    expect(elapsed).toBeLessThan(600);
  }, 20_000);

  it('日志上限：200 行封顶 + logsTruncated 丢弃计数（P0-7 回归）', async () => {
    const runner = makeRunner();
    const result = await runner.execute(
      'async function handler(input) { for (let i = 0; i < input.n; i++) context.log("line-" + i); return "done"; }',
      { n: 300 },
      't1',
      'app-1',
    );
    expect(result.success, `execute 失败: ${result.error ?? '(无错误信息)'}`).toBe(true);
    expect(result.logs).toHaveLength(200);
    expect(result.logsTruncated).toBe(100);
  }, 20_000);
});
