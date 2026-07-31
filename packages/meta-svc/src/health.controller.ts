import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { service: 'meta-svc', status: 'ok', timestamp: new Date().toISOString() };
  }
}
