/**
 * 审核中心文案与渲染辅助（模块/来源/状态的标签映射）。
 */

import { Tag } from 'antd';
import type { ResourceVersionDto, ReviewModule } from '@apaas/shared';

export const MODULE_LABEL: Record<ReviewModule, string> = {
  OBJECT: '对象',
  DATASET: '数据集',
  PAGE: '页面',
  PROCESS: '流程',
};

export const SOURCE_LABEL: Record<ResourceVersionDto['source'], string> = {
  HUMAN: '人工',
  AI_MCP: 'AI',
};

export const STATUS_LABEL: Record<ResourceVersionDto['status'], string> = {
  PENDING: '待审',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  SUPERSEDED: '已取代',
};

export function ModuleTag({ module }: { module: ReviewModule }) {
  const color =
    module === 'OBJECT'
      ? 'geekblue'
      : module === 'DATASET'
        ? 'gold'
        : module === 'PAGE'
          ? 'cyan'
          : 'purple';
  return <Tag color={color}>{MODULE_LABEL[module] ?? module}</Tag>;
}

export function SourceTag({ source }: { source: ResourceVersionDto['source'] }) {
  return (
    <Tag color={source === 'AI_MCP' ? 'volcano' : 'default'}>{SOURCE_LABEL[source] ?? source}</Tag>
  );
}

export function StatusTag({ status }: { status: ResourceVersionDto['status'] }) {
  const color =
    status === 'PENDING'
      ? 'gold'
      : status === 'APPROVED'
        ? 'green'
        : status === 'REJECTED'
          ? 'red'
          : 'default';
  return <Tag color={color}>{STATUS_LABEL[status] ?? status}</Tag>;
}
