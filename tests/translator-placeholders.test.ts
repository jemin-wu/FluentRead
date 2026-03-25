import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractPlaceholders, restorePlaceholders } from '../src/entrypoints/content/translator';

// jsdom 不计算布局，innerText 返回空字符串。
// 添加 polyfill 回退到 textContent，与生产环境行为等价（翻译目标元素均为可见文本）。
const origDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
    configurable: true,
  });
});
afterEach(() => {
  if (origDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', origDescriptor);
  }
});

describe('translator placeholder system', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('extractPlaceholders', () => {
    it('returns plain text for elements without special children', () => {
      document.body.innerHTML = '<p>Hello world</p>';
      const el = document.querySelector('p')!;
      const result = extractPlaceholders(el);

      expect(result.text).toBe('Hello world');
      expect(result.placeholders).toEqual([]);
      expect(result.links).toEqual([]);
    });

    it('extracts code tags as placeholders', () => {
      document.body.innerHTML = '<p>Use <code>git pull</code> to update</p>';
      const el = document.querySelector('p')!;
      const result = extractPlaceholders(el);

      expect(result.placeholders).toHaveLength(1);
      expect(result.placeholders[0]).toEqual({ tag: 'code', content: 'git pull' });
      expect(result.text).toContain('__TAG_0__');
    });

    it('extracts sup and sub tags', () => {
      document.body.innerHTML = '<p>H<sub>2</sub>O is water<sup>1</sup></p>';
      const el = document.querySelector('p')!;
      const result = extractPlaceholders(el);

      expect(result.placeholders).toHaveLength(2);
      expect(result.placeholders[0]).toEqual({ tag: 'sub', content: '2' });
      expect(result.placeholders[1]).toEqual({ tag: 'sup', content: '1' });
    });

    it('extracts links with boundary markers, text participates in translation', () => {
      document.body.innerHTML = '<p>See <a href="https://example.com">the docs</a> for details</p>';
      const el = document.querySelector('p')!;
      const result = extractPlaceholders(el);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].attrs).toContain('href="https://example.com"');
      expect(result.text).toContain('__LS0__');
      expect(result.text).toContain('the docs');
      expect(result.text).toContain('__LE0__');
    });

    it('escapes quotes in href to prevent attribute injection', () => {
      document.body.innerHTML = '<p><a href=\'x"onclick="alert(1)\'>click</a></p>';
      const el = document.querySelector('p')!;
      const result = extractPlaceholders(el);

      expect(result.links).toHaveLength(1);
      // " in href value must be escaped to &quot; so it cannot break out of the attribute
      expect(result.links[0].attrs).toContain('&quot;');
      // When restored as HTML, the attribute boundary stays intact:
      // href="x&quot;onclick=&quot;alert(1)" is a single attribute value, not two attributes
      expect(result.links[0].attrs).toMatch(/^href="[^"]*"$/);
    });

    it('preserves code tags nested inside links (code processed before links)', () => {
      document.body.innerHTML =
        '<p>Run <a href="https://x.com"><code>npm install</code> here</a></p>';
      const el = document.querySelector('p')!;
      const result = extractPlaceholders(el);

      // code should be extracted as placeholder
      expect(result.placeholders).toHaveLength(1);
      expect(result.placeholders[0]).toEqual({ tag: 'code', content: 'npm install' });

      // link should contain TAG marker in its text
      expect(result.links).toHaveLength(1);
      expect(result.text).toContain('__TAG_0__');
      expect(result.text).toContain('__LS0__');
    });
  });

  describe('restorePlaceholders', () => {
    it('returns null when no placeholders or links', () => {
      expect(restorePlaceholders('hello', [], [])).toBeNull();
    });

    it('restores code tags in translation', () => {
      const result = restorePlaceholders(
        '使用 __TAG_0__ 来更新',
        [{ tag: 'code', content: 'git pull' }],
        [],
      );

      expect(result).toContain('<code class="fluentread-code">git pull</code>');
      expect(result).toContain('使用');
    });

    it('restores sup/sub without class', () => {
      const result = restorePlaceholders(
        'H__TAG_0__O 是水__TAG_1__',
        [
          { tag: 'sub', content: '2' },
          { tag: 'sup', content: '1' },
        ],
        [],
      );

      expect(result).toContain('<sub>2</sub>');
      expect(result).toContain('<sup>1</sup>');
    });

    it('restores link boundary markers to <a> tags', () => {
      const result = restorePlaceholders(
        '详见 __LS0__文档__LE0__',
        [],
        [{ attrs: 'href="https://example.com"' }],
      );

      expect(result).toContain('<a href="https://example.com">文档</a>');
    });

    it('restores empty-text links', () => {
      const result = restorePlaceholders(
        '点击 __LS0____LE0__ 继续',
        [],
        [{ attrs: 'href="https://example.com"' }],
      );

      expect(result).toContain('<a href="https://example.com"></a>');
    });

    it('cleans up unmatched link markers gracefully', () => {
      const result = restorePlaceholders(
        '一些 __LS0__文本',
        [],
        [{ attrs: 'href="https://x.com"' }],
      );

      // __LE0__ is missing, so regex won't match; cleanup removes residual markers
      expect(result).not.toContain('__LS0__');
    });

    it('restores code inside links when both placeholders and links exist', () => {
      const result = restorePlaceholders(
        '运行 __LS0____TAG_0__ 这里__LE0__',
        [{ tag: 'code', content: 'npm install' }],
        [{ attrs: 'href="https://x.com"' }],
      );

      // TAG_0 restored to <code> FIRST, then link wraps it
      expect(result).toContain('<code class="fluentread-code">npm install</code>');
      expect(result).toContain('<a href="https://x.com">');
      expect(result).toContain('</a>');
    });

    it('escapes HTML entities in translation text', () => {
      const result = restorePlaceholders(
        'a < b & c > d with __TAG_0__',
        [{ tag: 'code', content: 'x' }],
        [],
      );

      expect(result).toContain('&lt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&gt;');
    });
  });
});
