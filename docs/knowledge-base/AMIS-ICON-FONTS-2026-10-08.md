# amis 图标字体缺失踩坑（页面设计器图标空白）— 2026-10-08

## 现象

页面设计器多处小图标空白：属性面板数字框上下箭头、物料面板组件图标（fa 家族）、
编辑器部分工具图标。用户报告时只举了两例，全盘排查后发现是**两个独立家族**都缺。

## 根因（三层）

amis 6.13 的 `lib/themes/antd.css` **只引用不声明**图标字体——@font-face 全在
`sdk/` 发行物里，而我们的接入（AmisEditorCanvas）只引入了 lib 主题 CSS：

1. **iconfont 家族**（amis 自有字形：数字框箭头、部分工具图标）：
   @font-face 在 `amis/sdk/iconfont.css`（150K，woff2 base64 自包含）。
2. **Font Awesome 家族**（物料面板 ~100 组件图标、工具栏）：fa 类的
   `--fa:"\f150"` 变量定义在 sdk 主题 css；@font-face 指向
   `sdk/thirds/@fortawesome/fontawesome-free/webfonts/`——amis sdk 显式引用
   fontawesome-free 的资产但该包不在依赖树。

## 修复（AmisEditorCanvas imports）

```ts
import 'amis/sdk/iconfont.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';  // 关键！
import '@fortawesome/fontawesome-free/css/v5-font-face.min.css';
```

- 新增依赖 `@fortawesome/fontawesome-free@^6.7.2`（studio dependencies）——理由：
  amis 主题 fa 图标必需，sdk 引用了其 webfonts 路径。
- **v4-shims 是关键**：FA6 把大量图标改名（fa-toggle-down→fa-circle-down），
  amis-editor 物料配置用的是 v4/v5 老名字（`fa fa-toggle-down`），all.min.css
  里 grep 老名是 0 命中——必须经 v4-shims 映射。排查时曾因
  `grep fa-toggle-down all.min.css = 0` 误判包不对。

## 验证手段（避免误判）

- `document.fonts.check(family)` 不可靠：懒加载字体未触发时恒 false；
- **认 computed 伪元素 content**：箭头在 `::after`（不是 ::before，查错伪元素
  会得出"没修好"的错误结论）；fa 在 `::before` 且 content:var(--fa)；
- 强制加载判定字体有效性：`face = Array.from(document.fonts).find(f =>
  f.family.includes('iconfont')); await face.load()` → status=loaded。

## 关联

[[amis-icon-fonts]] 关联 R1.7 amis 迁移（接入时遗漏字体资产，v1.7 三批均未发现
——设计器核心交互（拖拽/保存/预览）不依赖图标，视觉缺失不影响功能测试，直到
用户目视发现）。
