/**
 * 业务节点卡片渲染器（从 nodeRenderers.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import { useEffect, useState } from 'react';
import { useNodeRender, useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { getNodeMeta } from '../../../constants/process.js';
import { checkNodeIncomplete, getNodeSummary } from '../nodeMetadata.js';

const { Text } = Typography;

export interface BusinessNodeRendererProps extends Pick<
  ReturnType<typeof useNodeRender>,
  'startDrag' | 'dragging' | 'activated' | 'onMouseEnter' | 'onMouseLeave'
> {
  node: { id: string; flowNodeType?: string; getExtInfo?: () => Record<string, unknown> };
  ctx: ReturnType<typeof useClientContext>;
}

export function BusinessNodeRenderer({
  node,
  ctx,
  startDrag,
  dragging,
  activated,
  onMouseEnter,
  onMouseLeave,
}: BusinessNodeRendererProps) {
  const type = node?.flowNodeType ?? 'unknown';
  const extInfo = node?.getExtInfo?.() ?? {};

  const meta = getNodeMeta(type);
  const Icon = meta.icon;
  const title = (extInfo.title as string) || meta.label;
  const summary = getNodeSummary(type, extInfo);
  const isIncomplete = checkNodeIncomplete(type, extInfo);
  const [isSelected, setIsSelected] = useState(false);

  useEffect(() => {
    const check = () => {
      const sel = ctx.selection?.selection;
      setIsSelected(!!(sel && sel.length > 0 && sel[0]?.id === node?.id));
    };
    check();
    const disposable = ctx.selection?.onSelectionChanged?.(check);
    return () => disposable?.dispose?.();
  }, [ctx.selection, node?.id]);

  const handleClick = () => {
    if (dragging) return;
    const flowNode = ctx.document.getNode(node.id);
    if (flowNode) ctx.selection.selection = [flowNode];
  };

  const borderColor = isSelected ? '#1677ff' : activated ? '#91caff' : '#e8eaed';
  const isTerminal = type === 'start' || type === 'end';
  const nodeWidth = isTerminal ? 120 : 240;

  return (
    <div
      // 测试钩子（评审整改）：供 e2e 精确定位画布节点，避免与左侧节点面板按钮混淆
      data-testid="flow-node"
      data-node-id={node.id}
      data-node-type={type}
      onMouseDown={startDrag}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 10,
        background: '#fff',
        border: `2px solid ${borderColor}`,
        boxShadow: isSelected ? '0 2px 12px rgba(22,119,255,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'grab',
        width: nodeWidth,
        opacity: dragging ? 0.5 : 1,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isTerminal ? 'center' : 'flex-start',
          gap: 8,
          padding: '8px 16px',
          flexShrink: 0,
          position: isTerminal ? 'relative' : undefined,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
            color: '#fff',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon style={{ fontSize: 18 }} />
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#1a1a1a',
            flex: isTerminal ? undefined : 1,
          }}
        >
          {title}
        </span>
        {isIncomplete && !isTerminal && (
          <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
        )}
        {isIncomplete && isTerminal && (
          <ExclamationCircleOutlined
            style={{
              color: '#ff4d4f',
              fontSize: 14,
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        )}
      </div>

      {summary && (
        <Text
          style={{
            fontSize: 12,
            color: 'rgba(0,0,0,0.45)',
            padding: isTerminal ? '0 16px 8px' : '0 16px 8px 40px',
            textAlign: isTerminal ? 'center' : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </Text>
      )}

      {isIncomplete && !isTerminal && (
        <div style={{ padding: '0 16px 8px 40px' }}>
          <Text style={{ fontSize: 12, color: '#ff4d4f' }}>有未完成的配置</Text>
        </div>
      )}
    </div>
  );
}
