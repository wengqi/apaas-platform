/**
 * ReviewCallbackService — 审批结果出站回调（AI agent 闭环：替代轮询）。
 *
 * 配置 REVIEW_CALLBACK_URL 后，批/驳（单资源与批量）向该 URL POST 事件载荷：
 *   { event, appId, batchId?, submissionId?, module, apiName, status,
 *     reviewComment?, reviewedBy, timestamp }
 * HMAC-SHA256 签名于 X-Apaas-Signature（hex），密钥 REVIEW_CALLBACK_SECRET。
 *
 * 安全：出站经 safeFetch（SSRF 防护）；回调失败仅记 warn 不阻塞审批主流程
 * （审批是人工操作已落库，回调是增强通知，可重试语义由接收方按 event 幂等处理）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { safeFetch, outboundTimeoutMs } from '../common/net/ssrf-guard.js';
import { writeAudit } from '../common/audit.js';

/** 审批回调事件载荷（接收方按 event + submissionId/batchId 幂等去重）。 */
export interface ReviewCallbackEvent {
  event: 'review.approved' | 'review.rejected';
  tenantId: string;
  appId: string;
  /** 批量提交时共享的批次 ID；单资源提交为 null */
  batchId: string | null;
  /** 单资源批准时为该提交单 ID；批量批准为 null（看 batchId） */
  submissionId: string | null;
  module: string;
  apiName: string;
  status: 'APPROVED' | 'REJECTED';
  reviewComment: string | null;
  reviewedBy: string;
  timestamp: string;
}

/** 单个回调目标（当前一个全局 URL；未来可按应用扩展）。 */
export function callbackUrl(): string | null {
  return process.env.REVIEW_CALLBACK_URL || null;
}

export function callbackSecret(): string | null {
  return process.env.REVIEW_CALLBACK_SECRET || null;
}

@Injectable()
export class ReviewCallbackService {
  private readonly logger = new Logger(ReviewCallbackService.name);

  async notify(event: ReviewCallbackEvent): Promise<void> {
    const url = callbackUrl();
    if (!url) return; // 未配置 = 通知渠道关闭，静默跳过
    const body = JSON.stringify(event);
    const secret = callbackSecret();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Apaas-Event': event.event,
    };
    if (secret) {
      headers['X-Apaas-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
    }
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(outboundTimeoutMs()),
      });
      if (!res.ok) {
        this.logger.warn(`审批回调非 2xx: ${res.status}（event=${event.event}）`);
      } else {
        this.logger.log(`审批回调已送达: ${event.event} ${event.module}/${event.apiName}`);
      }
    } catch (err) {
      // 回调失败不阻塞审批主流程（审批已落库，通知增强可由接收方按 event 幂等补偿）
      this.logger.warn(
        `审批回调发送失败: ${err instanceof Error ? err.message : String(err)}（event=${event.event}）`,
      );
    }
    writeAudit({
      tenantId: event.tenantId,
      userId: event.reviewedBy,
      action: 'REVIEW_CALLBACK',
      resource: event.module,
      resourceId: event.submissionId ?? event.batchId ?? '',
      appId: event.appId,
      detail: { event: event.event, delivered: !!url },
    });
  }
}
