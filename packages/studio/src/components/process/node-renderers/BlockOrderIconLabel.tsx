/**
 * 分支标签组件（从 nodeRenderers.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useMemo } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { useListenEvents } from '@flowgram.ai/core';
import { Tooltip, Typography } from 'antd';
import { useProcessEditorStore } from '../../../stores/processEditor.js';
import { jsonLogicToExpression } from '../configs/jsonlogic-utils.js';
import { getBranchBlocks, isElseBlock } from '../conditionBranchUtils.js';

const { Text } = Typography;

/**
 * 分支标签组件 — 从 flowgram extInfo 和块树实时读取数据。
 */
export function BlockOrderIconLabel({
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
        background: T.colorFillQuaternary,
        border: `1px solid ${T.colorBorderSecondary}`,
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
          <Text style={{ fontSize: 11, color: T.colorError, flexShrink: 0 }}>(未配置)</Text>
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
