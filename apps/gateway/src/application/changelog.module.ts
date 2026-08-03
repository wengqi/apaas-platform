/**
 * 变更追踪模块 — 独立导出 ChangeLogService，供各业务模块注入。
 *
 * 将 ChangeLogService 从 ApplicationModule 中抽出为独立模块，
 * 避免 PageModule / ObjectModule / ProcessModule 反向依赖 ApplicationModule
 * 导致循环依赖。
 */
import { Module } from '@nestjs/common';
import { ChangeLogService } from './changelog.service.js';

@Module({
  providers: [ChangeLogService],
  exports: [ChangeLogService],
})
export class ChangeLogModule {}
