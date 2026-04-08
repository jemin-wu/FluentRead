# Design System

## Project Context

- **Framework**: Vanilla TypeScript (no UI framework — DOM manipulation via `document.createElement`)
- **CSS Approach**: Tailwind CSS v4 (popup + options pages) + plain CSS (content script injected styles)
- **Component Library**: None — all UI elements are custom-built
- **Build Tool**: WXT (Vite-based Chrome Extension framework)
- **Reference Template**: GOV.UK — minimalist, content-first

## Design Principles

FluentRead's implicit design philosophy, inferred from code patterns with quantitative evidence.

### 1. Content-first, zero-intrusion

The extension exists to serve the page's content, not to replace it. Translation output inherits every typographic property from the original element (`color: inherit`, `font-size: inherit`, `line-height: inherit`, `font-weight: inherit`, `letter-spacing: inherit` — 5 inherited properties in `.fluentread-translation`). The injected CSS never overrides the host page's layout beyond a `margin-top: 0.4em` separator. The content script uses `<all_urls>` matching but activates passively, waiting for an explicit message before doing anything.

- Evidence: `style.css` lines 16-20 (inherit chain), `index.ts` passive listener pattern, `renderer.ts` using `el.appendChild(div)` to stay inside the original element.

### 2. Graceful degradation over hard failure

Every external dependency has a fallback path. The Google Translate API retries 3 times with exponential backoff (`INITIAL_DELAY_MS = 1000`, doubling per attempt). Rate-limited responses (HTTP 429) trigger a 30-second pause rather than an error. Failed translations render a clickable "retry" element instead of silently dropping. The translation cache has TTL expiry (7 days), FIFO eviction (500 entries per domain), and a byte-size cap (8 MB). When `chrome.commands` is unavailable, the shortcut label silently omits itself.

- Evidence: `translate.ts` retry loop (3 attempts), `renderer.ts` `renderError` with retry callback, `storage.ts` multi-layer eviction, `popup/main.ts` `initShortcutLabel` catch block.

### 3. Progressive layering of complexity

The UI reveals features in layers. The popup shows the essential action (translate button) prominently, with mode toggle and language selection as secondary controls. Auto-translate and selection-translate are toggle switches tucked below. The options page adds cache management and site lists. Keyboard shortcuts (`Alt+T`, `Alt+M`) exist but are never required.

- Evidence: popup HTML layout order (language row, then action row, then toggles), wxt.config commands as optional accelerators, options page as a separate full-tab view.

### 4. Dark-mode parity

Every surface has both light and dark definitions. The project uses `@media (prefers-color-scheme: dark)` consistently across all 3 CSS files (5 total media queries). The popup defines 26 CSS custom properties for light mode and overrides 25 in the dark block (`--spring` easing is mode-independent). The options page defines 9 light tokens and overrides all 9 in dark. The content script defines dark variants for the dot trigger, tooltip card, loading dots, and error text.

- Evidence: 5 `prefers-color-scheme: dark` blocks across `content/style.css` (3), `popup/style.css` (1), `options/style.css` (1). Popup has 26 light tokens and 25 dark overrides. Options has 9 light tokens and 9 dark overrides. Content script dark block covers dot trigger, tooltip, handle, word/result text, actions, buttons, and focus rings.

### 5. Visibility-first translation ordering

The translator uses `IntersectionObserver` to classify elements as visible or offscreen, then translates visible elements first before queuing offscreen ones. This prioritizes the user's current viewport, making perceived performance faster than a top-to-bottom sequential approach. Concurrent requests are capped at 3 (`MAX_CONCURRENT = 3`) with 100ms spacing (`REQUEST_INTERVAL_MS = 100`).

- Evidence: `translator.ts` lines 186-227 (IntersectionObserver classification), `MAX_CONCURRENT = 3`, `REQUEST_INTERVAL_MS = 100`.

### 6. Site-aware adaptation

Rather than a one-size-fits-all selector, the extension uses a `SiteAdapter` system that provides per-hostname custom CSS selectors and style overrides. Twitter/X gets `[data-testid="tweetText"]` selectors and `-webkit-line-clamp: unset` fixes. A `MutationObserver` watches for dynamically loaded content (infinite scroll, "Show more" expansion) and re-translates new elements.

- Evidence: `site-adapters.ts` with 2 registered adapters (twitter.com, x.com), `index.ts` MutationObserver with 300ms debounce, `collectNewElements` and `collectModifiedElements` functions.

