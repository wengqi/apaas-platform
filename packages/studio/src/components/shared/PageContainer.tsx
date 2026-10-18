/**
 * 页面内容容器 — 租户级页面统一内容宽度（2026-10-18 用户裁决：与开发中心一致）。
 *
 * maxWidth 1340 + 44px 水平内边距，与 DevCenterHome 内容区同宽同缘；
 * 各治理页不再各自声明宽度，避免再次漂移。
 */

interface PageContainerProps {
  children: React.ReactNode;
}

/** 与开发中心同宽的内容容器。 */
export default function PageContainer({ children }: PageContainerProps) {
  return (
    <div style={{ maxWidth: 1340, margin: '0 auto', padding: '28px 44px 40px' }}>{children}</div>
  );
}
