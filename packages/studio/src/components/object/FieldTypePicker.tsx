import { TOKENS as T } from '@apaas/shared/design';
import { Col, Modal, Row, Tag, Typography } from 'antd';
import {
  FIELD_TYPE_GROUPS,
  FIELD_TYPE_META,
  getFieldTypeMeta,
  type FieldType,
} from '../../constants/fieldTypes.js';

const { Text } = Typography;

interface FieldTypePickerProps {
  open: boolean;
  onSelect: (type: FieldType) => void;
  onCancel: () => void;
}

/**
 * 字段类型选择器(Modal)。
 * 按语义分组网格展示 18 种字段类型,点击选择后回调。
 */
export default function FieldTypePicker({ open, onSelect, onCancel }: FieldTypePickerProps) {
  return (
    <Modal
      title="选择字段类型"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={640}
      destroyOnClose
    >
      <div style={{ maxHeight: '60vh', overflow: 'auto', paddingRight: 4 }}>
        {FIELD_TYPE_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 20 }}>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
              {group.title}
            </Text>
            <Row gutter={[12, 12]}>
              {group.types.map((type) => {
                const meta = FIELD_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <Col key={type} xs={8}>
                    <div
                      onClick={() => onSelect(type)}
                      style={{
                        border: `1px solid ${T.colorBorderSecondary}`,
                        borderRadius: 10,
                        padding: '14px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        height: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = T.colorPrimary;
                        e.currentTarget.style.background = T.colorPrimaryBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = T.colorBorderSecondary;
                        e.currentTarget.style.background = T.colorWhite;
                      }}
                    >
                      <Icon style={{ fontSize: 22, color: T.colorPrimary }} />
                      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 8 }}>
                        {meta.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'rgba(0,0,0,0.45)',
                          marginTop: 2,
                          lineHeight: 1.5,
                        }}
                      >
                        {meta.description}
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** 复用:渲染字段类型 Tag(供表格等使用)。 */
export function FieldTypeTag({ type }: { type: FieldType }) {
  const meta = getFieldTypeMeta(type);
  return (
    <Tag color={meta.color} style={{ margin: 0 }}>
      {meta.label}
    </Tag>
  );
}
