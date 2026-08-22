/**
 * 数据集模块 — 数据流 CRUD + 数据集管理 + 执行引擎 + BullMQ 刷新。
 */

import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatasetController } from './dataset.controller.js';
import { DatasetService } from './dataset.service.js';
import { DatasetRowService } from './dataset-row.service.js';
import { DataFlowController } from './dataflow.controller.js';
import { DataFlowService } from './dataflow.service.js';
import { DataFlowEngine } from './dataflow-engine.service.js';
import { DatasetProcessor } from './dataset.processor.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';
import { ChangeLogModule } from '../application/changelog.module.js';
import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
    PermissionModule,
    ChangeLogModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [DatasetController, DataFlowController],
  providers: [
    DatasetService,
    DatasetRowService,
    DataFlowService,
    DataFlowEngine,
    DatasetProcessor,
    JwtStrategy,
  ],
  exports: [DatasetService, DataFlowService, DataFlowEngine],
})
export class DatasetModule {}
