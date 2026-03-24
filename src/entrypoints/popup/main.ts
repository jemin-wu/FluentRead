/**
 * Popup script for FluentRead.
 */

import './style.css';

let currentMode = 'bilingual';
let isTranslating = false;

function send(message: Record<string, unknown>) {
  return chrome.runtime.sendMessage(message);
}

async function initFirstUseTip() {
  const result = await chrome.storage.local.get('firstUse');
  if (result.firstUse !== false) {
    const tip = document.getElementById('first-use-tip')!;
    tip.hidden = false;
    document.getElementById('dismiss-tip')!.addEventListener('click', () => {
      tip.style.opacity = '0';
      tip.style.transform = 'translateY(-6px)';
      tip.style.transition = 'opacity 200ms ease, transform 200ms ease';
      setTimeout(() => {
        tip.hidden = true;
      }, 200);
      chrome.storage.local.set({ firstUse: false });
    });
  }
}

function initModeTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.mode-tab');
  const indicator = document.getElementById('mode-indicator')!;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode!;
      indicator.setAttribute('data-pos', tab.dataset.index!);
      send({ type: 'switchMode', mode: currentMode });
    });
  });
}

function initTranslateToggle() {
  const toggle = document.getElementById('toggle-translate') as HTMLInputElement;
  const dot = document.getElementById('status-dot')!;
  toggle.addEventListener('change', () => {
    isTranslating = toggle.checked;
    const pulse = dot.querySelector<HTMLElement>('.status-pulse')!;
    pulse.style.background = isTranslating ? '#34d399' : '#94a3b8';
    pulse.style.boxShadow = isTranslating
      ? '0 0 6px rgba(52, 211, 153, 0.5)'
      : '0 0 4px rgba(148, 163, 184, 0.3)';
    dot.title = isTranslating ? '翻译中' : '已暂停';
    send({ type: isTranslating ? 'translate' : 'cancel' });
  });
}

function initAutoToggle() {
  const toggle = document.getElementById('toggle-auto') as HTMLInputElement;
  toggle.addEventListener('change', () => {
    send({ type: 'toggleAutoTranslate' });
  });
}

function initLanguageSelect() {
  const select = document.getElementById('target-lang') as HTMLSelectElement;
  chrome.storage.local.get('targetLang', (result) => {
    if (result.targetLang) {
      select.value = result.targetLang as string;
    }
  });
  select.addEventListener('change', () => {
    const lang = select.value;
    chrome.storage.local.set({ targetLang: lang });
    send({ type: 'translate', lang });
  });
}

function initOptionsLink() {
  document.getElementById('open-options')!.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function loadAutoTranslateState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAutoTranslateState' });
    if (response?.enabled !== undefined) {
      (document.getElementById('toggle-auto') as HTMLInputElement).checked = response.enabled;
    }
  } catch {
    // Background may not respond — ignore
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initFirstUseTip();
  initModeTabs();
  initTranslateToggle();
  initAutoToggle();
  initLanguageSelect();
  initOptionsLink();
  loadAutoTranslateState();
});
