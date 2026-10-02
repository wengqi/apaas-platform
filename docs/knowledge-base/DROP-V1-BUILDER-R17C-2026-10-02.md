# R1.7 第二轮③：v1 搭建器物理下线 + 方言合同退役（2026-10-02）

> 承接 ①（DROP-LEGACY-RUNTIME）②（AMIS-EDITOR-CANVAS-R17B）。本批次为 R1.7 收官：
> v1 搭建器文件树 + shared v1 渲染残骸 + isAmisPage 方言合同全部物理删除。

## 变更

- **studio（-10k 行）**：page-builder 下 v1 三栏画布/组件注册表/属性面板/表单生成器/
  模板/store 全删；仅保留 AmisEditorCanvas/AmisEditorInner/PageList/page-list。
  建页弹窗的 PAGE_TYPE_OPTIONS 内联（脱离组件注册表）
- **shared（-2.7k 行）**：stores v1 渲染集群（component-renderer/renderers 系列/runtime-store/
  action-executor/expression-engine/rich-text/field-span/types）删除，index 收敛为
  auth+query-client+query-keys；page 下 chart-options/region-data/markdown/global-code
  删除；**isAmisPage/PageSchemaV1 删除，PageSchema 宽松化**（`Record<string, unknown>`，
  形状约束归 G3 合同）
- **runtime-ui/studio api 镜像类型块**：两包 api/pages.ts 的 v1 类型镜像（ComponentType
  86 枚举/ComponentNode/ViewModel 等 ~190 行/包）删除，PageType 保留、PageSchema 引 shared
- **G3 单路径**：page.service create/update 一律 `validate('amis_page')`（删 isAmisPage
  条件旁路）——v1 schema 从此 400
- **e2e**：03/05 共 9 个 fixme 用例删除；03「更新页面 Schema」改为 amis round-trip
  （G3 硬闸负向语义由服务端合同承担）

## 删除统计

101 文件，+53/-18,689 行。全仓 `isAmisPage`/`PageSchemaV1` 零引用。

## 踩坑

- 块注释里写 `renderers-*/runtime-store` —— `*/` 提前终结注释，tsc 在后续行报
  Invalid character（排查时先怀疑编码/缓存，浪费一轮）。注释中避免 `*/` 序列。
- `tsc -b` 增量缓存（tsbuildinfo）在删文件后会报陈旧错误，先 `-delete` 再判。

## R1.7 全程收束

| 批次 | 内容 | PR |
|---|---|---|
| 一轮 | 渲染分流 + seed 迁 amis + CodeTab 兜底 + G3 补位 | #13 |
| 二轮① | v1 运行时轨下线 + R1.4 兜底腿退役 + publishedSnapshot 列删除 | #14 |
| 二轮② | 画布 amis-editor 重写 + v1 模板退役 + create 补 G3 | #15 |
| 二轮③ | v1 搭建器物理下线 + 方言合同退役 + G3 单路径 | 本 PR |

页面层自此：**唯一方言 amis、唯一搭建器 amis-editor、唯一渲染器 AmisRenderer、
唯一校验 G3 amis_page**。组件矩阵 86→30 的裁剪随注册表删除自动完成，
后续按需在 amis-editor setter 白名单层做暴露面控制。
