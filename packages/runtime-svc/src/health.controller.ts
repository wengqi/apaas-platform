import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { service: 'runtime-svc', status: 'ok', timestamp: new Date().toISOString() };
  }
}
