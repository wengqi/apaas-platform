/**
 * 全局异常过滤器 — 统一所有未捕获异常的响应格式。
 *
 * 响应格式与业务层的 { ok: true, data: ... } 信封对称：
 *   { ok: false, error: { code: number, message: string } }
 *
 * - HttpException：保留原始 status code 和 message
 * - 其他异常：500 Internal Server Error，开发环境日志保留堆栈
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message instanceof Array
            ? (res as { message: string[] }).message.join('; ')
            : ((res as { message?: string }).message ?? exception.message);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      // 开发环境保留完整堆栈用于调试
      this.logger.error(
        `Unhandled exception: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      ok: false,
      error: {
        code: status,
        message,
      },
    });
  }
}
