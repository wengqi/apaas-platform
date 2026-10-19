import { TOKENS as T } from '@apaas/shared/design';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Checkbox, Divider, Drawer, Empty, Space, Tag, Typography, message } from 'antd';
import {
  PlusOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import {
  objectsApi,
  type Field,
  type ViewConfig,
  type ViewFieldConfig,
  type ViewInfo,
  type ViewSortConfig,
} from '../../api/objects.js';
import { getFieldTypeMeta } from '../../constants/fieldTypes.js';
import QueryBuilderPanel from '../shared/QueryBuilderPanel.js';
import { SectionHeader } from './view-configurator/SectionHeader.js';
import { SortableFieldRow } from './view-configurator/SortableFieldRow.js';
import { SortRow } from './view-configurator/SortRow.js';
import { showError } from './view-configurator/helpers.js';

const { Text } = Typography;

interface ViewConfiguratorProps {
  open: boolean;
  view: ViewInfo | undefined;
  fields: Field[];
  onClose: () => void;
}

/**
 * 视图配置器(Drawer)。
 * 配置视图的筛选条件 / 排序 / 字段显隐,保存到 View.config JSON。
 *
 * 配置格式:
 *   filters: { logic: 'AND'|'OR', conditions: [{ fieldId, operator, value }] }
 *   sorts:   [{ field: apiName, order: 'asc'|'desc' }]
 *   fields:  [{ fieldId, order }]
 */
export default function ViewConfigurator({ open, view, fields, onClose }: ViewConfiguratorProps) {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<object | null>(null);
  const [sorts, setSorts] = useState<ViewSortConfig[]>([]);
  /** 显隐字段列表(仅勾选的会显示,顺序可拖拽)。 */
  const [visibleFields, setVisibleFields] = useState<ViewFieldConfig[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /** fieldId → Field 映射(快速查 apiName / 类型)。 */
  const fieldMap = useMemo(() => {
    const m = new Map<string, Field>();
    fields.forEach((f) => m.set(f.id, f));
    return m;
  }, [fields]);

  /** 打开时从 view.config 初始化本地状态。 */
  useEffect(() => {
    if (!open || !view) return;
    const cfg: ViewConfig = (view.config ?? {}) as ViewConfig;
    setFilters(cfg.filters ?? null);
    setSorts(cfg.sorts ?? []);
    // 字段显隐:默认全部显示(按 fields 数组顺序)
    if (cfg.fields && cfg.fields.length > 0) {
      setVisibleFields(cfg.fields.map((f) => ({ ...f })));
    } else {
      setVisibleFields(fields.map((f, idx) => ({ fieldId: f.id, order: idx })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view?.id]);

  /** 保存视图配置。 */
  const saveMutation = useMutation({
    mutationFn: (config: ViewConfig) => {
      if (!view) throw new Error('视图不存在');
      return objectsApi.updateView(appId as string, view.objectId, view.id, { config });
    },
    onSuccess: () => {
      message.success('视图配置已保存');
      queryClient.invalidateQueries({ queryKey: ['object', view?.objectId, 'views'] });
      onClose();
    },
    onError: (err) => showError(err),
  });

  const handleSave = () => {
    const config: ViewConfig = {
      filters,
      sorts,
      fields: visibleFields,
    };
    saveMutation.mutate(config);
  };

  // -------------------------------------------------------------------------
  // 排序操作
  // -------------------------------------------------------------------------

  const addSort = () => {
    const firstField = fields[0];
    setSorts((prev) => [...prev, { field: firstField?.apiName ?? '', order: 'asc' }]);
  };

  const updateSort = (index: number, patch: Partial<ViewSortConfig>) => {
    setSorts((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeSort = (index: number) => {
    setSorts((prev) => prev.filter((_, i) => i !== index));
  };

  // -------------------------------------------------------------------------
  // 字段显隐操作
  // -------------------------------------------------------------------------

  const toggleFieldVisible = (fieldId: string, checked: boolean) => {
    setVisibleFields((prev) => {
      if (checked) {
        // 添加到最后
        if (prev.some((f) => f.fieldId === fieldId)) return prev;
        return [...prev, { fieldId, order: prev.length }];
      }
      // 移除并重新编号
      const filtered = prev.filter((f) => f.fieldId !== fieldId);
      return filtered.map((f, idx) => ({ ...f, order: idx }));
    });
  };

  /** 字段显隐拖拽排序。 */
  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setVisibleFields((prev) => {
      const ids = prev.map((f) => f.fieldId);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      return reordered.map((f, idx) => ({ ...f, order: idx }));
    });
  };

  if (!view) {
    return (
      <Drawer open={open} onClose={onClose} width={560}>
        <Text type="secondary">未选择视图</Text>
      </Drawer>
    );
  }

  return (
    <Drawer
      title={`配置视图 — ${view.name}`}
      open={open}
      onClose={onClose}
      width={560}
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
      {/* ===================== 筛选条件 ===================== */}
      <SectionHeader icon={<FilterOutlined />} title="筛选条件" />
      <QueryBuilderPanel
        fields={fields}
        value={filters}
        onChange={setFilters}
        placeholder="空条件 = 显示所有记录，添加规则后将按条件筛选"
      />

      <Divider style={{ margin: '20px 0 16px' }} />

      {/* ===================== 排序设置 ===================== */}
      <SectionHeader icon={<SortAscendingOutlined />} title="排序设置" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        {sorts.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12, padding: '8px 0' }}>
            暂无排序(默认按创建时间倒序)
          </Text>
        )}
        {sorts.map((sort, index) => (
          <SortRow
            key={index}
            index={index}
            sort={sort}
            fields={fields}
            onUpdate={updateSort}
            onRemove={removeSort}
          />
        ))}
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addSort} block>
          添加排序
        </Button>
      </div>

      <Divider style={{ margin: '20px 0 16px' }} />

      {/* ===================== 字段显隐 ===================== */}
      <SectionHeader icon={<EyeOutlined />} title="字段显隐" />
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
        勾选要显示的字段,拖拽 ⠿ 调整显示顺序
      </Text>

      {/* 已显示字段(可拖拽排序) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleFieldDragEnd}
      >
        <SortableContext
          items={visibleFields.map((f) => f.fieldId)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {visibleFields.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未选择显示字段"
                style={{ padding: '16px 0' }}
              />
            )}
            {visibleFields.map((vf) => {
              const field = fieldMap.get(vf.fieldId);
              if (!field) return null;
              const meta = getFieldTypeMeta(field.type);
              return (
                <SortableFieldRow
                  key={vf.fieldId}
                  fieldId={vf.fieldId}
                  label={field.label}
                  apiName={field.apiName}
                  color={meta.color}
                  checked
                  onToggle={(c) => toggleFieldVisible(vf.fieldId, c)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* 未显示字段(仅勾选切换) */}
      {fields.filter((f) => !visibleFields.some((vf) => vf.fieldId === f.id)).length > 0 && (
        <>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            隐藏的字段
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fields
              .filter((f) => !visibleFields.some((vf) => vf.fieldId === f.id))
              .map((field) => {
                const meta = getFieldTypeMeta(field.type);
                return (
                  <div
                    key={field.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      background: T.colorFillQuaternary,
                      borderRadius: 8,
                      opacity: 0.7,
                    }}
                  >
                    <Checkbox
                      checked={false}
                      onChange={(e) => toggleFieldVisible(field.id, e.target.checked)}
                    />
                    <Tag color={meta.color} style={{ margin: 0 }}>
                      {meta.label}
                    </Tag>
                    <Text style={{ fontSize: 13 }}>{field.label}</Text>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </Drawer>
  );
}