## Voice and Tone

### UI Language

The entire UI is written in Simplified Chinese. There is no i18n library (no `i18next`, `vue-i18n`, or `$t()` calls). All user-facing strings are hardcoded in Chinese. Developer comments are also in Chinese. The HTML documents declare `lang="zh-CN"`.

### Message Style

| Category               | Convention                   | Examples                                              |
| ---------------------- | ---------------------------- | ----------------------------------------------------- |
| Button labels — idle   | Verb (+ optional shortcut)   | `翻译`, `翻译 (Alt+T)`                                |
| Button labels — active | Verb + 中... (progressive)   | `翻译中...`                                           |
| Button labels — done   | Verb phrase (show original)  | `显示原文`                                            |
| Toggle labels          | Descriptive phrase           | `总是翻译该网站`, `划词翻译：显示小圆点`              |
| Section headings       | Noun phrase                  | `翻译设置`, `显示设置`, `站点管理`, `数据管理`        |
| Error messages         | Sentence, action instruction | `翻译失败，点击重试`                                  |
| Empty states           | Short declarative            | `暂无已配置站点`                                      |
| Placeholder text       | Future tense description     | `更多显示选项将在后续版本中提供。`                    |
| Destructive actions    | Verb + object                | `删除`, `清空翻译缓存`                                |
| Tooltips               | Instruction with click hint  | `点击切换双语模式`, `点击切换译文模式`                |
| Copy feedback          | Icon swap (checkmark)        | No text — `copyIcon()` becomes `checkIcon()` for 1.5s |

### Writing Rules

- **Capitalization**: N/A (Chinese does not have case). English-language references (product names, API names) use their canonical casing: `Google Translate`, `FluentRead`, `Alt+T`.
- **Verb form**: Imperative for actions (`翻译`, `删除`, `清空`). Progressive (`翻译中...`) for loading states. Declarative for descriptions (`暂无已配置站点`).
- **Tone**: Terse-technical. Labels are 2-8 characters. No conversational filler, no polite hedging, no emoji.
- **Language**: Primary UI language is zh-CN. HTML `lang="zh-CN"` on both pages. No multi-language support. The popup uses Chinese for all static labels; only the language selector shows localized language names (`日本語`, `Français`, etc.).
- **Message structure**: Errors are self-contained sentences with built-in recovery action (`翻译失败，点击重试`). Toasts do not exist — errors render inline. Success feedback uses icon animation (copy checkmark), not text.
- **Punctuation**: Chinese comma `，` separates clauses within a label. Colon `：` separates category from description in toggle labels. No trailing period on labels. Periods on full sentences in placeholder text.

## Design Tokens Baseline

### Typography

| Token / Value                                                                         | Where Used                         | Role                      |
| ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- |
| `Inter`                                                                               | Popup body                         | Primary UI font           |
| `DM Sans`                                                                             | Options page body, buttons         | Primary UI font (options) |
| `JetBrains Mono`                                                                      | Options page (cache size, domains) | Monospace data display    |
| `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif` | Content script tooltip             | System font stack         |
| `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace`                 | Content script code tags           | Monospace code            |

Font sizes in use: `11px` (4), `12px` (1), `13px` (14), `14px` (1), `15px` (7), `text-sm` / 14px (4), `text-base` / 16px (4), `text-2xl` / 24px (1), `0.9em` (1).

Font weights: `400` (1), `500` / `font-medium` (7), `600` / `font-semibold` (7), `700` / `font-bold` (2).

### Colors (Semantic Tokens)

**Popup (26 tokens in `:root`, 25 dark overrides — `--spring` not overridden):**

