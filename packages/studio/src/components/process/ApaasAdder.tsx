/**
 * Adder — 节点间"+"按钮（对齐官方 Adder 组件）。
 *
 * 从 SimplifiedEditor.tsx 提取。
 */

import { useState } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { Popover, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { NODE_GROUPS, NODE_META, getNodeMeta } from '../../constants/process.js';
import type { FlowNodeJSON } from '../../../features/process/simplified/src/index.js';
import { syncConditionBlockExtInfo } from './nodeCreation.js';

const { Text } = Typography;

export function ApaasAdder(props: {
  from?: { id: string };
  to?: { id: string };
  hoverActivated?: boolean;
  [key: string]: unknown;
}) {
  const ctx = useClientContext();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const playground = ctx.playground as unknown as { config?: { readonly?: boolean } };
  if (playground?.config?.readonly) return null;

  const handleSelect = (type: string) => {
    if (!props.from?.id) return;
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

    const fromNode = ctx.document.getNode(props.from.id);
    if (fromNode) ctx.operation.addFromNode(fromNode, nodeJSON);
    syncConditionBlockExtInfo(ctx, type, nodeId);
    setPopoverOpen(false);
  };

  const content = (
    <div style={{ width: 320, maxHeight: 400, overflow: 'auto' }}>
      {NODE_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 8 }}>
          <Text
            strong
            style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}
          >
            {group.title}
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {group.types.map((type) => {
              const meta = NODE_META[type];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div
                  key={type}
                  onClick={() => handleSelect(type)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '6px 2px',
                    borderRadius: 6,
                    border: '1px solid #eef0f4',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                      color: '#fff',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon style={{ fontSize: 11 }} />
                  </div>
                  <Text style={{ fontSize: 10, textAlign: 'center' }}>{meta.label}</Text>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      content={content}
      trigger="click"
      placement="right"
      overlayStyle={{ padding: 0 }}
    >
      <div
        style={{
          width: props.hoverActivated ? 20 : 8,
          height: props.hoverActivated ? 20 : 8,
          borderRadius: '50%',
          background: props.hoverActivated ? '#fff' : '#d9d9d9',
          border: props.hoverActivated ? '2px solid #1677ff' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          margin: '4px auto',
          transition: 'all 0.15s ease',
        }}
      >
        {props.hoverActivated && <PlusOutlined style={{ fontSize: 10, color: '#1677ff' }} />}
      </div>
    </Popover>
  );
}
