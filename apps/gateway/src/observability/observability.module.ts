/**
 * 观测模块（P1 运维治理）— 分类事件流（云函数执行/慢查询/页面报错/开放 API 调用）。
 */

import { Module } from '@nestjs/common';
import { ObservabilityController } from './observability.controller.js';
import { ObservabilityService } from './observability.service.js';

@Module({
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