| Token                  | Light                                     | Dark                                      | Role                          |
| ---------------------- | ----------------------------------------- | ----------------------------------------- | ----------------------------- |
| `--bg`                 | `#f8f9fc`                                 | `rgba(17,19,24,0.8)`                      | Page background               |
| `--card`               | `rgba(255,255,255,0.8)`                   | `rgba(24,28,40,0.7)`                      | Card surface                  |
| `--card-border`        | `rgba(255,255,255,0.5)`                   | `rgba(255,255,255,0.07)`                  | Card border                   |
| `--card-shadow`        | `0 4px 16px rgba(16,24,40,0.03)`          | `0 4px 16px rgba(0,0,0,0.08)`             | Card shadow                   |
| `--panel`              | `rgba(241,243,248,0.67)`                  | `rgba(30,34,48,0.53)`                     | Inner panel surface           |
| `--panel-border`       | `rgba(226,229,237,0.4)`                   | `rgba(255,255,255,0.06)`                  | Inner panel border            |
| `--divider`            | `rgba(226,229,237,0.4)`                   | `rgba(255,255,255,0.04)`                  | Section divider               |
| `--text-1`             | `#1f2937`                                 | `#f1f3f9`                                 | Primary text                  |
| `--text-2`             | `#4b5563`                                 | `#94a0b8`                                 | Secondary text                |
| `--text-3`             | `#9ca3af`                                 | `#505a6e`                                 | Tertiary text                 |
| `--accent`             | `#4a90d9`                                 | `#6aadff`                                 | Brand / interactive           |
| `--accent-rgb`         | `74, 144, 217`                            | `106, 173, 255`                           | Accent for rgba()             |
| `--accent-hover`       | `#3a7bc8`                                 | `#5ba0e9`                                 | Accent hover state            |
| `--btn-gradient`       | `linear-gradient(180deg,#5b9fe6,#4a8dd4)` | `linear-gradient(180deg,#7ab8f5,#5a9de0)` | Translate button fill         |
| `--btn-glow`           | `0 4px 12px rgba(74,144,217,0.12)`        | `0 4px 16px rgba(106,173,255,0.15)`       | Button glow shadow            |
| `--toggle-bg`          | `#d5d9e2`                                 | `#2a2e3e`                                 | Toggle track (off)            |
| `--toggle-border`      | `rgba(200,205,216,0.4)`                   | `rgba(255,255,255,0.06)`                  | Toggle track border           |
| `--toggle-knob`        | `#ffffff`                                 | `#505a6e`                                 | Toggle knob                   |
| `--toggle-active`      | `#4a90d9`                                 | `#6aadff`                                 | Toggle track (on)             |
| `--arrow`              | `#b0b7c3`                                 | `#505a6e`                                 | Chevron/separator icon        |
| `--toggle-knob-active` | `#ffffff`                                 | `#ffffff`                                 | Toggle knob (on)              |
| `--tooltip-bg`         | `#1f2937`                                 | `#e2e5ed`                                 | Tooltip background (inverted) |
| `--tooltip-text`       | `#ffffff`                                 | `#111318`                                 | Tooltip text (inverted)       |
| `--outer-shadow`       | `0 12px 40px ..., 0 2px 8px ...`          | `0 12px 40px ..., 0 2px 8px ...`          | Popup card outer shadow       |
| `--outer-border`       | `rgba(255,255,255,0.4)`                   | `rgba(255,255,255,0.05)`                  | Popup card outer border       |
| `--spring`             | `cubic-bezier(0.34, 1.56, 0.64, 1)`       | _(not overridden)_                        | Overshoot easing curve        |

**Options (9 tokens, 9 dark overrides):**

| Token              | Light         | Dark            | Role                |
| ------------------ | ------------- | --------------- | ------------------- |
| `--accent`         | `#4a90d9`     | `#5ba0e9`       | Brand / interactive |
| `--bg`             | `#ffffff`     | `#1a1a1a`       | Page background     |
| `--surface`        | `#f8f9fa`     | `#2a2a2a`       | Section card        |
| `--border`         | `#e5e7eb`     | `#3a3a3a`       | Border / separator  |
| `--text-primary`   | `#1a1a1a`     | `#e5e5e5`       | Primary text        |
| `--text-secondary` | `#666666`     | `#aaaaaa`       | Secondary text      |
| `--text-muted`     | `#999999`     | `#777777`       | Muted / placeholder |
| `--error`          | `#ea4335`     | `#f87171`       | Destructive actions |
| `--error-rgb`      | `234, 67, 53` | `248, 113, 113` | Error for rgba()    |

**Content script (hardcoded, no tokens):** Uses raw hex values: `#9ca3af` (loading dots), `#ea4335` / `#f28b82` (error), `#1e293b` / `#f1f5f9` (tooltip word), `#475569` / `#b8c5d6` (tooltip result), `#94a3b8` / `#7b8ba3` (button icon). Blue accent: `#3b82f6` (light) / `#60a5fa` (dark).

### Spacing

76 Tailwind spacing utilities across the codebase. Most common patterns:

