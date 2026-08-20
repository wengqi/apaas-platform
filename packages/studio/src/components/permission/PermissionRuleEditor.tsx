/**
 * 权限规则编辑器 — 为角色添加/编辑权限规则（含 ABAC 行级条件）。
 *
 * - 选择权限类型/动作/效果/目标对象
 * - RECORD 类型支持行级条件编辑（QueryBuilderPanel + JsonLogic）
 * - 行级条件中的 {"var":"__currentUser"} 会被后端替换为当前用户 ID
 * - 通过 rolesApi.setRules() 全量替换角色的权限规则
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Drawer, Select, Space, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  rolesApi,
  type CreatePermissionRuleRequest,
  type PermissionType,
  type PermissionAction,
  type PermissionEffect,
  type Role,
} from '../../api/permissions.js';
import { objectsApi, type Field } from '../../api/objects.js';
import QueryBuilderPanel from '../shared/QueryBuilderPanel.js';

const { Text } = Typography;

interface PermissionRuleEditorProps {
  open: boolean;
  role: Role;
  onClose: () => void;
}

const PERMISSION_TYPES: { value: PermissionType; label: string }[] = [
  { value: 'RECORD', label: '记录权限（行级）' },
  { value: 'PAGE', label: '页面权限' },
  { value: 'PROCESS', label: '流程权限' },
  { value: 'DATA_MODEL', label: '数据模型权限' },
  { value: 'CONNECTOR', label: '连接器权限' },
];

const PERMISSION_ACTIONS: { value: PermissionAction; label: string }[] = [
  { value: 'VIEW', label: '查看' },
  { value: 'CREATE', label: '创建' },
  { value: 'EDIT', label: '编辑' },
  { value: 'DELETE', label: '删除' },
  { value: 'EXECUTE', label: '执行' },
  { value: 'APPROVE', label: '审批' },
  { value: 'MANAGE', label: '管理' },
];

const PERMISSION_EFFECTS: { value: PermissionEffect; label: string }[] = [
  { value: 'ALLOW', label: '允许' },
  { value: 'DENY', label: '拒绝' },
];

export default function PermissionRuleEditor({ open, role, onClose }: PermissionRuleEditorProps) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<CreatePermissionRuleRequest[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>();

  // 加载已有规则
  const { data: existingRules } = useQuery({
    queryKey: ['role-rules', role.id],
    queryFn: () => rolesApi.getRules(role.id),
    enabled: open && !!role.id,
  });

  // 加载应用对象列表（用于 RECORD 权限的目标选择）
  const { data: objects } = useQuery({
    queryKey: ['app-objects', role.appId],
    queryFn: () => objectsApi.list(role.appId!),
    enabled: open && !!role.appId,
  });

  // 加载选中对象的字段（用于 QueryBuilderPanel）
  const { data: selectedObject } = useQuery({
    queryKey: ['object', selectedObjectId],
    queryFn: () => objectsApi.get(selectedObjectId!),
    enabled: !!selectedObjectId,
  });

  useEffect(() => {
    if (existingRules) {
      setRules(
        existingRules.map((r) => ({
          roleId: r.roleId,
          type: r.type,
          action: r.action,
          targetId: r.targetId,
          targetNodeId: r.targetNodeId,
          condition: r.condition,
          fieldScope: r.fieldScope,
          effect: r.effect,
          appId: r.appId,
        })),
      );
    }
  }, [existingRules]);

  const saveMutation = useMutation({
    mutationFn: (newRules: CreatePermissionRuleRequest[]) => rolesApi.setRules(role.id, newRules),
    onSuccess: () => {
      message.success('权限规则已保存');
      void queryClient.invalidateQueries({ queryKey: ['role-rules', role.id] });
      onClose();
    },
    onError: () => message.error('保存失败'),
  });

  const handleAddRule = () => {
    setRules((prev) => [
      ...prev,
      {
        roleId: role.id,
        type: 'RECORD',
        action: 'VIEW',
        targetId: objects?.[0]?.id ?? '*',
        condition: null,
        effect: 'ALLOW',
        appId: role.appId,
      },
    ]);
  };

  const handleUpdateRule = (index: number, patch: Partial<CreatePermissionRuleRequest>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    saveMutation.mutate(rules);
  };

  // 当选择 RECORD 类型的目标对象时，加载该对象字段
  const handleTargetChange = (index: number, targetId: string) => {
    handleUpdateRule(index, { targetId });
    setSelectedObjectId(targetId);
  };

  const objectFields: Field[] = useMemo(() => {
    return selectedObject?.fields ?? [];
  }, [selectedObject]);

  return (
    <Drawer
      title={`编辑权限规则 — ${role.name}`}
      open={open}
      onClose={onClose}
      width={680}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saveMutation.isPending} onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {rules.length === 0 && (
          <Text type="secondary" style={{ fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
            暂无权限规则，点击下方按钮添加
          </Text>
        )}

        {rules.map((rule, index) => {
          const isRecord = rule.type === 'RECORD';
          const isWildcard = rule.targetId === '*';
          return (
            <div
              key={index}
              style={{
                border: '1px solid #eef0f4',
                borderRadius: 8,
                padding: 12,
                background: '#fafbfc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Select
                  size="small"
                  value={rule.effect}
                  onChange={(v) => handleUpdateRule(index, { effect: v })}
                  style={{ width: 90 }}
                  options={PERMISSION_EFFECTS}
                />
                <Select
                  size="small"
                  value={rule.type}
                  onChange={(v) => handleUpdateRule(index, { type: v })}
                  style={{ width: 150 }}
                  options={PERMISSION_TYPES}
                />
                <Select
                  size="small"
                  value={rule.action}
                  onChange={(v) => handleUpdateRule(index, { action: v })}
                  style={{ width: 90 }}
                  options={PERMISSION_ACTIONS}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  目标:
                </Text>
                <Select
                  size="small"
                  value={rule.targetId}
                  onChange={(v) => handleTargetChange(index, v)}
                  style={{ flex: 1, minWidth: 150 }}
                  options={[
                    { value: '*', label: '所有对象 (*)' },
                    ...(objects?.map((o) => ({ value: o.id, label: o.label })) ?? []),
                  ]}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveRule(index)}
                />
              </div>

              {isRecord && !isWildcard && (
                <div style={{ borderTop: '1px dashed #eef0f4', paddingTop: 12 }}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
                  >
                    行级条件（限制可见记录范围）
                  </Text>
                  <QueryBuilderPanel
                    fields={objectFields}
                    value={rule.condition ?? null}
                    onChange={(cond) => handleUpdateRule(index, { condition: cond })}
                    placeholder="空条件 = 可见所有记录，添加规则后按条件过滤"
                  />
                </div>
              )}

              {isRecord && isWildcard && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  选择具体对象后可配置行级条件
                </Text>
              )}
            </div>
          );
        })}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddRule} block>
          添加权限规则
        </Button>
      </div>
    </Drawer>
  );
}
