# 测试规范

Vitest + jsdom 环境。测试文件放在 `tests/` 目录，命名 `*.test.ts`。

## 环境配置

```typescript
// vitest.config.ts
test: {
  environment: 'jsdom',  // DOM 环境
  globals: true,          // describe/it/expect 无需 import
}
resolve: {
  alias: { '@': path.resolve(__dirname, 'src') }  // 与源码路径别名一致
}
```

## Chrome API Mock 模式

项目不使用 mock 库（无 `webextension-polyfill-mock`），手工在 `globalThis` 上构建最小 chrome 对象。

### 基本模板

```typescript
const mockSendMessage = vi.fn().mockResolvedValue({});
const mockStorageGet = vi.fn().mockImplementation((_keys: any, cb?: any) => {
  if (cb) cb({}); // chrome.storage.local.get 支持 callback 和 Promise 两种调用方式
  return Promise.resolve({});
});

(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: { get: mockStorageGet, set: vi.fn().mockResolvedValue(undefined) },
    sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
  },
  // 按需添加 tabs、commands 等
};
```

### 约定

- 每个测试文件独立构建自己的 chrome mock，不共享全局 fixture
- `chrome.storage.local.get` 必须同时支持 callback 风格（popup 用）和 Promise 风格（background 用）
- 事件监听器（`onMessage.addListener`、`onCommand.addListener`）用 `vi.fn()` mock，通过 `.mock.calls[0][0]` 获取注册的回调再手动调用
- WXT 全局函数 mock：`(globalThis as any).defineBackground = vi.fn((fn) => fn)`

## jsdom Polyfill

jsdom 缺少若干浏览器 API，需要在测试中 polyfill：

### IntersectionObserver

```typescript
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // 立即报告所有元素为可见
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
```

### innerText

jsdom 不实现 `innerText`，需在 `beforeEach` 中 polyfill：

```typescript
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
    configurable: true,
  });
});
```

## `_internals` Stub 模式

`translate.ts` 暴露 `_internals.delay` 用于测试时替换延迟函数，避免 mock 全局 `setTimeout`：

```typescript
import { _internals } from '../src/services/translate';

const originalDelay = _internals.delay;

beforeEach(() => {
  _internals.delay = vi.fn(() => Promise.resolve()); // 立即 resolve，跳过等待
});

afterEach(() => {
  _internals.delay = originalDelay; // 恢复原始实现
});
```

这比 `vi.useFakeTimers()` 更精确——只 stub 翻译模块的延迟，不影响其他 timer。

## Popup 测试模式

Popup 的 `main.ts` 在模块加载时注册 `DOMContentLoaded` 监听器，测试需要特殊处理：

### 步骤

1. `vi.resetModules()` — 清除模块缓存，确保每个 test 拿到干净的模块实例
2. `setupPopupDOM()` — 构建最小 DOM fixture（只包含 `main.ts` 查询的元素 ID）
3. `await import('../src/entrypoints/popup/main')` — 动态 import 触发模块求值
4. `document.dispatchEvent(new Event('DOMContentLoaded'))` — 手动触发初始化
5. `await vi.advanceTimersByTimeAsync(0)` — flush 异步的 `loadTranslateState`

### DOMContentLoaded 泄漏防护

```typescript
// 追踪注册的 listener，测试间清理
const domContentLoadedListeners: EventListener[] = [];
const origAddEventListener = document.addEventListener.bind(document);
document.addEventListener = ((type: string, listener: any, ...args: any[]) => {
  if (type === 'DOMContentLoaded') domContentLoadedListeners.push(listener);
  return origAddEventListener(type, listener, ...args);
}) as typeof document.addEventListener;

afterEach(() => {
  for (const l of domContentLoadedListeners) document.removeEventListener('DOMContentLoaded', l);
  domContentLoadedListeners.length = 0;
});
```

### 状态机验证

Popup 按钮有三态：`idle` → `loading` → `done`。测试时通过以下方式驱动状态转换：

| 操作                                                   | 状态变化                   |
| ------------------------------------------------------ | -------------------------- |
| `btn.click()` (idle)                                   | → loading                  |
| `listener({ type: 'translateComplete' })`              | loading → done             |
| `btn.click()` (done)                                   | → idle（发送 cancel）      |
| `vi.advanceTimersByTimeAsync(30_000)`                  | loading → idle（超时恢复） |
| `langSelect.dispatchEvent(new Event('change'))` (done) | → loading（重新翻译）      |

## vi.mock 依赖隔离

Content script 模块间依赖较多，测试单个模块时用 `vi.mock` 隔离：

```typescript
// translator.test.ts — 隔离翻译 API 和渲染
vi.mock('../src/services/translate', () => ({
  translateText: vi.fn().mockResolvedValue('translated'),
}));
vi.mock('../src/utils/storage', () => ({
  getFromCache: vi.fn().mockReturnValue(null),
  saveToCache: vi.fn(),
}));
vi.mock('../src/entrypoints/content/renderer', () => ({
  renderTranslation: vi.fn(),
  renderLoading: vi.fn(),
  renderError: vi.fn(),
}));
```

## 测试文件组织

| 文件                              | 测试对象                              |
| --------------------------------- | ------------------------------------- |
| `dom-utils.test.ts`               | 元素选择/过滤逻辑                     |
| `translate.test.ts`               | Google Translate API 封装、重试、限流 |
| `renderer.test.ts`                | 译文 DOM 注入/移除                    |
| `storage.test.ts`                 | 翻译缓存（djb2、TTL、FIFO 淘汰）      |
| `translator-session.test.ts`      | 翻译 session 生命周期                 |
| `translator-placeholders.test.ts` | Placeholder 提取/还原                 |
| `selection.test.ts`               | 划词翻译 UI                           |
| `popup-timeout.test.ts`           | Popup 按钮状态机 + 超时恢复           |
| `service-worker.test.ts`          | Background 消息路由、快捷键、自动翻译 |
| `site-adapters.test.ts`           | 站点适配器匹配                        |
