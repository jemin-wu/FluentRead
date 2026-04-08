/**
 * Content Script 入口 — 消息监听 + 翻译控制
 */

import './style.css';
import { translatePage, translateElements, isSessionActive, cancelTranslation } from './translator';
import { removeAllTranslations, removeTranslation } from './renderer';
import { initSelection, destroySelection } from './selection';
import { getSiteAdapter, injectAdapterCss } from '@/utils/site-adapters';
import { getTranslatableElements, deduplicateContained } from '@/utils/dom-utils';
import { loadCache, flushCache } from '@/utils/storage';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let currentMode = 'bilingual';
    let targetLang = 'zh-CN';
    let isTranslating = false;

    const adapter = getSiteAdapter();
    if (adapter) injectAdapterCss(adapter);

    // 加载翻译缓存（不阻塞初始化，首次 doTranslate 前会 await）
    const cacheReady = loadCache();

    // 页面隐藏/关闭时持久化缓存
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushCache().catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
      flushCache().catch(() => {});
    });

    // MutationObserver 状态
    let mutationObserver: MutationObserver | null = null;
    let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const MUTATION_DEBOUNCE_MS = 300;
    const MAX_PENDING_MUTATIONS = 500;
    const adapterSelectorStr = adapter ? adapter.selectors.join(',') : '';

    function collectNewElements(mutations: MutationRecord[]): HTMLElement[] {
      if (!adapter) return [];
      const added: HTMLElement[] = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          // 节点自身匹配时直接收集，跳过子树扫描（避免重复 querySelectorAll）
          if (el.matches(adapterSelectorStr) && !el.querySelector('.fluentread-translation')) {
            added.push(el);
          } else {
            // 仅当节点自身不匹配时才扫描子树
            for (const child of getTranslatableElements(el, adapter)) {
              // 排除已有译文或正在翻译的元素
              if (!child.querySelector('.fluentread-translation')) {
                added.push(child);
              }
            }
          }
        }
      }
      return deduplicateContained([...new Set(added)]);
    }

    function collectModifiedElements(mutations: MutationRecord[]): HTMLElement[] {
      if (!adapter) return [];
      const modified: HTMLElement[] = [];
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        // 跳过 FluentRead 自身注入/移除译文造成的 mutation，避免无限循环
        const isOwnMutation = [...mutation.addedNodes, ...mutation.removedNodes].some(
          (n) =>
            n.nodeType === Node.ELEMENT_NODE &&
            (n as HTMLElement).classList?.contains('fluentread-translation'),
        );
        if (isOwnMutation) continue;
        const target = mutation.target as HTMLElement;
        if (!target || target.nodeType !== Node.ELEMENT_NODE) continue;
        // 找到最近的 adapter 选择器匹配的祖先（含自身）
        const translatedParent = target.closest(adapterSelectorStr) as HTMLElement | null;
        if (translatedParent && translatedParent.querySelector('.fluentread-translation')) {
          modified.push(translatedParent);
        }
      }
      return [...new Set(modified)];
    }

    function handleMutations(mutations: MutationRecord[]) {
      if (!isSessionActive()) return;
      const newEls = collectNewElements(mutations);

      // 检测已翻译元素的内容变化（如 Twitter "Show more" 展开长推文）
      const modifiedEls = collectModifiedElements(mutations);
      for (const el of modifiedEls) {
        removeTranslation(el);
      }

      const allEls = [...new Set([...newEls, ...modifiedEls])];
      if (allEls.length === 0) return;
      translateElements(allEls, targetLang).catch((err) =>
        console.error('[FluentRead] MutationObserver translate error', err),
      );
    }

    function startMutationObserver() {
      if (mutationObserver) return;
      let pendingMutations: MutationRecord[] = [];
      mutationObserver = new MutationObserver((mutations) => {
        pendingMutations.push(...mutations);
        // 防止快速滚动时无限积累 MutationRecord（持有 DOM 引用）
        if (pendingMutations.length > MAX_PENDING_MUTATIONS) {
          pendingMutations = pendingMutations.slice(-MAX_PENDING_MUTATIONS);
        }
        if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(() => {
          const batch = pendingMutations;
          pendingMutations = [];
          handleMutations(batch);
        }, MUTATION_DEBOUNCE_MS);
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    function stopMutationObserver() {
      if (mutationDebounceTimer) {
        clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = null;
      }
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
    }

    async function getTargetLang(): Promise<string> {
      try {
        const result = await chrome.storage.local.get('targetLang');
        if (result.targetLang) targetLang = result.targetLang as string;
      } catch {
        // Use default
      }
      return targetLang;
    }

    async function doTranslate(lang?: string) {
      isTranslating = true;
      stopMutationObserver(); // 重新翻译时先停止旧的观察者
      try {
        await cacheReady; // 确保缓存已加载
        const tl = lang || (await getTargetLang());
        await translatePage(tl, adapter);
        chrome.runtime.sendMessage({ type: 'translateComplete' }).catch(() => {});
        if (currentMode === 'selection') {
          initSelection(tl);
        }
        // 翻译完成后启动 MutationObserver（仅 adapter 站点）
        if (adapter) {
          startMutationObserver();
        }
      } finally {
        isTranslating = false;
      }
      // 翻译完成后，如果当前是仅译文模式，对新译文应用 target-only 样式
      if (currentMode === 'target-only') {
        doSwitchMode();
      }
    }

    async function doCancel() {
      isTranslating = false;
      stopMutationObserver();
      const wasSelection = currentMode === 'selection';
      cancelTranslation();
      removeAllTranslations();
      currentMode = 'bilingual';
      if (wasSelection) {
        destroySelection();
      }
    }

    async function doSwitchMode(mode?: string) {
      if (isTranslating) return;
      if (mode) currentMode = mode;

      if (currentMode === 'selection') {
        const tl = await getTargetLang();
        initSelection(tl);
      } else {
        destroySelection();
      }

      const translated = document.querySelectorAll('.fluentread-translation');
      if (translated.length > 0) {
        translated.forEach((t) => {
          // 跳过加载中的占位符 — 不应对未完成翻译的元素隐藏原文
          if (t.classList.contains('fluentread-loading')) return;
          const parent = t.parentElement;
          if (!parent) return;
          if (currentMode === 'target-only') {
            const computed = getComputedStyle(parent);
            parent.style.setProperty('--fr-font-size', computed.fontSize);
            parent.style.setProperty('--fr-line-height', computed.lineHeight);
            parent.classList.add('fluentread-target-only');
          } else {
            parent.classList.remove('fluentread-target-only');
            parent.style.removeProperty('--fr-font-size');
            parent.style.removeProperty('--fr-line-height');
          }
        });
      }
    }

    // SPA 路由变化时回收 MutationObserver 和翻译状态
    let lastUrl = location.href;
    const checkUrlChange = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        stopMutationObserver();
        cancelTranslation();
        removeAllTranslations();
        isTranslating = false;
        currentMode = 'bilingual';
      }
    };
    window.addEventListener('popstate', checkUrlChange);
    // 拦截 pushState/replaceState（SPA 路由库通常用这两个 API）
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = function (...args) {
      origPushState(...args);
      checkUrlChange();
    };
    history.replaceState = function (...args) {
      origReplaceState(...args);
      checkUrlChange();
    };

    // 启动时检查划词翻译状态
    chrome.storage.local.get(['selectionEnabled', 'targetLang'], (result) => {
      if (result.targetLang) targetLang = result.targetLang as string;
      if (result.selectionEnabled) {
        initSelection(targetLang);
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const { type, lang, mode, enabled } = message;

      let promise: Promise<void>;
      switch (type) {
        case 'translate':
          promise = doTranslate(lang);
          break;
        case 'cancel':
          promise = doCancel();
          break;
        case 'switchMode':
          promise = doSwitchMode(mode);
          break;
        case 'toggleSelection':
          if (enabled) {
            initSelection(targetLang);
          } else {
            destroySelection();
          }
          sendResponse({ success: true });
          return;
        default:
          sendResponse({ error: `Unknown type: ${type}` });
          return;
      }

      sendResponse({ success: true });
      promise.catch((err) => console.error('[FluentRead]', err));
      return false;
    });
  },
});
