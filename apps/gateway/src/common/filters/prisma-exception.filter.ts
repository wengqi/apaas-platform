/**
 * Prisma 异常过滤器 — 将 Prisma Client 错误码转译为业务友好的 HTTP 状态码。
 *
 * 覆盖的常见错误码：
 *   P2002 唯一约束冲突 → 409 Conflict
 *   P2025 记录不存在   → 404 Not Found
 *   P2003 外键约束冲突 → 400 Bad Request
 *   其他               → 500 Internal Server Error
 *
 * 注意：必须注册在 AllExceptionsFilter 之前（更具体的过滤器优先），
 * 且直接写响应而非 rethrow（filter 内抛出的 HttpException 不会被其他 filter 再次拦截）。
 */

import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@apaas/db';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: HttpStatus;
    let message: string;

    switch (exception.code) {
      case 'P2002': // Unique constraint failed
        status = HttpStatus.CONFLICT;
        message = `唯一约束冲突：${(exception.meta?.target as string[] | undefined)?.join(', ') ?? '未知字段'} 已存在`;
        break;

      case 'P2025': // Record not found
        status = HttpStatus.NOT_FOUND;
        message = '请求的资源不存在';
        break;

      case 'P2003': // Foreign key constraint failed
        status = HttpStatus.BAD_REQUEST;
        message = '关联数据约束失败，请检查引用的记录是否存在';
        break;

      default:
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = '数据库操作失败';
        break;
    }

    response.status(status).json({
      ok: false,
      error: { code: status, message },
    });
  }
}
