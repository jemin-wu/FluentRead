# Design System — FluentRead

## Product Context
- **What this is:** Chrome 浏览器沉浸式双语翻译插件
- **Who it's for:** 开发者自己 + 朋友，学习项目
- **Space/industry:** 浏览器翻译工具（参考沉浸式翻译）
- **Project type:** Chrome Extension（APP UI: Popup + Options）+ 页面覆盖层（翻译注入）

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — 精致的实用主义
- **Decoration level:** Minimal — 让排版和色彩做所有的工作
- **Mood:** 可靠、干净、不抢眼。像一个精心打磨的专业工具，而不是花哨的玩具。翻译插件的存在感应该恰到好处——需要时一目了然，不需要时完全透明。
- **Reference sites:** Immersive Translate (immersivetranslate.com)

## Typography
- **Display/Hero:** DM Sans Bold (700) — 干净、现代，比 Inter 有更多个性但同样专业
- **Body:** DM Sans Regular (400) — 可读性优秀，中性但不无聊
- **UI/Labels:** DM Sans Medium (500) — 用于按钮、标签等需要稍强调的文字
- **Data/Tables:** JetBrains Mono (400) — 等宽字体，用于缓存大小、版本号等数据展示
- **Code:** JetBrains Mono (400)
- **Loading:** Google Fonts CDN `https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500`
- **Injected translation:** `inherit` — 继承页面原生字体，确保译文融入不突兀
- **Scale:**
  - Display: 36px / 700
  - H1: 24px / 600
  - H2: 20px / 600
  - H3: 16px / 600
  - Body: 15px / 400
  - Small: 13px / 400
  - Caption: 11px / 400

## Color
- **Approach:** Restrained — 品牌蓝作为唯一强调色，其余全是中性灰
- **Accent:** #4A90D9 — 品牌蓝，用于主操作按钮、激活状态、链接
- **Accent Hover:** #3A7BC8
- **Accent Light:** #EBF3FB — 用于 ghost 按钮 hover、选中背景
- **Neutrals (Light):**
  - Background: #FFFFFF
  - Surface: #F8F9FA（卡片、输入框背景）
  - Border: #E5E7EB
  - Text Primary: #1a1a1a
  - Text Secondary: #666666（译文颜色）
  - Text Muted: #999999
- **Neutrals (Dark):**
  - Background: #1a1a1a
  - Surface: #2a2a2a
  - Border: #3a3a3a
  - Text Primary: #e5e5e5
  - Text Secondary: #aaaaaa（译文颜色）
  - Text Muted: #777777
  - Accent: #5BA0E9（暗色模式下稍微调亮）
- **Semantic:**
  - Success: #34A853
  - Warning: #FBBC04
  - Error: #EA4335
  - Info: #4A90D9（复用品牌蓝）
- **Dark mode:** 通过 `prefers-color-scheme: dark` 自动切换，降低饱和度 10-20%

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — Chrome Popup 空间有限但不应拥挤
- **Scale:**
  - 2xs: 2px
  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px

## Layout
- **Approach:** Grid-disciplined — 严格对齐，可预测的间距
- **Popup:** 360px 固定宽度
- **Options page:** 最大 600px 内容宽度，水平居中
- **Translation overlay:** 全宽，跟随页面内容区域
- **Border radius:**
  - sm: 4px（小元素：标签、提示）
  - md: 8px（按钮、输入框、卡片）
  - lg: 12px（Popup 容器、大卡片）
  - full: 9999px（开关、药丸标签）

## Motion
- **Approach:** Minimal-functional — 只在状态变化时使用过渡
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:**
  - micro: 50-100ms（开关切换、hover）
  - short: 150-250ms（按钮状态、tooltip 出现）
  - medium: 250-400ms（译文淡入、面板展开）
- **Translation appear:** opacity 0→1, 250ms ease-out
- **Tooltip appear:** opacity 0→1 + translateY(4px→0), 150ms ease-out

## Translation-Specific Styles
- **Bilingual container:** `<div class="fluentread-translation" lang="zh-CN" role="note">`
- **Separator:** `border-top: 1px dashed var(--border)` above translation
- **Translation color:** var(--text-secondary) — #666 light / #aaa dark
- **Font:** inherit from page
- **Spacing:** margin-top: 4px above separator

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | Initial design system created | Created by /design-consultation based on product research and office-hours context |
| 2026-03-24 | DM Sans as UI font | More personality than Inter/system-ui, clean enough for a tool |
| 2026-03-24 | Restrained color (1 accent + grays) | Translation tool shouldn't compete with content user is reading |
| 2026-03-24 | Translation inherits page font | Translations should feel native to each website |
| 2026-03-24 | Immersive Translate style for bilingual display | Users already familiar with this pattern |
