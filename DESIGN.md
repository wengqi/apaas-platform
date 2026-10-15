---
name: aPaaS 低代码平台
description: 企业级低代码应用平台——受约束的 AI 应用生成底座（素蓝视觉世界）
colors:
  primary: "#2563EB"
  primary-deep: "#1D4ED8"
  primary-tint: "#7EA2F0"
  primary-bg: "#EFF4FF"
  primary-border: "#B6C7F5"
  ink: "#1E293B"
  text-secondary: "#64748B"
  text-tertiary: "#94A3B8"
  text-quaternary: "#B6C0CE"
  border: "#DBE2EC"
  border-hairline: "#E9EEF5"
  split: "#F1F5F9"
  canvas: "#F5F7FA"
  surface: "#FFFFFF"
  brand-panel: "#EEF3F9"
  brand-panel-watermark: "#E2EAF5"
  brand-navy: "#16223B"
  dot-idle: "#CBD5E1"
  success: "#15803D"
  success-bg: "#ECFDF5"
  warning: "#D97706"
  warning-deep: "#B45309"
  warning-bg: "#FFF7E6"
  error: "#DC2626"
  error-bg: "#FEF2F2"
typography:
  display:
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  section:
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.65
  meta:
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.12em"
rounded:
  hairline-pill: "99px"
  sm: "6px"
  md: "9px"
  lg: "12px"
  tile: "10px"
  logo: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  section: "26px"
  page-x: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "38px"
  card-app:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-hairline}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    height: "44px"
  status-dot-published:
    backgroundColor: "{colors.primary}"
    size: "7px"
  status-dot-draft:
    backgroundColor: "{colors.dot-idle}"
    size: "7px"
  app-tile:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.tile}"
    size: "40px"
---

# Design System: aPaaS 素蓝

## Overview

**Creative North Star: "素蓝"（Quiet Blue）**

一个把"专业"本身当作视觉世界的双前端企业低代码平台。全站只有一个主色蓝（#2563EB），它只出现在**可动作与已生效**的地方——主按钮、激活导航、链接、焦点环、"已发布"状态点；其余一切是冷蓝灰墨阶、白色表面与发丝线。无渐变、无彩色光晕、无阴影堆叠；深度靠 1px 发丝线与极浅色块层次表达。应用图标是统一的蓝色首字字母瓷片——不使用 emoji 或逐应用配色。密度为长时间工作服务：信息先行、留白呼吸、无装饰性卡壳（指标行是纯文字+发丝分隔，不是三张统计卡）。

**Key Characteristics:**
- 唯一蓝 #2563EB 贯穿双端（studio 开发中心 / runtime 运行时门户）
- 冷蓝灰墨阶四档文字 + 两档边框 + 发丝分隔线
- 状态语义只靠 7px 圆点：蓝点=已发布/生效，灰点=开发中
- 应用瓷片 = 名称首字 + 实底素蓝，全站统一
- 右侧"分组定位轨"（纯文字大纲样式，计数右对齐）是标志性导航件

## Colors

冷蓝灰单色相家族：一个克制的蓝做全部"动作与生效"表达，其余全是蓝调中性色。

