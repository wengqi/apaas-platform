/**
 * BullMQ 队列缺省作业选项（PE-11，R-B 波次④）——与 processQueue 的入队选项
 * 收敛为共享常量。delayQueue 三类作业（延时恢复/等待条件轮询/审批超时）此前
 * 未传 attempts/removeOnComplete 且队列无 defaultJobOptions：BullMQ 缺省零重试，
 * 一次失败永久搁浅实例；completed 作业永久滞留 Redis。
 * 注意（R2-compat-08）：defaultJobOptions 仅对新入队 job 生效——升级时刻在途
 * job 一次性窗口接受自然消化。
 */
export const QUEUE_DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 },
} as const;
