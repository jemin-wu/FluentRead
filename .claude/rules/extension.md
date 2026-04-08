# Chrome Extension 规范

此文件覆盖消息通信、Service Worker、WXT 框架、Storage、Site Adapter 的行为约束。
DOM 读写和 CSS 注入归 `content-script.md`。

## 消息通信协议

三方通过 `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` 通信：

```
Popup ──sendMessage──→ Background ──tabs.sendMessage──→ Content Script
                       Background ←──sendMessage──── Content Script
```

### 消息类型表

| type                    | 方向        | 携带字段  | 说明                       |
| ----------------------- | ----------- | --------- | -------------------------- |
| `translate`             | popup→bg→cs | `lang?`   | 开始翻译，可选指定目标语言 |
| `translateComplete`     | cs→bg→popup | —         | 翻译完成通知               |
| `cancel`                | popup→bg→cs | —         | 取消翻译                   |
| `switchMode`            | popup→bg→cs | `mode?`   | 切换显示模式               |
| `toggleSelection`       | popup→bg→cs | `enabled` | 开关划词翻译               |
| `getTranslateState`     | popup→bg    | —         | 查询当前 tab 翻译状态      |
| `toggleAutoTranslate`   | popup→bg    | —         | 切换当前域名自动翻译       |
| `getAutoTranslateState` | popup→bg    | —         | 查询当前域名自动翻译状态   |

### 约定

- Background 用 `sender.tab?.id` 确定消息来源 tab，不依赖 `activeTab` 查询。当 `sender.tab` 不可用时（popup 发出的消息）才 fallback 到 `chrome.tabs.query`。
- `sendToTab` 封装了 `chrome.tabs.sendMessage`，content script 未就绪时 catch 静默忽略。
- 新增消息类型时，必须在 `background.ts:handleMessage` 的 switch 和 `content/index.ts` 的 listener switch 中同时添加处理。

## Service Worker 生命周期

- Background 使用 `defineBackground(() => { ... })` 注册，WXT 自动处理 Service Worker 注册。
- **Tab 状态追踪** — `tabStates: Map<number, 'loading' | 'done'>` 追踪每个 tab 的翻译状态。页面导航（`onUpdated` status='complete'）时重置。Tab 关闭（`onRemoved`）时清理。
- **快捷键守卫** — `toggle-mode` 在 tab 处于 `loading` 状态时被阻止，防止翻译进行中切换模式。

## WXT 框架约定

- `defineBackground` 和 `defineContentScript` 是 WXT 注入的全局函数，**不需要 import**。ESLint `globals` 中已声明为 `readonly`。
- TypeScript 类型检查使用 WXT 生成的 tsconfig：`tsc --project .wxt/tsconfig.json --noEmit`（不是根目录 tsconfig）。
- 路径别名 `@/` → `src/`，在 `wxt.config.ts` 的 `srcDir: 'src'` 和 `vitest.config.ts` 的 `resolve.alias` 中配置。
- Manifest 字段在 `wxt.config.ts` 的 `manifest` 对象中声明（permissions、commands 等），不要手动编辑 manifest.json。

## Storage 四层分层

| 层                       | API                      | 存储内容                                                                     | 语义                            |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------- | ------------------------------- |
| In-memory `Map`          | `cache` 变量             | 翻译缓存热层                                                                 | 当前页面会话内的快速查找        |
| `chrome.storage.session` | `chrome.storage.session` | `tabStates`（tab 翻译状态）                                                  | SW 重启后保持，浏览器关闭即失效 |
| `chrome.storage.local`   | `chrome.storage.local`   | `targetLang`、`selectionEnabled`、`displayMode`、`fluentread_cache_{domain}` | 设备本地数据，不跨设备同步      |
| `chrome.storage.sync`    | `chrome.storage.sync`    | `defaultLang`、`autoTranslateSites`                                          | 用户偏好，跨设备同步            |

### 决策标准

