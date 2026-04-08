# Content Script 规范

此文件覆盖 DOM 读写、CSS 注入、渲染层的行为约束。
消息通信和 Storage 操作即使发生在 content script 内，也归 `extension.md`。

## DOM 注入

- **译文容器统一用 `el.appendChild(div)`**，在原文元素内部追加。禁止用 `insertAdjacentElement` 或 `el.parentNode.insertBefore` 在外部插入，否则破坏 `<table>`、`<dl>` 等结构化 HTML。
- 所有注入的 `<div>` 必须设置 `className = 'fluentread-translation'`，加 `role="note"` 和 `aria-label="translation"`。
- 加载态额外加 `fluentread-loading` class 和 `aria-live="polite"`。
- 移除译文时用 `el.querySelector('.fluentread-translation')?.remove()`，而非清空 `innerHTML`。

```typescript
// ✅ 正确
const div = document.createElement('div');
div.className = 'fluentread-translation';
div.setAttribute('role', 'note');
div.setAttribute('aria-label', 'translation');
el.appendChild(div);

// ❌ 禁止
el.insertAdjacentHTML('afterend', '<div>...</div>');
el.innerHTML = '';
```

## CSS 命名空间

- **类名前缀** — 所有注入类名必须以 `fluentread-` 开头（如 `fluentread-translation`、`fluentread-loading`、`fluentread-dot-trigger`）。
- **CSS custom property 前缀** — 仅用 `--fr-` 前缀（如 `--fr-font-size`、`--fr-line-height`）。禁止使用 `--color-*` 等通用名，会与宿主页面冲突。
- **禁止在 content script CSS 中使用 CSS custom properties 做颜色** — popup/options 用 `--text-1`、`--accent` 等 token，但 content script 必须用 raw hex/rgba 值，因为自定义属性会被宿主页面覆盖。
- **z-index** — 浮动元素（dot trigger、tooltip）使用 `z-index: 2147483647`（最大值）。

## 翻译管线协议（Placeholder Protocol）

`extractPlaceholders` → Google Translate API → `restorePlaceholders` 是核心管线，修改需谨慎。

### 占位符标记

| 标记                    | 用途                                                      | 翻译行为                                           |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| `__TAG_N__`             | `<code>`, `<sup>`, `<sub>` 的完整占位（存储 `outerHTML`） | 内容不参与翻译，原样还原（保留原始属性和内部结构） |
| `__LSN__` ... `__LEN__` | `<a>` 链接的边界标记                                      | 链接文字参与翻译，`href` 保留                      |

### 处理顺序

1. 先处理 `code/sup/sub`（`PRESERVE_SELECTOR`），再处理 `a[href]`。顺序不可颠倒——嵌套在 `<a>` 内的 `<code>` 必须先被占位。
2. Fast path：如果元素内无 `a[href], code, sup, sub`，跳过 `cloneNode`，直接取 `innerText`。

### HTML 安全

- `restorePlaceholders` 的翻译文本经过 `escapeHtml` 处理。`code/sup/sub` 通过原始 `outerHTML` 直接插入（来自可信 DOM，非用户输入）。链接通过 `escapeAttr` 处理 `href`/`target`。
- **禁止**在 `restorePlaceholders` 中引入新的未转义内容。
- `escapeAttr` 用于链接 `href` 和 `target` 属性值。

```typescript
// 残留标记清理 — 翻译 API 可能丢失边界标记
html = html.replace(/__L[SE]\d+__/g, '');
```

## DOM 过滤链

`getTranslatableElements` 的过滤决策链（`dom-utils.ts`），修改任一环节需全链路回归测试：

```
元素候选（TRANSLATABLE_TAGS 或 adapter.selectors）
  ↓
EXCLUDED_SELECTORS 排除（nav, footer, header, code, pre, script...）
  ↓
代码托管站特殊逻辑（isCodeHostingSite → 仅允许 CODE_HOST_ALLOWED_CONTAINERS 内的元素）
  ↓
MIN_TEXT_LENGTH = 5（文本太短跳过）
  ↓
isCJKDominant（CJK 字符占比 > 50% 跳过，已是中文无需翻译）
  ↓
looksLikeCode（代码特征字符占比 > 15% 跳过）
```

- **Adapter 模式**：当 `SiteAdapter` 提供 `selectors` 时，跳过默认 `TRANSLATABLE_TAGS` 和 `EXCLUDED_SELECTORS` 的容器检查（`skipContainerCheck=true`），但仍执行文本长度、CJK、代码检测。
- **Containment dedup**：过滤结果中如果父子同时匹配，只保留子元素（避免重复翻译）。

