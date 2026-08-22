/**
 * 队列名称常量。
 */

/** 流程执行队列 — 驱动 ProcessEngine.executeNextNode 异步推进令牌。 */
export const PROCESS_QUEUE = 'process-queue';

/** 延时恢复队列 — delay 节点到时后恢复令牌推进。 */
export const DELAY_QUEUE = 'delay-queue';

/** 数据集刷新队列 — 异步执行数据流 pipeline 并物化结果。 */
export const DATASET_QUEUE = 'dataset-queue';
