# TODOS

## [DONE] ~~表格/定义列表元素的渲染 bug~~
已修复 — renderer.ts 统一使用 `el.appendChild()` 在元素内部追加译文，避免破坏 HTML 结构。

## [MEDIUM] 探索 Chrome Built-in Translator API 作为主翻译方案
**What:** Chrome 138+ 提供了稳定的内置 Translator API，可能比 Google Translate 非官方 API 更优
**Why:** 免费、无网络请求、无 CORS 问题、无 API Key、无限流风险。但需要模型下载和用户激活。
**Pros:** 彻底消除翻译 API 稳定性风险，离线可用，无需担心 Google 封锁
**Cons:** 需要 Chrome 138+（非所有用户都有）、初始化复杂度增加（availability 检查、模型下载等待）、可能需要用户手动激活
**Context:** Codex 在 /plan-eng-review 外部意见中提出。建议实现 Google Translate 作为 v1 后，Phase 2 探索 Translator API 作为主方案，Google Translate 降为备选。参考：https://developer.chrome.com/docs/ai/translator-api
**Depends on:** v1 完成后

## [LOW] 元素选择器可能遗漏 div/span 内容
**What:** 当前只扫描 p/li/h1-h6/blockquote/td/th/figcaption/dt/dd，可能遗漏现代网站中用 div/span 包裹的正文内容
**Why:** 很多现代网站不使用语义化标签，正文内容直接放在 div 里
**Pros:** 扩大选择器覆盖更多网站
**Cons:** 可能误翻译 UI 元素（按钮文字、导航文字等）
**Context:** Codex 在 /plan-eng-review 中提到。v1 先用保守的选择器，后续根据实际使用反馈调整。
**Depends on:** v1 使用反馈

## [DONE] ~~创建 DESIGN.md 设计系统文档~~
已完成 — 2026-03-24 通过 /design-consultation 创建。
