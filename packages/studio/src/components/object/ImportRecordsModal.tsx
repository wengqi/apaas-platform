/**
 * 记录导入弹窗 — CSV 文件上传 + 导入结果展示。
 *
 * 交互流程：
 * 1. 下载模板（可选）
 * 2. 上传 CSV 文件
 * 3. 确认导入
 * 4. 显示结果（成功数 / 失败数 / 错误明细）
 */

import { useState } from 'react';
import { Alert, Button, Modal, Space, Table, Typography, Upload, message } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { objectsApi } from '../../api/objects.js';

const { Text } = Typography;
const { Dragger } = Upload;

interface ImportRecordsModalProps {
  open: boolean;
  objectId: string;
  onClose: () => void;
  onImported: () => void;
}

interface ImportResultData {
  total: number;
  success: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

export default function ImportRecordsModal({
  open,
  objectId,
  onClose,
  onImported,
}: ImportRecordsModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResultData | null>(null);

  const importMutation = useMutation({
    mutationFn: (file: File) => objectsApi.records.importCsv(objectId, file),
    onSuccess: (data) => {
      setResult(data);
      if (data.errors.length === 0) {
        message.success(`成功导入 ${data.success} 条记录`);
      } else {
        message.warning(`导入完成：成功 ${data.success} 条，失败 ${data.errors.length} 条`);
      }
      onImported();
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : '导入失败');
    },
  });

  const downloadTemplate = async () => {
    try {
      const blob = await objectsApi.records.getImportTemplate(objectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${objectId}_template.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('下载模板失败');
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    onClose();
  };

  const uploadProps = {
    accept: '.csv',
    maxCount: 1,
    beforeUpload: (file: File) => {
      setSelectedFile(file);
      return false; // 阻止自动上传
    },
    onRemove: () => {
      setSelectedFile(null);
      setResult(null);
    },
    file: selectedFile
      ? {
          uid: selectedFile.name,
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
        }
      : undefined,
  };

  return (
    <Modal
      title="导入记录"
      open={open}
      onCancel={handleClose}
      width={640}
      footer={
        result ? (
          <Button type="primary" onClick={handleClose}>
            完成
          </Button>
        ) : (
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              disabled={!selectedFile}
              loading={importMutation.isPending}
              onClick={() => selectedFile && importMutation.mutate(selectedFile)}
            >
              确认导入
            </Button>
          </Space>
        )
      }
    >
      {result ? (
        <div>
          <Alert
            type={result.errors.length === 0 ? 'success' : 'warning'}
            message={`导入完成：成功 ${result.success} / ${result.total} 条`}
            style={{ marginBottom: 16 }}
          />
          {result.errors.length > 0 && (
            <Table
              size="small"
              rowKey="row"
              dataSource={result.errors}
              columns={[
                { title: '行号', dataIndex: 'row', key: 'row', width: 80 },
                { title: '字段', dataIndex: 'field', key: 'field', width: 120 },
                { title: '错误', dataIndex: 'message', key: 'message' },
              ]}
              pagination={{ pageSize: 10 }}
            />
          )}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              CSV 文件第一行为字段 API 名称（列头），后续每行一条记录。 可先下载模板查看格式。
            </Text>
          </div>
          <Button
            icon={<DownloadOutlined />}
            onClick={downloadTemplate}
            style={{ marginBottom: 16 }}
          >
            下载导入模板
          </Button>
          <Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
            <p className="ant-upload-hint">支持单个 CSV 文件，最大 5000 行</p>
          </Dragger>
        </div>
      )}
    </Modal>
  );
}