- Padding: `p-4` (cards), `p-5` (sections), `px-4` (rows), `py-2.5` (toggles), `px-6` (button)
- Gaps: `gap-3` (language row), `gap-2.5` (action row), `gap-0.5` (toggle section)
- Margins: `mb-4` (sections), `mt-px` (fine adjustments)
- Content script: raw values only (`margin-top: 0.4em`, `padding: 6px 16px 14px`, `gap: 4px/5px`)

### Border Radius

| Value               | Usage | Context                                  |
| ------------------- | ----- | ---------------------------------------- |
| `50%`               | 4     | Dots, loading circles, dot-trigger       |
| `rounded-[10px]`    | 4     | Popup pills, service select, mode button |
| `rounded-xl` (12px) | 5     | Translate button, options sections       |
| `rounded-lg` (8px)  | 3     | Options inputs, logo, remove button      |
| `14px`              | 1     | Tooltip card                             |
| `6px`               | 1     | Tooltip bubble (popup)                   |
| `4px`               | 2     | Code tag, site-remove button             |
| `2px`               | 1     | Drag handle bar                          |
| `rounded-full`      | 4     | Toggle track and knob                    |

### Motion

| Animation           | Duration | Easing                              | Purpose                             |
| ------------------- | -------- | ----------------------------------- | ----------------------------------- |
| `fluentread-fadein` | 250ms    | `ease-out`                          | Translation text appearance         |
| `fluentread-bounce` | 0.8s     | `ease-in-out`                       | Loading dots bounce (infinite)      |
| `fr-dot-enter`      | 320ms    | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Selection dot pop-in                |
| `fr-dot-breathe`    | 2.4s     | `ease-in-out`                       | Selection dot pulse ring (infinite) |
| `fr-card-enter`     | 280ms    | `cubic-bezier(0.16, 1, 0.3, 1)`     | Tooltip card slide-up               |
| `fadeUp`            | 300ms    | `ease-out`                          | Popup card entrance                 |
| `btn-pulse`         | 1.5s     | `ease-in-out`                       | Button loading pulse (infinite)     |

Transition durations: `100ms` (1), `150ms` (4), `160ms` (1), `180ms` (4), `200ms` (4), `280ms` (2).

Named easing curve: `--spring: cubic-bezier(0.34, 1.56, 0.64, 1)` — used for toggle knob and dot trigger overshoot.

### Shadows

14 `box-shadow` declarations total. The project uses multi-layer soft shadows:

- Popup: 2-layer ambient shadow (`--outer-shadow`, `--card-shadow`)
- Tooltip: 4-layer shadow with inset highlight (normal) + elevated 4-layer (dragging)
- Dot trigger: 3-layer glow shadow

### Backdrop Filter

2 blur surfaces: tooltip card (`blur(24px) saturate(1.6)`), popup card (`blur(20px)`).

## Component Catalog

### Architecture

The project has no component library. All UI is built with vanilla DOM APIs. The architecture has 3 layers:

| Layer              | Files                                                        | Role                                                            |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------- |
| **Content script** | `index.ts`, `translator.ts`, `renderer.ts`, `selection.ts`   | Injected into every page; translates and renders bilingual text |
| **Popup**          | `popup/index.html`, `popup/main.ts`, `popup/style.css`       | Extension popup; controls translation, mode, toggles            |
| **Options**        | `options/index.html`, `options/main.ts`, `options/style.css` | Full-tab settings page; language, sites, cache                  |

Supporting modules: `background.ts` (service worker), `translate.ts` (API client), `storage.ts` (cache), `dom-utils.ts` (element selection), `site-adapters.ts` (per-site overrides).

### UI Elements (not framework components)

| Element            | Built With                         | Variants / States                        |
| ------------------ | ---------------------------------- | ---------------------------------------- |
| Translate button   | `<button>` + CSS                   | idle, loading (pulse), done              |
| Mode toggle (A/文) | `<button>` + CSS class swap        | bilingual (`A/文`), target-only (`文`)   |
| Language selector  | `<select>` overlaid on styled pill | 8 language options                       |
| Toggle switch      | `<label>` + hidden `<input>` + CSS | on/off, disabled                         |
| Tooltip card       | JS-created `<div>`                 | loading (dots), result (text + copy btn) |
| Dot trigger        | JS-created `<div>`                 | breathing animation, hover scale         |
| Translation block  | JS-created `<div>`                 | loading, success, error (retry)          |
| Service selector   | Static `<div>`                     | Display-only (single service)            |
| Site list item     | JS-created `<div>`                 | domain + remove button                   |

