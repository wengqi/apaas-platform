/**
 * 审计分类 Tag — 按动作归类显示分类彩色小 Tag（平台级/应用级审计页共用）。
 *
 * 未登记动作经 categoryOfAuditAction 归为 OTHER，显示「其他」灰色。
 */

import { Tag } from 'antd';
import { auditCategoryDisplay } from '../../constants/audit-category.js';

interface AuditCategoryTagProps {
  action: string;
}

/** 审计动作 → 分类 Tag。 */
export default function AuditCategoryTag({ action }: AuditCategoryTagProps) {
  const { label, color } = auditCategoryDisplay(action);
  return <Tag color={color}>{label}</Tag>;
}
