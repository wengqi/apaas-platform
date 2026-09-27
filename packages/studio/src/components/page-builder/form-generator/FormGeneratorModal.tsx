/**
 * 表单生成器弹窗 — 对齐飞书 aPaaS「表单生成器」。
 *
 * 来源选对象 → 字段表格（勾选/标题/输入组件/必填/拖拽排序）→ 一键生成：
 * 写回表单子节点（字段 + 提交按钮）、接线 onSubmit=create_record、
 * 幂等写入 vm.record 变量（对应飞书「自动生成 N 个组件以及 1 个数据请求」）。
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Modal, Select, Space, Typography, message } from 'antd';
import { InfoCircleFilled } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { useParams } from 'react-router-dom';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import { objectsApi } from '../../../api/objects.js';
import type { Field } from '../../../api/objects.js';
import FieldRowsTable from './FieldRowsTable.js';
import {
  buildFormGeneration,
  buildSubmitButtonNode,
  initRowsFromFields,
  type FormGenRow,
} from './generate.js';

const { Text } = Typography;

interface FormGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  /** 要写回的表单容器节点 ID */
  formNodeId: string;
  /** 已绑定对象（打开时默认选中） */
  initialObjectId?: string;
}

/** 表单生成器弹窗主组件。 */
export default function FormGeneratorModal({
  open,
  onClose,
  formNodeId,
  initialObjectId,
}: FormGeneratorModalProps) {
  const { appId } = useParams<{ appId: string }>();
  const [objectId, setObjectId] = useState<string | undefined>(initialObjectId);
  const [rows, setRows] = useState<FormGenRow[]>([]);

  useEffect(() => {
    if (open) setObjectId(initialObjectId);
  }, [open, initialObjectId]);

  // 对象列表
  const { data: objects } = useQuery({
    queryKey: qk.appObjects(appId!),
    queryFn: () => objectsApi.list(appId!),
    enabled: !!appId && open,
  });

  // 选中对象的字段
  const { data: objectDetail, isFetching: fieldsLoading } = useQuery({
    queryKey: qk.object(objectId!),
    queryFn: () => objectsApi.get(objectId!),
    enabled: !!objectId && open,
  });

  const fields: Field[] = useMemo(() => objectDetail?.fields ?? [], [objectDetail]);

  useEffect(() => {
    setRows(initRowsFromFields(fields));
  }, [fields]);

  const selectedCount = rows.filter((r) => r.selected).length;

  const handleGenerate = () => {
    if (!objectId) {
      message.warning('请先选择对象');
      return;
    }
    if (selectedCount === 0) {
      message.warning('请至少勾选一个字段');
      return;
    }
    const store = usePageBuilderStore.getState();
    const { fieldNodes, onSubmitAction } = buildFormGeneration(fields, rows, objectId);
    store.replaceChildren(formNodeId, [...fieldNodes, buildSubmitButtonNode()]);
    store.updateComponentProps(formNodeId, {
      objectId,
      layout: 'vertical',
      onSubmit: onSubmitAction,
    });
    store.ensureRecordVariable(objectId);
    message.success(`已生成 ${fieldNodes.length} 个字段组件，提交动作已接线`);
    onClose();
  };

  return (
    <Modal
      title="表单生成器"
      open={open}
      onCancel={onClose}
      width={720}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={6}>
            <InfoCircleFilled style={{ color: '#1456f0', fontSize: 13 }} />
            <Text type="secondary" style={{ fontSize: 13 }}>
              将自动生成：{selectedCount} 个组件、1 个提交动作以及 1 个记录变量
            </Text>
          </Space>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleGenerate}>
              生成表单
            </Button>
          </Space>
        </div>
      }
    >
      {/* 来源 */}
      <Space size={12} style={{ marginBottom: 16, width: '100%' }}>
        <Text style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', flexShrink: 0 }}>来源</Text>
        <Select
          placeholder="选择对象"
          value={objectId}
          onChange={setObjectId}
          style={{ width: 220 }}
          loading={fieldsLoading}
          options={(objects ?? []).map((o) => ({ value: o.id, label: o.label ?? o.name }))}
        />
      </Space>

      {/* 字段表格 */}
      {objectId && fields.length > 0 ? (
        <FieldRowsTable fields={fields} rows={rows} onChange={setRows} />
      ) : (
        <div style={{ padding: '32px 0' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={objectId ? '该对象暂无字段' : '请选择对象后配置字段'}
          />
        </div>
      )}
    </Modal>
  );
}