### Primary
- **素蓝** (#2563EB): 主按钮、激活导航项、链接、焦点环、已发布状态点、字母瓷片。蓝色出现之处即可按或已生效之处。

### Secondary
- **提亮蓝** (#7EA2F0): 深蓝底上的品牌元素（登录面板水印、深底 Logo 变体）、字标方点。

### Tertiary (optional)
- **深蓝夜** (#16223B): 登录页品牌底（若采用深色分屏变体）与文字水印场。

### Neutral
- **墨** (#1E293B): 主文字、标题。
- **次级灰蓝** (#64748B): 次级文字、描述。
- **三级灰蓝** (#94A3B8): 辅助说明、占位、右轨叶子。
- **四级灰蓝** (#B6C0CE): 计数、禁用、装饰性标签。
- **边框** (#DBE2EC) / **发丝线** (#E9EEF5) / **分隔** (#F1F5F9): 三档分隔体系。
- **画布** (#F5F7FA) / **表面** (#FFFFFF): 页面底与卡面。
- **品牌栏** (#EEF3F9) / **天光水印** (#E2EAF5): 登录分屏左栏与其水印。

### Named Rules
**唯一蓝原则。** 蓝色只承载"可动作/已生效/当前所在"三种语义；信息性状态（成功/警告/错误）使用独立语义色且只以 7px 圆点或小徽标出现，永不与主色混用。
**退役灰阶原则。** 已归档/未分组内容整体降为灰阶表达，不额外着色。

## Typography

**Display Font:** 系统栈（-apple-system / PingFang SC / Microsoft YaHei）——中文企业工具的系统栈即正装
**Body Font:** 同上（单一字族，层级全靠字号/字重/颜色）

**Character:** 无展示字体的克制路线；层级由 600/500/400 三档字重与四档墨色承载，数字一律 tabular-nums。

### Hierarchy
- **Display** (600, 29-30px, 1.45): 登录页主张、首页问候语。
- **Title** (600, 23-26px, 1.3): 页面标题。
- **Section** (600, 16px): 分组节头、卡片节标题。
- **Body** (400, 13.5px, 1.65): 正文与描述；描述两行钳制。
- **Meta** (400, 12px): 卡片元数据行、状态计数；tabular-nums。
- **Label** (600, 11px, 0.12em): 分组栏目标签（"应 用 库"/"分 组"）。

### Named Rules
**字重承重原则。** 层级靠字重与墨色深浅，不靠字号膨胀——同层内容字号差 ≤2px。

## Layout

4px 基准网格；页面主体 `max-width: 1240-1340px` 居中，水平内边距 40-44px。开发中心首页为"正文 1fr + 右侧分组定位轨 248px"双栏（gap 52px），轨 sticky 吸顶。卡片网格 2-3 列 `minmax(0,1fr)` 等分。区间距：节 26px、区块 22px、卡内 20px。分屏登录左栏 46%（≥960px 才显示）。

## Elevation & Depth

**无阴影体系。** 深度全部由三层分隔（边框 #DBE2EC / 发丝线 #E9EEF5 / 分隔 #F1F5F9）与两档底色（画布 #F5F7FA / 表面 #FFF）表达。唯一例外：沉浸式登录页的悬浮白卡在深色场上携带大柔和投影（0 24px 70px rgba(4,10,24,.45)）——那是品牌场的舞台照明，不是产品内语言。

### Named Rules
**发丝线优先原则。** 需要分隔或边界时先用 1px 线，投影是最后手段。

## Shapes

圆角三档：控件 9px（AntD borderRadius=9 派生）、卡片/瓷片 10-12px、品牌 Logo 14/64。状态点与徽标为全圆（pill）。字母瓷片是核心几何符号：正方形圆角 10-11px、实底素蓝、白色首字（600 字重）——它同时是应用图标、登录品牌位与头部应用标识。禁止多边形剪切、渐变填充与彩色投影。

## Components

### Buttons
- **Shape:** 圆角 9px（继承 AntD borderRadius），主按钮高 38-46px。
- **Primary:** 素蓝底白字；hover 深一档（#1D4ED8 由 AntD 派生）。
- **Ghost/Text:** 透明底 + 次级墨字；悬停浅灰底（#F8FAFC）。
- **Focus:** 3px rgba(37,99,235,.1) 外环 + 1px 主色描边（AntD 主题派生）。

### Status Dots
- **Style:** 7px 圆点，无描边。
- **State:** 已发布/生效=素蓝实心；开发中/草稿=#CBD5E1 灰。

### Cards / Containers
- **Corner Style:** 12px 圆角、1px #E9EEF5 边、无阴影。
- **Structure:** 横排头（瓷片+名称+徽标）→ 描述（两行钳制）→ 发丝线 → 元数据行（margin-top:auto 钉底保证同排等高对齐）。
- **States:** hover 提示（AntD hoverable 或边框加深）；键盘 Enter/Space 等效点击。

### Locator Rail (分组定位轨)
- **Style:** 无底色纯文字层级轨：组名 13px + 计数 11px 右对齐到轨缘；当前组=字重 600 + 墨色 + 2px 蓝色左指示线。
- **State:** 滚动跟随高亮（scrollspy）；点击锚点定位；空组显示"（暂无应用）"。

### App Tile (字母瓷片)
- **Style:** 40px 圆角 10px 实底素蓝，白色名称首字（截一字）。
- **Rule:** 全站唯一形态——不用 emoji、不用逐应用配色、不加投影。

### Group Select (分组选择器)
- **Style:** AutoComplete 单选 + 自由输入；选现有组或输入新组名即建组。
- **Rule:** 分组无独立实体——它只存在于应用上。

## Do's and Don'ts

- **Do** 让蓝色只出现在可按、已生效、当前所在三处
- **Do** 用发丝线与色块层次表达一切分隔与深度
- **Do** 数据列与计数用 tabular-nums，右对齐到轨缘/卡缘
- **Do** 业务界面（runtime）只用业务词；工程标识（apiName/统计）只留在 studio
- **Don't** 用 emoji 或 Unicode 字形充当图标；应用图标一律字母瓷片
- **Don't** 给应用配彩色主题——瓷片统一素蓝（app.color 字段保留但视觉忽略）
- **Don't** 使用渐变、玻璃拟态、彩色光晕投影、零偏移彩晕
- **Don't** 在卡片里再套同层级卡（指标行是文字+发丝线，不是统计卡）
- **Don't** 在 runtime 暴露工程行话（对象/页面/流程计数、版本徽标堆叠、接口名）
- **Don't** 用定时轮询刷新徽标与动态——事件驱动（项目工程红线在视觉层的延伸）
