import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderTranslation,
  renderLoading,
  renderError,
  removeTranslation,
  removeAllTranslations,
  showTranslationOnly,
  showBilingual,
} from '../src/entrypoints/content/renderer';

describe('renderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderTranslation', () => {
    it('inserts translation div inside element', () => {
      document.body.innerHTML = '<p>Hello world</p>';
      const p = document.querySelector('p')!;

      renderTranslation(p, '你好世界', 'zh-CN');

      const translation = p.querySelector('.fluentread-translation');
      expect(translation).not.toBeNull();
      expect(translation!.className).toBe('fluentread-translation');
      expect(translation!.textContent).toBe('你好世界');
      expect(translation!.getAttribute('lang')).toBe('zh-CN');
      expect(translation!.getAttribute('role')).toBe('note');
      expect(translation!.getAttribute('aria-label')).toBe('translation');
    });

    it('replaces existing translation on re-render', () => {
      document.body.innerHTML = '<p>Hello world</p>';
      const p = document.querySelector('p')!;

      renderTranslation(p, '你好世界', 'zh-CN');
      renderTranslation(p, '你好世界2', 'zh-CN');

      const translations = document.querySelectorAll('.fluentread-translation');
      expect(translations.length).toBe(1);
      expect(translations[0].textContent).toBe('你好世界2');
    });

    it('appends inside td element', () => {
      document.body.innerHTML = '<table><tr><td>Hello</td></tr></table>';
      const td = document.querySelector('td')!;

      renderTranslation(td, '你好', 'zh-CN');

      const translation = td.querySelector('.fluentread-translation');
      expect(translation).not.toBeNull();
      expect(translation!.textContent).toBe('你好');
      expect(td.contains(translation)).toBe(true);
    });

    it('appends inside th element', () => {
      document.body.innerHTML = '<table><tr><th>Header</th></tr></table>';
      const th = document.querySelector('th')!;

      renderTranslation(th, '标题', 'zh-CN');

      const translation = th.querySelector('.fluentread-translation');
      expect(translation).not.toBeNull();
      expect(th.contains(translation)).toBe(true);
    });

    it('handles dt/dd elements', () => {
      document.body.innerHTML = '<dl><dt>Term</dt><dd>Definition</dd></dl>';
      const dt = document.querySelector('dt')!;

      renderTranslation(dt, '术语', 'zh-CN');

      const translation = document.querySelector('.fluentread-translation');
      expect(translation).not.toBeNull();
      expect(translation!.textContent).toBe('术语');
    });

    it('defaults lang to zh-CN', () => {
      document.body.innerHTML = '<p>Hello</p>';
      const p = document.querySelector('p')!;

      renderTranslation(p, '你好');

      const translation = p.querySelector('.fluentread-translation');
      expect(translation!.getAttribute('lang')).toBe('zh-CN');
    });
  });

  describe('renderLoading', () => {
    it('shows loading placeholder', () => {
      document.body.innerHTML = '<p>Hello</p>';
      const p = document.querySelector('p')!;

      renderLoading(p);

      const loading = p.querySelector('.fluentread-loading');
      expect(loading!.querySelectorAll('.fluentread-dot').length).toBe(3);
      expect(loading!.classList.contains('fluentread-loading')).toBe(true);
      expect(loading!.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('renderError', () => {
    it('shows error message', () => {
      document.body.innerHTML = '<p>Hello</p>';
      const p = document.querySelector('p')!;

      renderError(p);

      const error = p.querySelector('.fluentread-error');
      expect(error!.textContent).toBe('翻译失败，点击重试');
      expect(error!.classList.contains('fluentread-error')).toBe(true);
    });

    it('calls retry callback on click', () => {
      document.body.innerHTML = '<p>Hello</p>';
      const p = document.querySelector('p')!;
      let retryCalled = false;

      renderError(p, () => {
        retryCalled = true;
      });

      const error = p.querySelector('.fluentread-error') as HTMLElement;
      error.click();
      expect(retryCalled).toBe(true);
    });
  });

  describe('removeTranslation', () => {
    it('removes translation for a regular element', () => {
      document.body.innerHTML = '<p>Hello</p>';
      const p = document.querySelector('p')!;
      renderTranslation(p, '你好');

      removeTranslation(p);

      expect(document.querySelectorAll('.fluentread-translation').length).toBe(0);
    });

    it('removes translation inside td', () => {
      document.body.innerHTML = '<table><tr><td>Hello</td></tr></table>';
      const td = document.querySelector('td')!;
      renderTranslation(td, '你好');

      removeTranslation(td);

      expect(td.querySelector('.fluentread-translation')).toBeNull();
    });
  });

  describe('removeAllTranslations', () => {
    it('removes all translation nodes from page', () => {
      document.body.innerHTML = '<p>Hello</p><p>World</p>';
      const paragraphs = document.querySelectorAll('p');
      renderTranslation(paragraphs[0], '你好');
      renderTranslation(paragraphs[1], '世界');

      removeAllTranslations();

      expect(document.querySelectorAll('.fluentread-translation').length).toBe(0);
    });

    it('restores hidden elements', () => {
      document.body.innerHTML = '<p>Hello</p>';
      const p = document.querySelector('p')!;
      p.classList.add('fluentread-hidden');

      removeAllTranslations();

      expect(p.classList.contains('fluentread-hidden')).toBe(false);
    });
  });

  describe('showTranslationOnly / showBilingual', () => {
    it('hides original text in translation-only mode', () => {
      document.body.innerHTML = '<p>Hello</p><p>World</p>';
      const elements = [...document.querySelectorAll('p')] as HTMLElement[];

      showTranslationOnly(elements);

      for (const el of elements) {
        expect(el.classList.contains('fluentread-hidden')).toBe(true);
      }
    });

    it('restores original text in bilingual mode', () => {
      document.body.innerHTML = '<p>Hello</p><p>World</p>';
      const elements = [...document.querySelectorAll('p')] as HTMLElement[];
      showTranslationOnly(elements);

      showBilingual(elements);

      for (const el of elements) {
        expect(el.classList.contains('fluentread-hidden')).toBe(false);
      }
    });
  });
});
