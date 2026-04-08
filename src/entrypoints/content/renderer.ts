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

  createLoadingDots(div);

  el.appendChild(div);
}

export function renderError(el: HTMLElement, onRetry?: () => void) {
  removeTranslation(el);

  const div = document.createElement('div');
  div.className = 'fluentread-translation fluentread-error';
  div.setAttribute('role', 'button');
  div.setAttribute('aria-label', '翻译失败，点击重试');
  div.setAttribute('tabindex', '0');
  div.textContent = '翻译失败，点击重试';

  if (onRetry) {
    const ac = new AbortController();
    const { signal } = ac;
    const fire = () => {
      ac.abort();
      onRetry();
    };
    div.addEventListener('click', fire, { signal });
    div.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire();
        }
      },
      { signal },
    );
  }

  el.appendChild(div);
}

export function removeTranslation(el: HTMLElement) {
  const existing = el.querySelector('.fluentread-translation');
  if (existing) existing.remove();
}

export function removeAllTranslations() {
  document.querySelectorAll('.fluentread-translation').forEach((el) => el.remove());
  document.querySelectorAll('.fluentread-target-only').forEach((el) => {
    el.classList.remove('fluentread-target-only');
    (el as HTMLElement).style.removeProperty('--fr-font-size');
    (el as HTMLElement).style.removeProperty('--fr-line-height');
  });
}

export function createLoadingDots(container: HTMLElement) {
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'fluentread-dot';
    dot.style.animationDelay = `${i * 0.15}s`;
    container.appendChild(dot);
  }
}