## 暗色模式适配

- Content script CSS 使用 `@media (prefers-color-scheme: dark)` 自动切换，禁止 class-based toggling。
- 每个可见的 CSS 规则都必须有对应的 dark 变体。新增样式时必须同步添加 dark block。
- 蓝色 accent 家族：light = `#3b82f6`，dark = `#60a5fa`。保持一致。

## Reduced Motion 适配

- `content/style.css` 末尾有 `@media (prefers-reduced-motion: reduce)` 块。
- **新增任何 `animation` 或 `transition` 时，必须在此块中添加对应的禁用规则。**
- 原则：`animation: none; opacity: 1;`（去除动画，保持可见）。hover 效果保留但减小幅度。

## 译文样式继承

译文容器（`.fluentread-translation`）完全继承原文排版：`color: inherit`、`font-size: inherit`、`line-height: inherit`、`font-weight: inherit`。禁止在此容器上设置硬编码字体大小或颜色。

仅译文模式（`.fluentread-target-only`）通过 `font-size: 0` 隐藏原文文本节点，用 `--fr-font-size` / `--fr-line-height` CSS 变量恢复译文的字号（由 JS 在切换时从 `getComputedStyle` 读取并设置）。

## 事件监听器清理

`selection.ts` 的 `SelectionTranslator` 类使用两种模式管理事件监听器，防止内存泄漏：

### Bound Method Refs

长生命周期的监听器（mouseup、click、keydown 等）用 `private readonly` 绑定方法引用，确保 `addEventListener` 和 `removeEventListener` 使用同一个函数引用：

```typescript
// ✅ 正确 — 稳定引用，可正确移除
private readonly handleMouseUp = () => this.onMouseUp();
// init() 中
document.addEventListener('mouseup', this.handleMouseUp);
// destroy() 中
document.removeEventListener('mouseup', this.handleMouseUp);

// ❌ 禁止 — 匿名函数无法移除
document.addEventListener('mouseup', () => this.onMouseUp());
```

### AbortController 短生命周期监听

划词光点的 click 事件用 `AbortController` 管理，每次显示新光点时 abort 旧的、attach 新的：

```typescript
this.dotClickAC?.abort();
this.dotClickAC = new AbortController();
dot.addEventListener('click', handler, { signal: this.dotClickAC.signal });
```

适用于：频繁创建/销毁的临时监听器。优于 `cloneNode` 替换元素（会丢失 DOM 引用）。

### `destroy()` 必须清理所有资源

`destroy()` 是 `SelectionTranslator` 的完全清理入口，必须覆盖：

1. 所有 `document` 级事件监听器（通过 bound refs 移除）
2. `AbortController`（`.abort()` + 置 `null`）
3. 计时器（`clearTimeout`）
4. DOM 元素（`.remove()` + 置 `null`）
5. 状态标志重置（`active`、`dragging` 等）

## 并发队列调参约束

`translator.ts` 的翻译队列有三个关键常量，调整前需理解其影响：

| 常量                  | 值   | 作用                          | 调大的风险           | 调小的风险               |
| --------------------- | ---- | ----------------------------- | -------------------- | ------------------------ |
| `MAX_CONCURRENT`      | 3    | 同时进行的翻译请求数          | 触发 Google 429 限流 | 翻译速度变慢             |
| `REQUEST_INTERVAL_MS` | 100  | 请求间最小间隔                | 无明显收益           | 触发限流                 |
| `OBSERVER_TIMEOUT_MS` | 2000 | IntersectionObserver 分类超时 | 首屏延迟增大         | 可能无法完成所有元素分类 |

### 队列机制

```
enqueue(el) → activeRequests < MAX_CONCURRENT?
  ├─ Yes → 立即执行 translateElement → delay(100ms) → dequeue
  └─ No  → 推入 queue 等待 → dequeue 时取出执行
```

- **Session 取消** — `dequeue` 入口检查 `s.cancelled`，取消后队列中剩余任务被丢弃
- **可见区优先** — `IntersectionObserver` 将元素分为 `visible` 和 `offscreen`，visible 排在队列前面
- **禁止**在 `translateElement` 内部重新调用 `enqueue`（会死循环），重试通过 `renderError` 的 `onRetry` 回调直接调用 `translateElement`
