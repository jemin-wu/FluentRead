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

## [PARTIAL] 元素选择器可能遗漏 div/span 内容

**What:** 当前只扫描 p/li/h1-h6/blockquote/td/th/figcaption/dt/dd，可能遗漏现代网站中用 div/span 包裹的正文内容
**Why:** 很多现代网站不使用语义化标签，正文内容直接放在 div 里
**Pros:** 扩大选择器覆盖更多网站
**Cons:** 可能误翻译 UI 元素（按钮文字、导航文字等）
**Context:** site adapter 机制已解决已知站点（Twitter/X）的选择器问题。通用的 div/span 启发式扫描仍未实现。
**Partial fix:** `src/utils/site-adapters.ts` 为特定站点提供自定义选择器，绕过默认标签限制。
**Depends on:** 更多站点的使用反馈

## [DONE] ~~创建 DESIGN.md 设计系统文档~~

已完成 — 2026-03-24 通过 /design-consultation 创建。

## [LOW] 并发 doTranslate 的 translateComplete 竞态

**What:** 如果用户在翻译进行中切换语言触发第二次 doTranslate，第一次的 `translateComplete` 消息会过早将 popup 按钮状态设为 'done'，而第二次翻译仍在进行中。
**Why:** 当前 `isTranslating` 标志是布尔值，无法区分多次并发调用。translateComplete 消息在第一次翻译结束时就发出，导致 UI 状态与实际翻译状态不一致。
**Mitigation:** 可引入递增计数器或 AbortController 来关联每次翻译请求，确保只有最后一次翻译完成时才发送 translateComplete。
**Depends on:** v1 稳定后