### Icon System

No icon library. Icons are inline SVG strings (2 icons total):

- **Copy icon**: 14x14 clipboard SVG in `selection.ts` `copyIcon()`
- **Check icon**: 14x14 checkmark SVG in `selection.ts` `checkIcon()`
- **Chevron arrows**: Inline SVG in popup HTML (3 chevrons, 1 arrow)

## Layout System

### Page Templates

| Page    | Structure                                                              | Width                   |
| ------- | ---------------------------------------------------------------------- | ----------------------- |
| Popup   | Fixed `360px` card, stacked rows (language, service, actions, toggles) | `w-[360px]`             |
| Options | Centered column, `max-w-[600px]`, stacked sections                     | `max-w-[600px] mx-auto` |
| Content | No layout — elements injected inline into host page DOM                | Host page width         |

### Responsive Strategy

No responsive breakpoints. Zero usage of `sm:`, `md:`, `lg:`, `xl:` prefixes. The popup has a fixed width. The options page uses `max-w-[600px]` with `mx-auto` centering. This is appropriate for a browser extension where the popup is a fixed-size panel and the options page opens in a browser tab.

## Interaction Patterns

### Keyboard Shortcuts

| Scope                   | Key      | Action                  |
| ----------------------- | -------- | ----------------------- |
| Global (Chrome command) | `Alt+T`  | Toggle translate        |
| Global (Chrome command) | `Alt+M`  | Toggle display mode     |
| Selection tooltip       | `Escape` | Dismiss dot and tooltip |

### Mouse Interactions

- **Selection translate**: mouseup after text selection shows a breathing dot; clicking the dot triggers translation in a frosted-glass tooltip card.
- **Drag**: Tooltip card has a drag handle (grab cursor bar). Drag uses `mousedown` + `mousemove` + `mouseup` with offset tracking. During drag, the card elevates (larger shadow, `scale(1.02)`).
- **Copy**: Click copy button in tooltip. Icon swaps to checkmark for 1.5s as confirmation.
- **Dismiss**: Clicking outside the tooltip or dot dismisses them. Escape key also dismisses.

## Accessibility Baseline

### Coverage

