/**
 * 自动编号生成器 — 为 AutoNumber 类型字段生成业务编号。
 *
 * 编号格式规则（用 `{}` 包裹占位符）：
 *   - `{seq:0000}` — 序列号，冒号后为零填充模板，位数由模板长度决定
 *   - `{seq}`      — 序列号，不补零
 *   - `{yyyy}`     — 当前年份 4 位
 *   - `{yy}`       — 当前年份 2 位
 *   - `{mm}`       — 当前月份（补零 2 位）
 *   - `{dd}`       — 当前日期（补零 2 位）
 *
 * 示例：
 *   `ORD-{seq:0000}`       → ORD-0001
 *   `INV-{yyyy}-{seq:000}` → INV-2026-007
 *
 * 序列号持久化策略（简单实现，不依赖 Redis）：
 *   通过查询当前对象下、以"当日已解析前缀"开头的记录数 +1 得到下一个序号。
 *   前缀中的日期占位符先按当日解析，使每天/每月/每年的序号可独立计数。
 *
 *   注：此实现存在并发竞态（两个并发请求可能拿到相同序号），
 *   生产环境应改为数据库序列或唯一约束 + 重试。当前满足 Phase 1 基本可用。
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@apaas/db';

/** 占位符正则：{name} 或 {name:spec}。 */
const PLACEHOLDER = /\{(\w+)(?::([^}]+))?\}/g;

/**
 * 将日期占位符替换为对应字符串。
 * @returns 替换结果；若 token 不是日期占位符则返回 null。
 */
function formatDateToken(token: string, now: Date): string | null {
  switch (token) {
    case 'yyyy':
      return String(now.getFullYear());
    case 'yy':
      return String(now.getFullYear()).slice(-2);
    case 'mm':
      return String(now.getMonth() + 1).padStart(2, '0');
    case 'dd':
      return String(now.getDate()).padStart(2, '0');
    default:
      return null;
  }
}

/**
 * 将序列号按补零模板格式化。
 * @param seq    序列号
 * @param padSpec 补零模板（如 "0000"），其长度决定位数；为空则不补零
 */
function formatSeq(seq: number, padSpec: string | undefined): string {
  if (!padSpec) return String(seq);
  return String(seq).padStart(padSpec.length, '0');
}

/**
 * 渲染编号格式（已知序号）。
 * 仅替换日期与序号占位符，未知占位符原样保留。
 */
function renderFormat(format: string, seq: number, now: Date): string {
  return format.replace(PLACEHOLDER, (match, name: string, spec: string | undefined) => {
    const dateVal = formatDateToken(name, now);
    if (dateVal !== null) return dateVal;
    if (name === 'seq') return formatSeq(seq, spec);
    return match;
  });
}

/**
 * 计算序号占位符之前的"已解析前缀"。
 *
 * 用于在数据库中按前缀统计已有记录数：将 `{seq}` 之前的所有占位符
 * （含日期）按当日解析为具体字符串，作为 like 查询的前缀。
 *
 * 例如 `INV-{yyyy}-{seq:000}` 在 2026-07-31 的前缀为 `INV-2026-`。
 */
function resolvePrefixBeforeSeq(format: string, now: Date): string {
  const seqIdx = format.indexOf('{seq');
  if (seqIdx === -1) {
    // 无序号占位符：整个格式按当日渲染（日期占位符被解析）
    return renderFormat(format, 0, now);
  }
  const prefixRaw = format.slice(0, seqIdx);
  // 渲染前缀中的日期占位符
  return renderFormat(prefixRaw, 0, now);
}

/**
 * 自动编号生成器。
 */
@Injectable()
export class AutoNumberGenerator {
  /**
   * 生成自动编号。
   *
   * @param format   编号格式规则（如 `ORD-{seq:0000}`）
   * @param objectId 所属对象 ID（用于序号计数范围）
   * @returns 生成的编号字符串
   */
  async generate(format: string, objectId: string): Promise<string> {
    const now = new Date();

    // 计算下一个序号：按已解析前缀统计同对象下的记录数
    const seq = await this.nextSeq(format, objectId, now);

    return renderFormat(format, seq, now);
  }

  /**
   * 计算下一个序号。
   *
   * 策略：以"序号占位符之前的已解析前缀"作为 like 前缀，
   * 统计同对象下 data 中以该前缀开头的记录数（通过扫描所有记录的 data）。
   *
   * 简单实现：因记录值存于 JSONB，且自动编号字段 apiName 未知，
   * 这里采用扫描全部记录、在应用层匹配前缀的方式。对象记录量在 Phase 1
   * 规模下可接受；后续可结合字段元数据优化为 JSONB path 查询。
   */
  private async nextSeq(format: string, objectId: string, now: Date): Promise<number> {
    const prefix = resolvePrefixBeforeSeq(format, now);

    // 若格式不含序号占位符，直接返回 0（渲染时不会有 seq）
    if (!format.includes('{seq')) return 0;

    // 拉取该对象下所有记录的 data，在应用层统计前缀匹配数
    const records = await prisma.record.findMany({
      where: { objectId },
      select: { data: true },
    });

    let count = 0;
    for (const record of records) {
      const data = record.data as Record<string, unknown> | null;
      if (!data) continue;
      // 遍历记录的所有字段值，查找以目标前缀开头的字符串值
      for (const value of Object.values(data)) {
        if (typeof value === 'string' && value.startsWith(prefix)) {
          count++;
          break; // 单条记录最多计一次（避免一条记录多个匹配字段重复计数）
        }
      }
    }

    return count + 1;
  }
}

// 导出辅助函数供测试使用
export { renderFormat, resolvePrefixBeforeSeq, formatDateToken, formatSeq };