- **用户偏好**（语言默认值、自动翻译站点列表）→ `sync`，跨设备一致
- **会话状态**（当前页的目标语言、显示模式、划词开关）→ `local`，设备独立
- **SW 生命周期状态**（tab 翻译进度）→ `session`，SW 重启后恢复，浏览器关闭后丢弃
- **翻译缓存**（per-domain，`fluentread_cache_` 前缀）→ `local`，数据量大不适合 sync
- **热数据**（当前页面已翻译的文本）→ in-memory `Map`，页面刷新即失效

### 缓存约定

- Key = `djb2(text + targetLang)`，hash 算法在 `storage.ts:djb2`
- 淘汰策略：FIFO，每域名 `MAX_ENTRIES_PER_DOMAIN = 500`，总大小 `MAX_TOTAL_BYTES = 8MB`
- TTL = 7 天，读取时检查过期
- 持久化通过 `flushCache()` 显式触发

## Site Adapter 扩展约定

当默认的 `TRANSLATABLE_TAGS`（p, li, h1-h6 等）无法覆盖某站点时，通过 `SiteAdapter` 提供自定义选择器。

### 新增 Adapter 步骤

1. 在 `site-adapters.ts` 的 `ADAPTERS` Record 中添加 `hostname → SiteAdapter` 映射
2. `selectors` 数组：使用该站点的 DOM testid 或稳定属性选择器（如 `[data-testid="tweetText"]`）
3. `extraCss`（可选）：修复站点特定的样式问题（如 `-webkit-line-clamp: unset`），用 `!important`
4. Adapter 激活后，`shouldSkipElement` 跳过 `EXCLUDED_SELECTORS` 的容器检查（`skipContainerCheck=true`），但文本长度、CJK、代码检测仍生效
5. `content/index.ts` 的 `MutationObserver` 仅在有 adapter 时启动——通用站点不监听动态内容

### 现有 Adapter

```typescript
// twitter.com / x.com
selectors: ['[data-testid="tweetText"]', '[data-testid="card.description"]']
extraCss: // 解除 line-clamp 限制，让译文完整显示
```

### 注意事项

- 一个 `SiteAdapter` 可映射到多个 hostname（如 `twitter.com` 和 `x.com` 共享同一个对象）
- `injectAdapterCss` 有 `injectedCss` 守卫，确保 extraCss 只注入一次
- `collectModifiedElements`（`index.ts`）检测已翻译元素的内容变化（如 Twitter "Show more"），移除旧译文后重新翻译

## Popup 状态机

`popup/main.ts` 的翻译按钮是三态机，由 `setBtnState` 驱动。修改 popup 交互时必须遵守以下约束：

### 状态转换表

```
idle ──点击──→ loading ──translateComplete──→ done ──点击──→ idle（发送 cancel）
                  │                                          │
                  └──30s 超时──→ idle（安全回退）              └──切换语言──→ loading（重新翻译）
```

### Loading 锁定

`setBtnState('loading')` 会同时锁定以下 UI 元素，防止翻译进行中的无效操作：

| 元素                        | 锁定方式                                   | 变量     |
| --------------------------- | ------------------------------------------ | -------- |
| 模式切换按钮 `#mode-toggle` | `pointerEvents: 'none'` + `disabled` class | `locked` |
| 语言选择器 `.lang-pill`     | `pointerEvents: 'none'` + `disabled` class | `locked` |
| 翻译按钮自身                | `pointerEvents: 'none'` + `loading` class  | —        |

### 约定

- **超时恢复** — `LOADING_TIMEOUT_MS = 30_000`，loading 状态超时后自动回退到 idle，防止 UI 卡死
- **幂等清理** — `setBtnState` 入口必须先清除上一次的 `loadingTimeout`，避免残留 timer 干扰
- **translateComplete 守卫** — `onMessage` 监听只在 `btnState === 'loading'` 时才响应 `translateComplete`，避免过期消息污染状态
- **快捷键同步** — `translateShortcut` 变量缓存快捷键文本，`idle` 状态按钮显示 `翻译 (Alt+T)`
