# 流程画布添加水平/垂直布局切换

## 现状
- `ZoomToolbar` 已调用 `usePlaygroundTools()`，但只用了 `zoomin/zoomout/zoom/fitView`
- flowgram 内置 `changeLayout()` 和 `isVertical`，无需额外安装或配置

## 实现
在 `SimplifiedEditor.tsx` 的 `ZoomToolbar` 组件中：
1. 从 `usePlaygroundTools()` 解构 `changeLayout` 和 `isVertical`
2. 添加一个布局切换按钮（垂直/水平图标），点击调用 `changeLayout()`
3. 按钮显示当前布局状态（垂直时显示水平切换图标，反之亦然）

**文件**: `packages/studio/src/components/process/SimplifiedEditor.tsx`（ZoomToolbar 组件，约 5 行改动）

使用图标：
- 垂直布局时显示 `ColumnHeightOutlined`（提示可切换为水平）
- 水平布局时显示 `ColumnWidthOutlined`（提示可切换为垂直）