/**
 * 节点渲染器 — 通过 renderDefaultNode 注册到 flowgram。
 *
 * 从 SimplifiedEditor.tsx 提取，包含：
 * - BlockOrderIconLabel: 分支标签组件
 * - ApaasNodeRenderer: 节点渲染入口（按 type 分发）
 * - BusinessNodeRenderer: 业务节点卡片
 */

import { useState, useEffect, useMemo } from 'react';
import { useNodeRender, useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { useListenEvents } from '@flowgram.ai/core';
import { Tooltip, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { getNodeMeta } from '../../constants/process.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';
import { jsonLogicToExpression } from './configs/jsonlogic-utils.js';
import { getBranchBlocks, isElseBlock } from './conditionBranchUtils.js';
import { checkNodeIncomplete, getNodeSummary } from './nodeMetadata.js';

const { Text } = Typography;

/**
 * 分支标签组件 — 从 flowgram extInfo 和块树实时读取数据。
 */
function BlockOrderIconLabel({
  blockId,
  conditionNodeId,
  fallbackLabel,
  fallbackIsElse,
}: {
  blockId?: string;
  conditionNodeId?: string;
  fallbackLabel: string;
  fallbackIsElse: boolean;
}) {
  const ctx = useClientContext();
  const conditionNode = conditionNodeId ? ctx.document.getNode(conditionNodeId) : undefined;
  useListenEvents(...(conditionNode?.onExtInfoChange ? [conditionNode.onExtInfoChange] : []));
  const _storeVersion = useProcessEditorStore((s) => s.schema);

  let isElse = fallbackIsElse;
  let conditions: Array<{ label?: string; condition?: object | null; id?: string }> = [];
  let displayIndex = 0;
  if (blockId && conditionNode) {
    const condExtInfo = conditionNode.getExtInfo?.() ?? {};
    conditions =
      (condExtInfo.conditions as Array<{
        label?: string;
        condition?: object | null;
        id?: string;
      }>) || [];
    const branchBlocks = getBranchBlocks(conditionNode);
    const blockNode = branchBlocks.find((b) => b.id === blockId);
    if (blockNode) {
      isElse = isElseBlock(blockNode);
    } else {
      isElse = blockId.includes('elseBlock') || fallbackIsElse;
    }

    if (conditions.length > 0) {
      const blockTitle = blockNode?.getExtInfo?.()?.title as string | undefined;
      if (isElse) {
        displayIndex = conditions.length - 1;
      } else {
        const matchedIdx = conditions.findIndex((c) => c.label === blockTitle);
        if (matchedIdx >= 0) {
          displayIndex = matchedIdx;
        } else {
          let counter = 0;
          for (const sibling of branchBlocks) {
            if (sibling.id === blockId) break;
            if (!isElseBlock(sibling)) counter++;
          }
          displayIndex = counter;
        }
      }
    } else {
      const branchBlockCount = branchBlocks.length;
      if (isElse) {
        displayIndex = Math.max(branchBlockCount - 1, 0);
      } else {
        let counter = 0;
        for (const sibling of branchBlocks) {
          if (sibling.id === blockId) break;
          if (!isElseBlock(sibling)) counter++;
        }
        displayIndex = counter;
      }
    }
  }

  const branchData = conditions[displayIndex];
  const label = branchData?.label || fallbackLabel;
  const condition = branchData?.condition ?? null;

  const conditionText = useMemo(() => {
    if (!condition) return '';
    try {
      return jsonLogicToExpression(condition);
    } catch {
      return JSON.stringify(condition).substring(0, 30) + '...';
    }
  }, [condition]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 12px',
        borderRadius: 6,
        background: '#fafbfc',
        border: '1px solid #e8eaed',
        minWidth: 120,
        maxWidth: 200,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', flexShrink: 0 }}>
          优先级 {displayIndex + 1}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(0,0,0,0.65)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 1,
          }}
        >
          {label}
        </span>
        {!isElse && !conditionText && (
          <Text style={{ fontSize: 11, color: '#ff4d4f', flexShrink: 0 }}>(未配置)</Text>
        )}
        {!isElse && conditionText && (
          <Tooltip title={conditionText} placement="top">
            <Text
              style={{
                fontSize: 11,
                color: 'rgba(0,0,0,0.45)',
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 80,
                cursor: 'default',
              }}
            >
              {conditionText.length > 20 ? conditionText.substring(0, 20) + '...' : conditionText}
            </Text>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * 节点渲染器 — 按 node.flowNodeType 分发。
 */
export function ApaasNodeRenderer({
  node,
}: {
  node: { id: string; flowNodeType?: string; getExtInfo?: () => Record<string, unknown> };
}) {
  const {
    startDrag,
    dragging,
    activated,
    onMouseEnter,
    onMouseLeave,
    isBlockIcon: _isBlockIcon,
    isBlockOrderIcon: _isBlockOrderIcon,
  } = useNodeRender();
  const ctx = useClientContext();

  const type = node?.flowNodeType ?? 'unknown';
  const extInfo = node?.getExtInfo?.() ?? {};

  if (
    type === 'inlineBlocks' ||
    type === 'block' ||
    type === 'root' ||
    type === 'mainInlineBlocks' ||
    type === 'catchInlineBlocks' ||
    type === 'trySlot' ||
    type === 'tryBlock' ||
    type === 'dynamicSplit' ||
    type === 'staticSplit' ||
    type === 'simpleSplit'
  ) {
    return null;
  }

  if (type === 'blockIcon') {
    const handleBlockIconClick = () => {
      const flowNode = ctx.document.getNode(node.id);
      if (flowNode) {
        const conditionNode = flowNode.originParent;
        if (conditionNode) {
          ctx.selection.selection = [conditionNode];
        }
      }
    };
    return (
      <div
        onClick={handleBlockIconClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            transform: 'rotate(45deg)',
            background: '#fff',
            border: '2px solid #1677ff',
            borderRadius: 4,
          }}
        />
      </div>
    );
  }

  if (type === 'blockOrderIcon') {
    const flowNode = ctx.document.getNode(node.id);
    let conditionNodeId: string | undefined;
    let blockId: string | undefined;
    let fallbackIsElse = false;
    let fallbackLabel = '';
    if (flowNode) {
      const blockNode = flowNode.parent;
      if (blockNode) {
        blockId = blockNode.id;
        const inlineBlocksNode = blockNode.parent;
        if (inlineBlocksNode) {
          conditionNodeId = inlineBlocksNode.parent?.id;
        }
        const blockExtInfo = blockNode.getExtInfo?.() ?? {};
        fallbackIsElse = isElseBlock(blockNode);
        const rawTitle = (blockExtInfo.title as string) || (extInfo.title as string) || '';
        fallbackLabel = rawTitle
          ? rawTitle
          : fallbackIsElse
            ? '默认分支'
            : blockNode.id?.includes('ifBlock')
              ? '条件成立'
              : '分支';
      }
    }

    return (
      <BlockOrderIconLabel
        blockId={blockId}
        conditionNodeId={conditionNodeId}
        fallbackLabel={fallbackLabel}
        fallbackIsElse={fallbackIsElse}
      />
    );
  }

  return (
    <BusinessNodeRenderer
      node={node}
      ctx={ctx}
      startDrag={startDrag}
      dragging={dragging}
      activated={activated}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

interface BusinessNodeRendererProps extends Pick<
  ReturnType<typeof useNodeRender>,
  'startDrag' | 'dragging' | 'activated' | 'onMouseEnter' | 'onMouseLeave'
> {
  node: { id: string; flowNodeType?: string; getExtInfo?: () => Record<string, unknown> };
  ctx: ReturnType<typeof useClientContext>;
}

function BusinessNodeRenderer({
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
