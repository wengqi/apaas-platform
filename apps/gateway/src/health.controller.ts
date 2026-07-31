import { Controller, Get } from '@nestjs/common';

/**
 * 健康检查端点。Docker / 负载均衡器探活用。
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
