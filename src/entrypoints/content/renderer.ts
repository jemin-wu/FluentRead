/**
 * 译文渲染模块 — 负责注入/移除双语对照 DOM
 */

export function renderTranslation(
  el: HTMLElement,
  translation: string,
  lang = 'zh-CN',
  html: string | null = null,
) {
  removeTranslation(el);

  const div = document.createElement('div');
  div.className = 'fluentread-translation';
  div.lang = lang;
  div.setAttribute('role', 'note');
  div.setAttribute('aria-label', 'translation');

  if (html) {
    div.innerHTML = html;
  } else {
    div.textContent = translation;
  }

  el.appendChild(div);
}

export function renderLoading(el: HTMLElement) {
  removeTranslation(el);

  const div = document.createElement('div');
  div.className = 'fluentread-translation fluentread-loading';
  div.setAttribute('role', 'note');
  div.setAttribute('aria-label', 'translation');
  div.setAttribute('aria-live', 'polite');
  div.textContent = '...';

  el.appendChild(div);
}

export function renderError(el: HTMLElement, onRetry?: () => void) {
  removeTranslation(el);

  const div = document.createElement('div');
  div.className = 'fluentread-translation fluentread-error';
  div.setAttribute('role', 'note');
  div.setAttribute('aria-label', 'translation error');
  div.textContent = '翻译失败，点击重试';

  if (onRetry) {
    div.addEventListener('click', onRetry, { once: true });
  }

  el.appendChild(div);
}

export function removeTranslation(el: HTMLElement) {
  const existing = el.querySelector('.fluentread-translation');
  if (existing) existing.remove();
}

export function removeAllTranslations() {
  document.querySelectorAll('.fluentread-translation').forEach((el) => el.remove());
  document.querySelectorAll('.fluentread-hidden').forEach((el) => {
    el.classList.remove('fluentread-hidden');
  });
}

export function showTranslationOnly(elements: HTMLElement[]) {
  for (const el of elements) {
    el.classList.add('fluentread-hidden');
  }
}

export function showBilingual(elements: HTMLElement[]) {
  for (const el of elements) {
    el.classList.remove('fluentread-hidden');
  }
}
