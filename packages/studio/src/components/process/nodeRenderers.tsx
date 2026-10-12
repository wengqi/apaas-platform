/**
 * 节点渲染器 — 通过 renderDefaultNode 注册到 flowgram。
 *
 * 从 SimplifiedEditor.tsx 提取，包含：
 * - BlockOrderIconLabel: 分支标签组件（见 ./node-renderers/BlockOrderIconLabel.tsx）
 * - ApaasNodeRenderer: 节点渲染入口（按 type 分发）
 * - BusinessNodeRenderer: 业务节点卡片（见 ./node-renderers/BusinessNodeRenderer.tsx）
 *
 * 子模块拆分见 packages/studio/src/components/process/node-renderers/
 * （AGENTS.md 单文件 400 行规范）；导出名保持原路径 './nodeRenderers.js' 兼容。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useNodeRender, useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { isElseBlock } from './conditionBranchUtils.js';
import { BlockOrderIconLabel } from './node-renderers/BlockOrderIconLabel.js';
import { BusinessNodeRenderer } from './node-renderers/BusinessNodeRenderer.js';

export { BlockOrderIconLabel } from './node-renderers/BlockOrderIconLabel.js';
export {
  BusinessNodeRenderer,
  type BusinessNodeRendererProps,
} from './node-renderers/BusinessNodeRenderer.js';

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
            background: T.colorWhite,
            border: `2px solid ${T.colorPrimary}`,
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