| Feature                  | Status  | Details                                                                                                                                                                                         |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role` attributes        | Partial | 2 `role="note"` on translation containers, 1 `role="button"` on error retry (renderer.ts). 1 `role="code"` used as exclusion selector (dom-utils.ts). No roles on interactive tooltip elements. |
| `aria-label`             | Partial | 4 `aria-label` attributes: "translation" (2), "翻译失败，点击重试" (1), "复制翻译" (1). None on popup buttons.                                                                                  |
| `aria-live`              | Minimal | 1 `aria-live="polite"` on loading placeholder. Translation completion and error states do not use live regions.                                                                                 |
| `tabIndex`               | Partial | 1 `tabIndex` on error retry element (renderer.ts). Tooltip card and dot trigger are not keyboard-focusable.                                                                                     |
| Focus visible styling    | Good    | `focus-visible` rings on popup buttons (translate, mode, toggles, lang pill), options page buttons, content script tooltip button, and error retry element.                                     |
| `prefers-reduced-motion` | Full    | 2 reduced-motion media queries (content/style.css, popup/style.css) disable all 7 animations for users who prefer reduced motion.                                                               |
| Keyboard navigation      | Minimal | Only `Escape` to dismiss selection tooltip. No keyboard activation for dot trigger. No focus trapping in tooltip.                                                                               |
| A11y tooling             | None    | No `eslint-plugin-jsx-a11y`, `axe-core`, `jest-axe`, or `vitest-axe` in dependencies.                                                                                                           |

### Gaps

1. **Tooltip card not keyboard-accessible**: The dot trigger and tooltip card are created via JS and lack `tabIndex`, `role="dialog"`, or focus trapping. Keyboard-only users cannot activate selection translation.
2. ~~**No reduced-motion support**~~: Fixed — `prefers-reduced-motion: reduce` media queries added to content and popup CSS.
3. ~~**Missing labels on interactive elements**~~: Fixed — copy button now has `aria-label="复制翻译"`. Error retry has `role="button"`, `tabindex="0"`, `aria-label`, and keyboard activation.
4. ~~**No focus ring on popup controls**~~: Fixed — `focus-visible` rings added to all interactive elements across popup, options, and content script.

## Consistency Rules

1. **Typography — popup font**: Use `Inter` for the popup UI. Do not introduce additional sans-serif fonts in the popup.
2. **Typography — options font**: Use `DM Sans` for the options page body text and `JetBrains Mono` for technical data values.
3. **Typography — content script**: Use system font stacks only. Never load external fonts in the content script (it runs on every page).
4. **Color — semantic tokens**: Use CSS custom properties (`--text-1`, `--accent`, etc.) in popup and options. Every light token must have a dark override.
5. **Color — content script**: Content script CSS uses raw hex/rgba values since it cannot share CSS custom properties with host pages. Keep the blue accent family consistent: `#3b82f6` / `#60a5fa` (light/dark).
6. **Spacing — popup**: Use Tailwind spacing utilities. Prefer `p-4`, `px-4`, `py-2.5`, `gap-2.5` patterns already established.
7. **Border radius**: Use `rounded-[10px]` for popup pills/panels, `rounded-xl` for primary buttons and sections, `rounded-lg` for inputs and small buttons, `rounded-full` for circular elements.
8. **Motion — duration range**: Keep transitions between 100ms-300ms. Entrance animations: 250-320ms. Infinite animations: 0.8s-2.4s.
9. **Motion — easing**: Use `--spring` (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for overshoot effects (toggle, dot pop-in). Use `ease-out` for entrances. Use `ease-in-out` for infinite loops.
10. **Shadows**: Use multi-layer soft shadows (ambient + highlight). Tooltip and card shadows should use the established 3-4 layer pattern.
11. **Backdrop filter**: Frosted glass (`backdrop-filter: blur(20-24px)`) is the established surface treatment for floating cards. Do not use opaque backgrounds for floating UI.
12. **Dark mode**: Every new CSS must include a `@media (prefers-color-scheme: dark)` override. Do not use class-based dark mode toggling.
13. **Voice and tone**: All UI strings in zh-CN. Labels are 2-8 Chinese characters. Use imperative verbs for actions, progressive (`...中`) for loading states, declarative for empty states.
14. **Component construction**: Build all UI with vanilla DOM APIs (`document.createElement`). Do not introduce a UI framework for individual elements.
15. **Layout — popup**: Fixed `360px` width. Stacked row layout with `flex` containers. Do not add scrolling or variable-width behavior.
16. **Keyboard shortcuts**: Register shortcuts via `chrome.commands` in `wxt.config.ts`. Display shortcut text in button labels when available.
17. **Accessibility**: All translation containers must have `role="note"` and `aria-label`. Loading states must use `aria-live="polite"`.
18. **Interaction states**: Use `opacity` reduction for disabled states. Use `pointer-events: none` to prevent interaction during loading. Use `cursor: not-allowed` for disabled controls.

## Success Thresholds

| Criterion                 | Threshold                                                    | What it measures              |
| ------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Dark mode coverage        | 100% of new CSS has dark override                            | No light-only additions       |
| Semantic token usage      | 0 raw hex colors in popup/options new code                   | Token system discipline       |
| ARIA on injected elements | Every `.fluentread-*` interactive element has role + label   | Content script a11y           |
| Animation duration        | 100ms-2400ms range                                           | No jarring or sluggish motion |
| Font stack consistency    | 0 new font-family declarations without justification         | Typography discipline         |
| Chinese string quality    | All new UI strings reviewed for tone consistency             | Voice coherence               |
| Tailwind class reuse      | New popup/options code uses existing spacing/radius patterns | Visual consistency            |

## Anti-Pattern Exceptions

- **Raw hex in content script CSS**: The content script cannot use CSS custom properties that would collide with host page variables. Raw values are intentional, not drift. The `fluentread-` prefix on all class names prevents namespace collision.
- **Two different sans-serif fonts (Inter vs DM Sans)**: The popup and options pages serve different contexts. Inter is optimized for small UI at 360px width. DM Sans suits the wider options page with longer text. This is a deliberate choice, not an oversight.
- **No responsive breakpoints**: Browser extension popups are fixed-size panels. The options page is a simple centered column. Responsive design adds complexity without value in this context.
- **No i18n**: The target user base is Chinese-speaking. Internationalization is deferred until there is demand for other UI languages. The product itself translates web content into Chinese — the UI language matches the audience.
- **`innerHTML` usage in selection.ts**: SVG icon strings are hardcoded constants (not user input), so `innerHTML` is safe. The alternative (`createElementNS` for each SVG path) would be significantly more verbose for no security benefit.
