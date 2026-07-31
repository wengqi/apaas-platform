/**
 * 节点执行器注册表。
 *
 * 引擎按 node.type 从注册表查找执行器并调用。
 * 执行器通过依赖注入获取领域服务，保持执行器纯粹。
 * 新增节点类型只需注册新执行器，引擎核心不动。
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import type { NodeExecutor } from './types.js';
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

@Injectable()
export class NodeExecutorRegistry {
  private readonly registry = new Map<string, NodeExecutor>();

  constructor(
    private readonly startExecutor: StartExecutor,
    private readonly endExecutor: EndExecutor,
    private readonly triggerExecutor: TriggerExecutor,
    private readonly assignExecutor: AssignExecutor,
    private readonly conditionExecutor: ConditionExecutor,
    private readonly parallelExecutor: ParallelExecutor,
    private readonly delayExecutor: DelayExecutor,
    private readonly objectOperationExecutor: ObjectOperationExecutor,
    private readonly userTaskExecutor: UserTaskExecutor,
    private readonly notificationExecutor: NotificationExecutor,
    private readonly httpRequestExecutor: HttpRequestExecutor,
    private readonly subProcessExecutor: SubProcessExecutor,
  ) {
    // 注册 MVP P0 + P1 节点执行器（对应 SimplifiedNodeType snake_case）
    this.register(this.startExecutor);
    this.register(this.endExecutor);
    this.register(this.triggerExecutor);
    this.register(this.assignExecutor);
    this.register(this.conditionExecutor);
    this.register(this.parallelExecutor);
    this.register(this.delayExecutor);
    this.register(this.objectOperationExecutor);
    this.register(this.userTaskExecutor);
    this.register(this.notificationExecutor);
    this.register(this.httpRequestExecutor);
    this.register(this.subProcessExecutor);
  }

  /** 注册执行器。 */
  register(executor: NodeExecutor): void {
    this.registry.set(executor.type, executor);
  }

  /**
   * 按 node.type 查找执行器。
   * 未注册时抛 BadRequestException（unsupported_node_type）。
   */
  get(type: string): NodeExecutor {
    const executor = this.registry.get(type);
    if (!executor) {
      throw new BadRequestException({
        code: 'unsupported_node_type',
        message: `未注册的节点类型: ${type}`,
      });
    }
    return executor;
  }

  /** 是否已注册该类型。 */
  has(type: string): boolean {
    return this.registry.has(type);
  }
}
