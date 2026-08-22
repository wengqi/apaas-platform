/**
 * 节点创建 — 拖放创建节点 + 条件分支 extInfo 同步。
 *
 * 从 SimplifiedEditor.tsx 提取。
 */

import { useCallback } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { getNodeMeta } from '../../constants/process.js';
import type { FlowNodeJSON } from '../../../features/process/simplified/src/index.js';

/** 拖放传输的 MIME 类型。 */
export const NODE_TYPE_MIME = 'application/x-apaas-node-type';

/**
 * 条件分支节点创建后，显式将 block data 同步到 extInfo。
 * fromNodeJSON 不会将 block data 写入 extInfo（block 有 formData 但无 formMeta），
 * 因此在节点创建后通过 RAF + setTimeout 显式写入。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function syncConditionBlockExtInfo(ctx: any, type: string, nodeId: string): void {
  if (type !== 'condition') return;
  const ifBlockId = `ifBlock_${nodeId}`;
  const elseBlockId = `elseBlock_${nodeId}`;
  const sync = () => {
    const ifBlock = ctx.document.getNode(ifBlockId);
    const elseBlock = ctx.document.getNode(elseBlockId);
    if (ifBlock) {
      ifBlock.updateExtInfo({ title: '条件成立', isElse: false, condition: null }, true);
      const ifIcon = ifBlock.blocks?.[0];
      if (ifIcon) {
        ifIcon.updateExtInfo({ title: '条件成立', isElse: false, condition: null }, true);
      }
    }
    if (elseBlock) {
      elseBlock.updateExtInfo({ title: '默认分支', isElse: true, condition: null }, true);
      const elseIcon = elseBlock.blocks?.[0];
      if (elseIcon) {
        elseIcon.updateExtInfo({ title: '默认分支', isElse: true, condition: null }, true);
      }
    }
    const condNode = ctx.document.getNode(nodeId);
    if (condNode) {
      condNode.updateExtInfo(
        {
          conditions: [
            { label: '条件成立', condition: null },
            { label: '默认分支', condition: null },
          ],
        },
        true,
      );
    }
  };
  requestAnimationFrame(sync);
  setTimeout(sync, 50);
}

/** 创建节点的 hook（用于拖放创建）。 */
export function useCreateNode() {
  const ctx = useClientContext();
  return useCallback(
    (type: string, fromId?: string) => {
      const meta = getNodeMeta(type);
      const nodeId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nodeJSON: FlowNodeJSON = { id: nodeId, type, data: { title: meta.label } };

      if (type === 'condition') {
        nodeJSON.blocks = [
          { id: `ifBlock_${nodeId}`, type: 'block', data: { title: '条件成立', isElse: false } },
          { id: `elseBlock_${nodeId}`, type: 'block', data: { title: '默认分支', isElse: true } },
        ];
        nodeJSON.data = {
          title: meta.label,
          conditions: [
            { label: '条件成立', condition: null },
            { label: '默认分支', condition: null },
          ],
        };
      }

      if (fromId) {
        const fromNode = ctx.document.getNode(fromId);
        if (fromNode) {
          ctx.operation.addFromNode(fromNode, nodeJSON);
          syncConditionBlockExtInfo(ctx, type, nodeId);
          return;
        }
      }
      const allNodes = ctx.document.getAllNodes();
      let anchorNode = undefined;
      for (let i = allNodes.length - 1; i >= 0; i--) {
        const n = allNodes[i];
        if (n && n.flowNodeType !== 'end') {
          anchorNode = n;
          break;
        }
      }
      if (anchorNode) ctx.operation.addFromNode(anchorNode, nodeJSON);
      else ctx.operation.addNode(nodeJSON);
      syncConditionBlockExtInfo(ctx, type, nodeId);
    },
    [ctx],
  );
}

/** 根据拖放位置找到最近的插入位置节点。 */
export function useFindDropAnchor() {
  const ctx = useClientContext();
  return useCallback(
    (e: React.DragEvent): string | undefined => {
      const allNodes = ctx.document.getAllNodes();
      const businessNodes = allNodes.filter((n) => {
        const type = n.flowNodeType as string;
        return (
          type &&
          !['block', 'inlineBlocks', 'blockIcon', 'blockOrderIcon', 'dynamicSplit', 'end'].includes(
            type,
          )
        );
      });
      if (businessNodes.length === 0) return undefined;

      const playground = ctx.playground as unknown as {
        getRelativePos?: (event: { clientX: number; clientY: number }) => { x: number; y: number };
      };

      if (!playground?.getRelativePos) {
        return businessNodes[businessNodes.length - 1]?.id;
      }

      const pos = playground.getRelativePos({ clientX: e.clientX, clientY: e.clientY });
      const canvasY = pos.y;

      let closest: (typeof businessNodes)[0] | undefined;
      let minDist = Infinity;
      for (const n of businessNodes) {
        const bounds = n.bounds;
        if (!bounds) continue;
        const centerY = bounds.center.y;
        const dist = Math.abs(centerY - canvasY);
        if (dist < minDist) {
          minDist = dist;
          closest = n;
        }
      }
      return closest?.id ?? businessNodes[businessNodes.length - 1]?.id;
    },
    [ctx],
  );
}
