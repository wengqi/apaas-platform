/**
 * 流程模块 — 自研流程执行内核。
 *
 * 注册：
 * - ProcessController（流程定义/实例/人工任务/通知模版路由）
 * - ProcessService（CRUD + 委托引擎执行）
 * - ProcessEngine（状态机 token 流执行内核）
 * - NodeExecutorRegistry + 全部节点执行器（按 type 路由分发）
 *
 * 独立持有 JwtModule + JwtStrategy，使流程路由可受 JWT 保护。
 * 模式同 ApplicationModule。
 */

import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { ProcessController } from './process.controller.js';
import { ProcessService } from './process.service.js';
import { ProcessEngine } from './process-engine.js';
import { NodeExecutorRegistry } from './node-executor.registry.js';
import { StartExecutor } from './node-executors/start.executor.js';
import { EndExecutor } from './node-executors/end.executor.js';
import { TriggerExecutor } from './node-executors/trigger.executor.js';
import { AssignExecutor } from './node-executors/assign.executor.js';
import { ConditionExecutor } from './node-executors/condition.executor.js';
import { ParallelExecutor } from './node-executors/parallel.executor.js';
import { DelayExecutor } from './node-executors/delay.executor.js';
import { ObjectOperationExecutor } from './node-executors/object-operation.executor.js';
import { UserTaskExecutor } from './node-executors/user-task.executor.js';
import { NotificationExecutor } from './node-executors/notification.executor.js';
import { HttpRequestExecutor } from './node-executors/http-request.executor.js';
import { SubProcessExecutor } from './node-executors/sub-process.executor.js';
import { TriggerService } from './trigger.service.js';

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
    forwardRef(() => QueueModule),
  ],
  controllers: [ProcessController],
  providers: [
    ProcessService,
    ProcessEngine,
    NodeExecutorRegistry,
    // 节点执行器
    StartExecutor,
    EndExecutor,
    TriggerExecutor,
    AssignExecutor,
    ConditionExecutor,
    ParallelExecutor,
    DelayExecutor,
    ObjectOperationExecutor,
    UserTaskExecutor,
    NotificationExecutor,
    HttpRequestExecutor,
    SubProcessExecutor,
    // JWT 策略
    JwtStrategy,
    // 触发器服务
    TriggerService,
  ],
  exports: [ProcessService, ProcessEngine, TriggerService],
})
export class ProcessModule {}
