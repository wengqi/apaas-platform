/**
 * 环境变量管理（R1.4 G2/G3）——定义（构建态一套）+ 按环境设值。
 * 敏感值写后不可读（仅"已配置"状态 + 重置入口）。
 */

import { useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EnvVarDefDto } from '@apaas/shared';
import { qk } from '@apaas/shared/stores';
import { environmentsApi } from '../../api/environments.js';

interface EnvVarManagerProps {
  appId: string;
  env: string;
}

interface RowDef extends EnvVarDefDto {
  isSet: boolean;
  plainValue: string | null;
  updatedBy: string;
  updatedAt: string;
}

export default function EnvVarManager({ appId, env }: EnvVarManagerProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: qk.envVars(appId, env),
    queryFn: () => environmentsApi.envVars(appId, env),
  });

  const invalidate = () => {
    for (const key of ['dev', 'prod']) {
      void queryClient.invalidateQueries({ queryKey: qk.envVars(appId, key) });
    }
    void queryClient.invalidateQueries({ queryKey: qk.environments(appId) });
  };

  const createMutation = useMutation({
    mutationFn: (values: {
      key: string;
      description?: string;
      required: boolean;
      sensitive: boolean;
    }) => environmentsApi.createDef(appId, values),
    onSuccess: () => {
      message.success('定义已创建');
      setCreateOpen(false);
      form.resetFields();
      invalidate();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (defId: string) => environmentsApi.deleteDef(appId, defId),
    onSuccess: () => {
      message.success('已删除');
      invalidate();
    },
  });

  const setMutation = useMutation({
    mutationFn: (params: { defId: string; value: string }) =>
      environmentsApi.setValue(appId, params.defId, env, params.value),
    onSuccess: () => {
      message.success('已保存');
      invalidate();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const rows: RowDef[] = (data?.defs ?? []).map((def) => {
    const value = data?.values.find((v) => v.defId === def.id);
    return {
      ...def,
      isSet: !!value?.isSet,
      plainValue: value?.value ?? null,
      updatedBy: value?.updatedBy ?? '',
      updatedAt: value?.updatedAt ?? '',
    };
  });

  const columns: ColumnsType<RowDef> = [
    {
      title: 'Key',
      dataIndex: 'key',
      render: (v: string) => (
        <span>
          <Tag>
            ${'{'}env.{v}
            {'}'}
          </Tag>
        </span>
      ),
    },
    { title: '描述', dataIndex: 'description' },
    {
      title: '标记',
      key: 'flags',
      width: 150,
      render: (_, r) => (
        <>
          {r.required && <Tag color="red">必填</Tag>}
          {r.sensitive && <Tag color="orange">敏感</Tag>}
        </>
      ),
    },
    {
      title: `当前值（${env}）`,
      key: 'value',
      render: (_, r) => {
        if (!r.isSet) return <Tag>未设置</Tag>;
        if (r.sensitive) return <Tag color="green">已配置（不可读）</Tag>;
        return <code style={{ fontSize: 12 }}>{r.plainValue}</code>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_, r) => (
        <SetValueButton
          row={r}
          env={env}
          onSave={(v) => setMutation.mutate({ defId: r.id, value: v })}
        />
      ),
    },
    {
      title: '',
      key: 'del',
      width: 60,
      render: (_, r) => (
        <Popconfirm title="删除该定义及各环境的值？" onConfirm={() => deleteMutation.mutate(r.id)}>
          <Button type="link" size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#999', fontSize: 12 }}>
          环境差异只收敛到「值」：schema 一套，dev/prod 各自设值（G2 三分类）；必填 Key
          未设值时发布会被拦截（G4）。
        </span>
        <Button icon={<PlusOutlined />} size="small" onClick={() => setCreateOpen(true)}>
          新建定义
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        size="small"
        pagination={false}
      />

      <Modal
        title="新建环境变量定义"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => createMutation.mutate(v as never)}
          initialValues={{ required: false, sensitive: false }}
        >
          <Form.Item
            name="key"
            label="Key（${env.KEY} 引用名）"
            rules={[
              { required: true, message: '请输入 Key' },
              { pattern: /^[A-Z][A-Z0-9_]*$/, message: '大写字母/数字/下划线，字母开头' },
            ]}
          >
            <Input placeholder="API_BASE_URL" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="用途说明（G2：值才进环境变量，配置对象不进）" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="required" label="发布必填（G4 硬闸）" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="sensitive" label="敏感值（G3 加密/不可读）" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}

/** 设值按钮 + 弹窗（敏感值输入即重置） */
function SetValueButton({
  row,
  env,
  onSave,
}: {
  row: RowDef;
  env: string;
  onSave: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <>
      <Button
        type="link"
        size="small"
        onClick={() => {
          setValue(row.sensitive ? '' : (row.plainValue ?? ''));
          setOpen(true);
        }}
      >
        {row.isSet ? '修改' : '设值'}
      </Button>
      <Modal
        title={`设值：${row.key}（${env}）`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => {
          onSave(value);
          setOpen(false);
        }}
        okText="保存"
      >
        {row.sensitive && (
          <p style={{ color: '#999', fontSize: 12 }}>
            敏感值加密存储，保存后不可读取，仅可重新设置（G3）。
          </p>
        )}
        <Input.Password
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={row.sensitive ? '输入新值' : '变量值'}
        />
      </Modal>
    </>
  );
}
