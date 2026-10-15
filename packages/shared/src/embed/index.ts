/**
 * @apaas/shared/embed — iframe 嵌入通信协议 + 宿主侧 SDK。
 *
 * 平台运行时页面被宿主系统 iframe 集成的标准通道：
 * - protocol.ts：消息信封 / 类型常量 / 载荷契约（两端共享，SSOT）
 * - host-client.ts：宿主系统用的零依赖 vanilla TS 客户端
 */

export * from './protocol.js';
export * from './host-client.js';
