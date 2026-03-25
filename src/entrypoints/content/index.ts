/**
 * Content Script 入口 — 消息监听 + 翻译控制
 */

import './style.css';
import { translatePage, cancelTranslation } from './translator';
import { removeAllTranslations } from './renderer';
import { initSelection, destroySelection } from './selection';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let currentMode = 'bilingual';
    let targetLang = 'zh-CN';

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
      const tl = lang || (await getTargetLang());
      await translatePage(tl);
      // 翻译完成后，如果当前是仅译文模式，对新译文应用 target-only 样式
      if (currentMode === 'target-only') {
        await doSwitchMode();
      }
      chrome.runtime.sendMessage({ type: 'translateComplete' }).catch(() => {});
      if (currentMode === 'selection') {
        initSelection(tl);
      }
    }

    async function doCancel() {
      const wasSelection = currentMode === 'selection';
      cancelTranslation();
      removeAllTranslations();
      currentMode = 'bilingual';
      if (wasSelection) {
        destroySelection();
      }
    }

    async function doSwitchMode(mode?: string) {
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
