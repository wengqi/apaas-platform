/**
 * 从 pages/ProcessEditor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 编辑器工具栏：返回/流程名/触发器标签/撤销重做/预览/保存/发布。
 */

import { Button, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  EyeOutlined,
  SaveOutlined,
  SendOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import type { ProcessDef } from '../../api/processes.js';
import { getProcessStatusMeta, getTriggerMeta } from '../../constants/process.js';

const { Title } = Typography;

interface ProcessEditorToolbarProps {
  processDef: ProcessDef;
  readonly: boolean;
  dirty: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  saving: boolean;
  publishing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** 评审整改：触发器配置入口（此前创建后无法配置触发器） */
  onConfigureTrigger: () => void;
  /** 交互评审（2026-10-04）：预览按钮此前无 onClick——打开结构预览弹窗 */
  onPreview: () => void;
}

export default function ProcessEditorToolbar({
  processDef,
  readonly,
  dirty,
  onBack,
  onSave,
  onPublish,
  saving,
  publishing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onConfigureTrigger,
  onPreview,
}: ProcessEditorToolbarProps) {
  const statusMeta = getProcessStatusMeta(processDef.status);
  const triggerMeta = getTriggerMeta(processDef.triggerType as string | undefined);
  const TriggerIcon = triggerMeta.icon;

  return (
    <div
      style={{
        height: 48,
        padding: '0 16px',
        background: '#fff',
        borderBottom: '1px solid #eef0f4',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* 左侧:返回 + 流程名 */}
      <Space size={12}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${triggerMeta.color}, ${triggerMeta.color}dd)`,
            color: '#fff',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TriggerIcon style={{ fontSize: 16 }} />
        </div>
        <Space size={6} align="center">
          <Title level={5} style={{ margin: 0 }}>
            {processDef.name}
          </Title>
          <Tag color={statusMeta.tagColor}>{statusMeta.label}</Tag>
          <Tooltip title="配置触发器">
            <Tag color="blue" style={{ cursor: 'pointer', margin: 0 }} onClick={onConfigureTrigger}>
              {triggerMeta.label}
            </Tag>
          </Tooltip>
          {dirty && <Tag color="orange">未保存</Tag>}
        </Space>
      </Space>

      {/* 右侧:撤销/重做 + 预览 + 保存 + 发布 */}
      <Space size={8}>
        {!readonly && (
          <>
            <Button
              type="text"
              icon={<UndoOutlined />}
              size="small"
              disabled={!canUndo}
              onClick={onUndo}
            />
            <Button
              type="text"
              icon={<RedoOutlined />}
              size="small"
              disabled={!canRedo}
              onClick={onRedo}
            />
          </>
        )}
        <Button icon={<EyeOutlined />} size="small" onClick={onPreview}>
          预览
        </Button>
        {!readonly && (
          <Button icon={<SaveOutlined />} size="small" loading={saving} onClick={onSave}>
            保存
          </Button>
        )}
        {/* 已发布流程不可直接改，但保留迭代入口（#13：后端更新即回退草稿，
            运行环境仍用已发布版本直至下次应用发布） */}
        {readonly && (
          <Popconfirm
            title="转为草稿编辑"
            description="流程将回到草稿态继续迭代；运行环境仍使用已发布版本，直至下次发布"
            onConfirm={onSave}
          >
            <Button type="primary" ghost icon={<EditOutlined />} size="small" loading={saving}>
              转为草稿编辑
            </Button>
          </Popconfirm>
        )}
        {!readonly && (
          <Popconfirm
            title="发布流程"
            description="发布后将生成新版本,已发布版本不可编辑"
            okButtonProps={{ danger: false }}
            onConfirm={onPublish}
          >
            <Button type="primary" icon={<SendOutlined />} size="small" loading={publishing}>
              发布
            </Button>
          </Popconfirm>
        )}
      </Space>
    </div>
  );
}
