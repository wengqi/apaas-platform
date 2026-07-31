/**
 * 组织架构管理 — 左组织树 + 右节点详情(成员+角色授权)。
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Empty, Input, Modal, Space, Tag, Tree, Typography, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TreeDataNode } from 'antd';
import { orgsApi, type OrgNode, type CreateOrgNodeRequest } from '../../api/permissions.js';

const { Text, Title } = Typography;

export default function OrgManager() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);

  const { data: orgTree, isLoading } = useQuery({
    queryKey: ['permission-orgs'],
    queryFn: () => orgsApi.getTree(),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateOrgNodeRequest) => orgsApi.create(data),
    onSuccess: () => {
      message.success('创建成功');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['permission-orgs'] });
    },
    onError: () => message.error('创建失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orgsApi.delete(id),
    onSuccess: () => {
      message.success('已删除');
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['permission-orgs'] });
    },
    onError: () => message.error('删除失败'),
  });

  // 将 OrgNode[] 转为 TreeDataNode[]
  const treeData: TreeDataNode[] = (orgTree ?? []).map((node) => convertToTreeNode(node, selectedId));

  const selectedNode = findNode(orgTree ?? [], selectedId);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 16, gap: 16 }}>
      {/* 左栏:组织树 */}
      <div style={{ width: 320, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #eef0f4', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eef0f4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={5} style={{ margin: 0 }}>组织架构</Title>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setCreateParentId(undefined); setCreateOpen(true); }}>
            新建
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
          {isLoading ? (
            <div style={{ padding: 16 }}><Text type="secondary">加载中...</Text></div>
          ) : !orgTree || orgTree.length === 0 ? (
            <Empty style={{ marginTop: 40 }} description="暂无组织节点" />
          ) : (
            <Tree
              treeData={treeData}
              defaultExpandAll
              onSelect={(keys) => setSelectedId(keys[0] as string ?? null)}
              selectedKeys={selectedId ? [selectedId] : []}
            />
          )}
        </div>
      </div>

      {/* 右栏:节点详情 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedNode ? (
          <OrgNodeDetail
            node={selectedNode}
            onDelete={() => deleteMutation.mutate(selectedNode.id)}
            onAddChild={() => { setCreateParentId(selectedNode.id); setCreateOpen(true); }}
          />
        ) : (
          <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="选择一个组织节点" />
          </Card>
        )}
      </div>

      {/* 创建节点弹窗 */}
      <CreateOrgModal
        open={createOpen}
        parentId={createParentId}
        onCancel={() => setCreateOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 节点详情
// ---------------------------------------------------------------------------

function OrgNodeDetail({
  node, onDelete, onAddChild,
}: {
  node: OrgNode;
  onDelete: () => void;
  onAddChild: () => void;
}) {
  const { data: members } = useQuery({
    queryKey: ['org-members', node.id],
    queryFn: () => orgsApi.getMembers(node.id),
    enabled: !!node.id,
  });

  return (
    <Card
      style={{ height: '100%' }}
      title={
        <Space>
          <span>{node.name}</span>
          <Tag>{node.nodeType}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{node.code}</Text>
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<PlusOutlined />} onClick={onAddChild}>添加子节点</Button>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={onDelete}>删除</Button>
        </Space>
      }
    >
      <Title level={5}>成员 ({members?.length ?? 0})</Title>
      {members && members.length > 0 ? (
        <Space wrap>
          {members.map((m) => (
            <Tag key={m.id} style={{ padding: '4px 12px' }}>
              {m.name} ({m.email})
            </Tag>
          ))}
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 创建节点弹窗
// ---------------------------------------------------------------------------

function CreateOrgModal({
  open, parentId, onCancel, onSubmit, loading,
}: {
  open: boolean;
  parentId?: string;
  onCancel: () => void;
  onSubmit: (data: CreateOrgNodeRequest) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = () => {
    if (!name || !code) return;
    onSubmit({ name, code, parentId });
    setName('');
    setCode('');
  };

  return (
    <Modal
      title={parentId ? '新建子节点' : '新建组织节点'}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text>名称</Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:研发部" />
        </div>
        <div>
          <Text>编码</Text>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如:RD" />
        </div>
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function convertToTreeNode(node: OrgNode, selectedId: string | null): TreeDataNode {
  return {
    key: node.id,
    title: (
      <Space size={4}>
        <span>{node.name}</span>
        <Text type="secondary" style={{ fontSize: 11 }}>{node.code}</Text>
      </Space>
    ),
    children: node.children?.map((c) => convertToTreeNode(c, selectedId)),
  };
}

function findNode(nodes: OrgNode[], id: string | null): OrgNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
