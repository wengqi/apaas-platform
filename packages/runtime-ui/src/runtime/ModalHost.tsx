/**
 * 弹窗宿主 — 消费 open_modal / close_modal 动作写入的 vm.modalVisible / vm.modalPage。
 *
 * open_modal 将 modalVisible=true + modalPage=<slug> 写入页面视图模型；
 * close_modal 将 modalVisible=false 写回。此前 vm.modalVisible 无任何消费方（死动作），
 * ModalHost 订阅该变量：打开时按 slug 加载目标页面 Schema，在弹窗内以独立 vm 渲染；
 * 关闭（右上角 X / mask 点击）时回写宿主页面的 vm.modalVisible=false。
 */

import { Modal, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { pagesApi } from '../api/pages';
import { RuntimeStoreProvider, useRuntimeCtx } from './RuntimeStore';
import ComponentRenderer from './ComponentRenderer';

const { Text } = Typography;

export default function ModalHost({ appId }: { appId: string }) {
  const open = useRuntimeCtx((s) => s.vm['modalVisible'] === true);
  const modalPage = useRuntimeCtx((s) => s.vm['modalPage'] as string | undefined);
  const setVariable = useRuntimeCtx((s) => s.setVariable);

  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['page', appId, modalPage],
    queryFn: () => pagesApi.getBySlug(appId, modalPage!),
    enabled: open && !!modalPage,
  });

  const close = () => setVariable('vm.modalVisible', false);

  if (!open) return null;

  const schema = page?.schema;

  return (
    <Modal
      open
      title={page?.name ?? modalPage ?? '弹窗'}
      footer={null}
      onCancel={close}
      width={720}
    >
      {!modalPage ? (
        <Text type="secondary">open_modal 动作未配置 pageSlug</Text>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : error || !page || !schema?.root ? (
        <Text type="secondary">弹窗页面不存在或未发布</Text>
      ) : (
        // key=page.id：弹窗内容页独立 vm；二次打开时重挂载，重跑 autoQuery/onLoad
        <RuntimeStoreProvider key={page.id} viewModel={schema.viewModel} objectId={page.objectId}>
          <ComponentRenderer node={schema.root} root={schema.root} isRoot />
        </RuntimeStoreProvider>
      )}
    </Modal>
  );
}
