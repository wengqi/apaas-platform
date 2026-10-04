/**
 * 权限规则编辑器 — 为角色添加/编辑权限规则（含 ABAC 行级条件）。
 *
 * - 选择权限类型/动作/效果/目标对象
 * - RECORD 类型支持行级条件编辑（QueryBuilderPanel + JsonLogic）
 * - 行级条件中的 {"var":"__currentUser"} 会被后端替换为当前用户 ID
 * - 通过 rolesApi.setRules() 全量替换角色的权限规则
 */

import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Drawer, Select, Space, Typography, message } from 'antd';
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
import { pagesApi } from '../../api/pages.js';
import { processesApi } from '../../api/processes.js';
import { connectorsApi } from '../../api/connectors.js';
import QueryBuilderPanel from '../shared/QueryBuilderPanel.js';
import { qk } from '@apaas/shared/stores';

const { Text } = Typography;

interface PermissionRuleEditorProps {
  open: boolean;
  role: Role;
  /** 应用上下文兜底：内置角色为租户级（role.appId 为空），规则编辑器仍需
   *  加载当前应用的对象/页面等资源作为目标选项（交互评审 2026-10-04 修复）。 */
  appId?: string;
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

export default function PermissionRuleEditor({
  open,
  role,
  appId,
  onClose,
}: PermissionRuleEditorProps) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<CreatePermissionRuleRequest[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>();
  /** 资源查询用 appId：角色自身绑定优先，租户级角色回退页面上下文。 */
  const contextAppId = role.appId ?? appId;

  // 加载已有规则
  const { data: existingRules } = useQuery({
    queryKey: ['role-rules', role.id],
    queryFn: () => rolesApi.getRules(role.id),
    enabled: open && !!role.id,
  });

  // 加载应用对象列表（用于 RECORD 权限的目标选择）
  const { data: objects } = useQuery({
    queryKey: qk.appObjects(contextAppId!),
    queryFn: () => objectsApi.list(contextAppId!),
    enabled: open && !!contextAppId,
  });

  // 加载选中对象的字段（用于 QueryBuilderPanel）
  const { data: selectedObject } = useQuery({
    queryKey: qk.object(selectedObjectId!),
    queryFn: () => objectsApi.get(selectedObjectId!),
    enabled: !!selectedObjectId,
  });

  // 加载应用页面列表（用于 PAGE 权限的目标选择）
  const { data: pages } = useQuery({
    queryKey: qk.appPages(contextAppId!),
    queryFn: () => pagesApi.list(contextAppId!),
    enabled: open && !!contextAppId,
  });

  // 加载应用流程列表（用于 PROCESS 权限的目标选择）
  const { data: processes } = useQuery({
    queryKey: ['app-processes', contextAppId],
    queryFn: () => processesApi.list(contextAppId!),
    enabled: open && !!contextAppId,
  });

  // 加载应用连接器列表（用于 CONNECTOR 权限的目标选择）
  const { data: connectors } = useQuery({
    queryKey: ['connectors', contextAppId],
    queryFn: () => connectorsApi.list(contextAppId!),
    enabled: open && !!contextAppId,
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
    onError: (err) => message.error(apiErrorMessage(err, '保存失败')),
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
        appId: contextAppId,
      },
    ]);
  };

  const handleUpdateRule = (index: number, patch: Partial<CreatePermissionRuleRequest>) => {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const updated = { ...r, ...patch };
        // 切换权限类型时，清除不兼容的条件和列级权限
        if (patch.type && patch.type !== r.type) {
          if (patch.type !== 'RECORD') {
            updated.condition = null;
          }
          if (patch.type !== 'RECORD' && patch.type !== 'DATA_MODEL') {
            updated.fieldScope = null;
          }
        }
        // 切换到通配符目标时，清除条件和列级权限
        if (patch.targetId === '*') {
          updated.fieldScope = null;
        }
        return updated;
      }),
    );
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

  /** 根据权限类型构建目标选项列表。 */
  const getTargetOptions = (ruleType: PermissionType) => {
    const wildcard = [{ value: '*', label: '所有 (*)' }];
    switch (ruleType) {
      case 'PAGE':
        return [...wildcard, ...(pages?.map((p) => ({ value: p.id, label: p.name })) ?? [])];
      case 'PROCESS':
        return [...wildcard, ...(processes?.map((p) => ({ value: p.id, label: p.name })) ?? [])];
      case 'CONNECTOR':
        return [...wildcard, ...(connectors?.map((c) => ({ value: c.id, label: c.name })) ?? [])];
      case 'RECORD':
      case 'DATA_MODEL':
      default:
        return [...wildcard, ...(objects?.map((o) => ({ value: o.id, label: o.label })) ?? [])];
    }
  };

  /** 判断规则是否支持列级权限（fieldScope）。 */
  const supportsFieldScope = (rule: CreatePermissionRuleRequest) =>
    (rule.type === 'RECORD' || rule.type === 'DATA_MODEL') && rule.targetId !== '*';

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
                  options={getTargetOptions(rule.type)}
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

              {supportsFieldScope(rule) && (
                <div style={{ borderTop: '1px dashed #eef0f4', paddingTop: 12 }}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
                  >
                    列级权限（
                    {rule.effect === 'ALLOW' ? '勾选可见字段，未勾选隐藏' : '勾选隐藏字段'}）
                  </Text>
                  {objectFields.length > 0 ? (
                    <Checkbox.Group
                      value={rule.fieldScope ?? []}
                      onChange={(checkedValues) =>
                        handleUpdateRule(index, {
                          fieldScope: checkedValues as string[],
                        })
                      }
                      style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}
                    >
                      {objectFields.map((f) => (
                        <Checkbox key={f.id} value={f.id}>
                          {f.label || f.apiName}
                        </Checkbox>
                      ))}
                    </Checkbox.Group>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      该对象暂无字段
                    </Text>
                  )}
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
