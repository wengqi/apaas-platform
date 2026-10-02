/**
 * 链路中间件 — 请求入口建立 traceId ALS 上下文 + 写响应头。
 *
 * ID 来源单一化：pino-http 的 genReqId（app.module LoggerModule 配置）最先
 * 执行，生成/采纳（X-Trace-Id 头）请求 ID；本中间件采用 req.id 存入 ALS，
 * 供审计/观测/异常过滤器/pino mixin 读取同一 ID。pino-http 缺席（单测直调）
 * 时回退「请求头采纳 → 本地生成」。
 */

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { adoptOrNewTraceId, runWithTrace } from './trace-context.js';

/** pino-http 在请求对象上挂的请求 ID（与 X-Trace-Id 同值）。 */
type RequestWithReqId = Request & { id?: string | number };

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const reqWithId = req as RequestWithReqId;
    const fromReqId =
      typeof reqWithId.id === 'string'
        ? reqWithId.id
        : typeof reqWithId.id === 'number'
          ? String(reqWithId.id)
          : undefined;
    const traceId = fromReqId ?? adoptOrNewTraceId(req.headers['x-trace-id']);
    res.setHeader('X-Trace-Id', traceId);
    runWithTrace(traceId, () => next());
  }
}
