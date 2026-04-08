import { describe, it, expect, beforeEach } from 'vitest';
import {
  isCJKDominant,
  shouldSkipElement,
  getTranslatableElements,
  deduplicateContained,
} from '../src/utils/dom-utils';

describe('dom-utils', () => {
  describe('isCJKDominant', () => {
    it('returns true for Chinese text', () => {
      expect(isCJKDominant('这是一段中文文本')).toBe(true);
    });

    it('returns true for Japanese text', () => {
      expect(isCJKDominant('これはテストです')).toBe(true);
    });

    it('returns false for English text', () => {
      expect(isCJKDominant('This is English text')).toBe(false);
    });

    it('returns false for mixed text with < 50% CJK', () => {
      expect(isCJKDominant('Hello world 你好')).toBe(false);
    });

    it('returns true for mixed text with > 50% CJK', () => {
      expect(isCJKDominant('你好世界测试一下 hi')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isCJKDominant('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isCJKDominant(null as any)).toBe(false);
      expect(isCJKDominant(undefined as any)).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(isCJKDominant('   ')).toBe(false);
    });
  });

  describe('shouldSkipElement', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('returns true for null element', () => {
      expect(shouldSkipElement(null as any)).toBe(true);
    });

    it('returns true for element without tagName', () => {
      expect(shouldSkipElement({} as any)).toBe(true);
    });

    it('returns true for short text', () => {
      const el = document.createElement('p');
      el.textContent = 'Hi';
      document.body.appendChild(el);
      expect(shouldSkipElement(el)).toBe(true);
    });

    it('returns true for CJK-dominant text', () => {
      const el = document.createElement('p');
      el.textContent = '这是一段很长的中文文本，不需要翻译';
      document.body.appendChild(el);
      expect(shouldSkipElement(el)).toBe(true);
    });

    it('returns false for valid English paragraph', () => {
      const el = document.createElement('p');
      el.textContent = 'This is a valid English paragraph that should be translated.';
      document.body.appendChild(el);
      expect(shouldSkipElement(el)).toBe(false);
    });

    it('returns true for element inside <nav>', () => {
      const nav = document.createElement('nav');
      const p = document.createElement('p');
      p.textContent = 'Navigation link text here';
      nav.appendChild(p);
      document.body.appendChild(nav);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element inside <code>', () => {
      const code = document.createElement('code');
      const span = document.createElement('p');
      span.textContent = 'const x = something';
      code.appendChild(span);
      document.body.appendChild(code);
      expect(shouldSkipElement(span)).toBe(true);
    });

    it('returns true for element with .fluentread-translation class', () => {
      const div = document.createElement('div');
      div.className = 'fluentread-translation';
      const p = document.createElement('p');
      p.textContent = 'Already translated text here';
      div.appendChild(p);
      document.body.appendChild(div);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element inside <pre>', () => {
      const pre = document.createElement('pre');
      const p = document.createElement('p');
      p.textContent = 'Some preformatted code text';
      pre.appendChild(p);
      document.body.appendChild(pre);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element inside contenteditable (bare attribute)', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', '');
      const p = document.createElement('p');
      p.textContent = 'Editable text that should not be translated';
      div.appendChild(p);
      document.body.appendChild(div);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element inside contenteditable="true"', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      const p = document.createElement('p');
      p.textContent = 'Editable text that should not be translated';
      div.appendChild(p);
      document.body.appendChild(div);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element inside contenteditable="plaintext-only"', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'plaintext-only');
      const p = document.createElement('p');
      p.textContent = 'Plaintext editable should not be translated';
      div.appendChild(p);
      document.body.appendChild(div);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element inside aside', () => {
      const aside = document.createElement('aside');
      const p = document.createElement('p');
      p.textContent = 'Sidebar content should not be translated';
      aside.appendChild(p);
      document.body.appendChild(aside);
      expect(shouldSkipElement(p)).toBe(true);
    });

    it('returns true for element with code-like content', () => {
      const p = document.createElement('p');
      p.textContent = 'const result = func(arg); if (x === y) { return [a, b]; }';
      document.body.appendChild(p);
      expect(shouldSkipElement(p)).toBe(true);
    });
  });

  describe('getTranslatableElements', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('returns empty array for empty document', () => {
      expect(getTranslatableElements(document.body)).toEqual([]);
    });

    it('returns translatable p elements', () => {
      document.body.innerHTML = '<p>This is a long English sentence for translation.</p>';
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(1);
      expect(results[0].tagName).toBe('P');
    });

    it('returns h1-h6 elements', () => {
      document.body.innerHTML = `
        <h1>Main Heading Title Here</h1>
        <h2>Sub Heading Title Here</h2>
        <h3>Third Level Heading Here</h3>
      `;
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(3);
    });

    it('skips elements inside excluded containers', () => {
      document.body.innerHTML = `
        <nav><p>Navigation text that is long enough</p></nav>
        <p>Regular paragraph that should be found</p>
        <footer><p>Footer text that is long enough</p></footer>
      `;
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(1);
      expect(results[0].textContent).toBe('Regular paragraph that should be found');
    });

    it('skips short text and CJK-dominant text', () => {
      document.body.innerHTML = `
        <p>Hi</p>
        <p>这是一段很长的中文文本，不需要翻译</p>
        <p>This English paragraph should be translated.</p>
      `;
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(1);
      expect(results[0].textContent).toBe('This English paragraph should be translated.');
    });

    it('includes table cells and list items', () => {
      document.body.innerHTML = `
        <ul><li>A list item with enough text to pass</li></ul>
        <table><tr><td>A table cell with enough text here</td></tr></table>
      `;
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(2);
    });

    it('includes blockquote and figcaption', () => {
      document.body.innerHTML = `
        <blockquote>A meaningful quote with enough text</blockquote>
        <figure><figcaption>A descriptive caption with enough text</figcaption></figure>
      `;
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(2);
    });

    it('includes dt and dd elements', () => {
      document.body.innerHTML = `
        <dl>
          <dt>Definition term with enough text here</dt>
          <dd>Definition description with enough text</dd>
        </dl>
      `;
      const results = getTranslatableElements(document.body);
      expect(results.length).toBe(2);
    });

    describe('with site adapter', () => {
      const twitterAdapter = {
        selectors: ['[data-testid="tweetText"]', '[data-testid="card.description"]'],
      };

      it('uses adapter selectors instead of default tags', () => {
        document.body.innerHTML = `
          <div data-testid="tweetText">This is a tweet with enough text to pass filtering.</div>
          <p>This paragraph should NOT be found when adapter is used.</p>
        `;
        const results = getTranslatableElements(document.body, twitterAdapter);
        expect(results.length).toBe(1);
        expect(results[0].getAttribute('data-testid')).toBe('tweetText');
      });

      it('still applies content filters (text length)', () => {
        document.body.innerHTML = `
          <div data-testid="tweetText">Hi</div>
        `;
        const results = getTranslatableElements(document.body, twitterAdapter);
        expect(results.length).toBe(0);
      });

      it('still applies CJK filter', () => {
        document.body.innerHTML = `
          <div data-testid="tweetText">这是一段很长的中文推文，不需要翻译</div>
        `;
        const results = getTranslatableElements(document.body, twitterAdapter);
        expect(results.length).toBe(0);
      });

      it('bypasses container exclusion (nav) when using adapter', () => {
        document.body.innerHTML = `
          <nav>
            <div data-testid="tweetText">This tweet is inside a nav element but should be found.</div>
          </nav>
        `;
        const results = getTranslatableElements(document.body, twitterAdapter);
        expect(results.length).toBe(1);
      });

      it('finds card.description elements', () => {
        document.body.innerHTML = `
          <div data-testid="card.description">Link preview card description with enough text.</div>
        `;
        const results = getTranslatableElements(document.body, twitterAdapter);
        expect(results.length).toBe(1);
      });

      it('returns default behavior when adapter is null', () => {
        document.body.innerHTML = `
          <p>This paragraph should be found with null adapter.</p>
        `;
        const results = getTranslatableElements(document.body, null);
        expect(results.length).toBe(1);
        expect(results[0].tagName).toBe('P');
      });

      it('deduplicates nested adapter elements', () => {
        document.body.innerHTML = `
          <div data-testid="tweetText">
            Outer tweet text that is long enough here.
            <div data-testid="card.description">Nested card with enough text here too.</div>
          </div>
        `;
        const results = getTranslatableElements(document.body, twitterAdapter);
        // tweetText contains card.description, so dedup removes the parent (tweetText)
        expect(results.length).toBe(1);
      });
    });
  });

  describe('deduplicateContained', () => {
    it('removes parent when child also appears', () => {
      const parent = document.createElement('div');
      const child = document.createElement('p');
      parent.appendChild(child);
      document.body.appendChild(parent);
      expect(deduplicateContained([parent, child])).toEqual([child]);
    });

    it('keeps unrelated elements', () => {
      const a = document.createElement('p');
      const b = document.createElement('p');
      document.body.append(a, b);
      expect(deduplicateContained([a, b])).toEqual([a, b]);
    });

    it('returns empty for empty input', () => {
      expect(deduplicateContained([])).toEqual([]);
    });

    it('returns single element unchanged', () => {
      const el = document.createElement('p');
      document.body.appendChild(el);
      expect(deduplicateContained([el])).toEqual([el]);
    });

    it('removes grandparent and parent when grandchild is also present', () => {
      const grandparent = document.createElement('div');
      const parent = document.createElement('div');
      const child = document.createElement('p');
      grandparent.appendChild(parent);
      parent.appendChild(child);
      document.body.appendChild(grandparent);
      expect(deduplicateContained([grandparent, parent, child])).toEqual([child]);
    });

    it('keeps multiple leaves under the same ancestor', () => {
      const root = document.createElement('div');
      const leafA = document.createElement('p');
      const leafB = document.createElement('p');
      root.appendChild(leafA);
      root.appendChild(leafB);
      document.body.appendChild(root);
      expect(deduplicateContained([root, leafA, leafB])).toEqual([leafA, leafB]);
    });
  });
});
