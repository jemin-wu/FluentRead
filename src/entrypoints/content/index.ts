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
        if (result.targetLang) targetLang = result.targetLang;
      } catch {
        // Use default
      }
      return targetLang;
    }

    async function doTranslate(lang?: string) {
      const tl = lang || (await getTargetLang());
      await translatePage(tl);
      if (currentMode === 'selection') {
        initSelection(tl);
      }
    }

    async function doCancel() {
      cancelTranslation();
      removeAllTranslations();
      if (currentMode === 'selection') {
        destroySelection();
      }
      currentMode = 'bilingual';
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
            parent.classList.add('fluentread-target-only');
          } else {
            parent.classList.remove('fluentread-target-only');
          }
        });
      }
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const { type, lang, mode } = message;

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
