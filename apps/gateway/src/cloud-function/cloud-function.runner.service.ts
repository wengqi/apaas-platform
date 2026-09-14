/**
 * 云函数沙箱执行引擎 — 使用 isolated-vm 创建 V8 Isolate 隔离执行用户代码。
 *
 * 安全措施：
 * - V8 Isolate 级内存隔离（独立堆，无法访问主进程内存）
 * - 内存限制：128MB（可配置 CLOUD_FUNCTION_MEMORY_LIMIT_MB）
 * - 执行超时：5 秒（可配置 CLOUD_FUNCTION_TIMEOUT_MS）
 * - 无 require / process / 全局对象访问
 * - 仅注入受限 context：{ log(msg), tenantId, appId }
 *
 * 用户代码签名：async function handler(input, context) { ... return result; }
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ivm from 'isolated-vm';
import type { CloudFunctionCallResult } from '@apaas/shared';

/** 默认代码模板。 */
export const DEFAULT_FUNCTION_CODE = `async function handler(input, context) {
  context.log('Hello from cloud function!');
  return { message: 'success', input };
}`;

@Injectable()
export class CloudFunctionRunner {
  private readonly logger = new Logger(CloudFunctionRunner.name);
  private readonly memoryLimitMB: number;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.memoryLimitMB = this.config.get<number>('CLOUD_FUNCTION_MEMORY_LIMIT_MB') ?? 128;
    this.timeoutMs = this.config.get<number>('CLOUD_FUNCTION_TIMEOUT_MS') ?? 5000;
  }

  /**
   * 在沙箱中执行用户代码。
   *
   * @param source 用户代码（handler 函数体）
   * @param input 输入参数
   * @param tenantId 租户 ID（注入到 context，只读）
   * @param appId 应用 ID（注入到 context，只读）
   * @returns 执行结果
   */
  async execute(
    source: string,
    input: Record<string, unknown>,
    tenantId: string,
    appId: string,
  ): Promise<CloudFunctionCallResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    // B8 修复：将 isolate 提升到 try 之外，确保 finally 能访问并释放。
    // 此前 isolate 在 try 内 const 声明，失败路径 catch 无法 dispose → 每次失败泄漏 128MB。
    let isolate: ivm.Isolate | undefined;

    try {
      isolate = new ivm.Isolate({ memoryLimit: this.memoryLimitMB });
      const context = isolate.createContextSync();

      // 注入 context 对象 — 只读的租户/应用信息（log 函数在包装代码中通过 __logRef 调用）
      const contextData = { tenantId, appId };
      context.global.setSync('context', new ivm.ExternalCopy(contextData).copyInto());

      // 注入 log 函数 — 使用 ivm.Reference 包装主进程函数，isolate 内通过 applySync 调用
      const logFn = function (...args: unknown[]) {
        logs.push(
          args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
        );
      };
      const logRef = new ivm.Reference(logFn);
      context.global.setSync('__logRef', logRef);

      // 注入 input
      context.global.setSync('input', new ivm.ExternalCopy(input).copyInto());

      // 包装用户代码：构建 context.log（通过 __logRef.applySync 转发），定义 handler，调用并返回结果
      const wrappedCode = `
        context.log = function(...args) { __logRef.applySync(undefined, args); };
        ${source}
        // 执行 handler 并返回结果
        const result = handler(input, context);
        // 如果返回 Promise，等待 resolve
        if (result && typeof result.then === 'function') {
          result.then(r => __resolve(r)).catch(e => __reject(e.message));
        } else {
          __resolve(result);
        }
      `;

      // 编译并执行
      const script = isolate.compileScriptSync(wrappedCode);

      // 创建 promise 机制获取异步结果
      let resolveResult: (value: unknown) => void;
      let rejectResult: (reason: Error) => void;
      const resultPromise = new Promise<unknown>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      // 注入 resolve/reject 回调
      context.global.setSync('__resolve', function (value: unknown) {
        resolveResult(value);
      });
      context.global.setSync('__reject', function (msg: string) {
        rejectResult(new Error(msg));
      });

      // 执行脚本（带超时）
      script.runSync(context, { timeout: this.timeoutMs });

      // 等待异步结果（带超时保护）
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`执行超时（${this.timeoutMs}ms）`)), this.timeoutMs);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);

      const durationMs = Date.now() - startTime;
      this.logger.debug(`云函数执行完成，耗时 ${durationMs}ms`);

      return {
        success: true,
        result: result ?? null,
        logs,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`云函数执行失败: ${errorMsg}（${durationMs}ms）`);

      return {
        success: false,
        error: errorMsg,
        logs,
        durationMs,
      };
    } finally {
      // B8 修复：无论成功还是失败，都释放 Isolate 资源。
      // isolate.dispose() 会回收整个 V8 堆（含 context/script/ExternalCopy/Reference）。
      // logRef 持有的宿主侧闭包在 isolate disposed 后自动失效，无需显式释放。
      isolate?.dispose();
    }
  }
}
