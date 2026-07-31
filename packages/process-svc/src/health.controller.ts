import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { service: 'process-svc', status: 'ok', timestamp: new Date().toISOString() };
  }
}
