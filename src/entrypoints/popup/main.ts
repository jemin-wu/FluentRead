/**
 * Popup script for FluentRead.
 */

import './style.css';

const LANG_NAMES: Record<string, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
};

let currentMode = 'bilingual';
type BtnState = 'idle' | 'loading' | 'done';
let btnState: BtnState = 'idle';
let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
const LOADING_TIMEOUT_MS = 30_000;

function send(message: Record<string, unknown>) {
  return chrome.runtime.sendMessage(message);
}

/* ── Language selector ── */

function initLanguageSelect() {
  const select = document.getElementById('target-lang') as HTMLSelectElement;
  const label = document.getElementById('target-lang-text')!;

  chrome.storage.local.get('targetLang', (result) => {
    if (result.targetLang) {
      select.value = result.targetLang as string;
      label.textContent = LANG_NAMES[select.value] || select.value;
    }
  });

  select.addEventListener('change', () => {
    const lang = select.value;
    label.textContent = LANG_NAMES[lang] || lang;
    chrome.storage.local.set({ targetLang: lang });
    if (btnState === 'done') {
      setBtnState('loading');
      send({ type: 'translate', lang });
    }
  });
}

/* ── Mode toggle (A/文 button) ── */

function updateModeButton(btn: HTMLElement) {
  const isTargetOnly = currentMode === 'target-only';
  btn.classList.toggle('target-only', isTargetOnly);
  btn.dataset.tooltip = isTargetOnly ? '点击切换双语模式' : '点击切换译文模式';
}

function initModeToggle() {
  const btn = document.getElementById('mode-toggle')!;
  btn.removeAttribute('title');

  chrome.storage.local.get('displayMode', (result) => {
    if (result.displayMode) {
      currentMode = result.displayMode as string;
    }
    updateModeButton(btn);
  });

  btn.addEventListener('click', () => {
    currentMode = currentMode === 'bilingual' ? 'target-only' : 'bilingual';
    chrome.storage.local.set({ displayMode: currentMode });
    updateModeButton(btn);
    send({ type: 'switchMode', mode: currentMode });
  });
}

/* ── Translate button ── */

function setBtnState(state: BtnState) {
  btnState = state;
  const btn = document.getElementById('translate-btn')!;

  btn.classList.remove('loading');

  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  switch (state) {
    case 'idle':
      btn.textContent = '翻译 (⌥A)';
      btn.style.pointerEvents = '';
      break;
    case 'loading':
      btn.textContent = '翻译中...';
      btn.classList.add('loading');
      btn.style.pointerEvents = 'none';
      loadingTimeout = setTimeout(() => {
        if (btnState === 'loading') setBtnState('idle');
      }, LOADING_TIMEOUT_MS);
      break;
    case 'done':
      btn.textContent = '显示原文';
      btn.style.pointerEvents = '';
      break;
  }
}

function initTranslateButton() {
  const btn = document.getElementById('translate-btn')!;

  btn.addEventListener('click', () => {
    if (btnState === 'idle') {
      setBtnState('loading');
      send({ type: 'translate' });
    } else if (btnState === 'done') {
      setBtnState('idle');
      send({ type: 'cancel' });
    }
    // loading 状态下忽略点击
  });
}

/* ── Auto-translate toggle ── */

function initAutoToggle() {
  const toggle = document.getElementById('toggle-auto') as HTMLInputElement;
  toggle.addEventListener('change', () => {
    send({ type: 'toggleAutoTranslate' });
  });
}

/* ── Selection toggle ── */

function initSelectionToggle() {
  const toggle = document.getElementById('toggle-selection') as HTMLInputElement;

  chrome.storage.local.get('selectionEnabled', (result) => {
    toggle.checked = !!result.selectionEnabled;
  });

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ selectionEnabled: enabled });
    send({ type: 'toggleSelection', enabled });
  });
}

/* ── Listen for translateComplete from content script ── */

function initMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'translateComplete' && btnState === 'loading') {
      setBtnState('done');
    }
  });
}

/* ── Load states from background ── */

async function loadTranslateState() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getTranslateState',
    });
    if (response?.translating) {
      setBtnState(response.loading ? 'loading' : 'done');
    }
  } catch {
    // Background may not respond
  }
}

async function loadAutoTranslateState() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getAutoTranslateState',
    });
    if (response?.enabled !== undefined) {
      (document.getElementById('toggle-auto') as HTMLInputElement).checked = response.enabled;
    }
  } catch {
    // Background may not respond
  }
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', () => {
  initLanguageSelect();
  initModeToggle();
  initTranslateButton();
  initAutoToggle();
  initSelectionToggle();
  initMessageListener();
  loadTranslateState();
  loadAutoTranslateState();
});
