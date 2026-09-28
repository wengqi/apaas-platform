/**
 * 表单字段有效跨度计算 — 纯函数（node 环境可测）。
 *
 * 优先级：字段显式 span（1-12 整数）> 表单容器 columns 折算（12/列数）> 整行 12。
 * 对齐飞书「每行列数 + 字段宽度」语义：列数只约束未显式设置宽度的字段。
 */

interface SpanLikeNode {
  props: Record<string, unknown>;
}

/** 表单字段有效跨度（1-12 栅格）。 */
export function effectiveFieldSpan(node: SpanLikeNode, columns: number): number {
  const raw = node.props.span;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const floored = Math.floor(raw);
    if (floored >= 1 && floored <= 12) return floored;
  }
  if (columns === 2 || columns === 3) return Math.floor(12 / columns);
  return 12;
}
