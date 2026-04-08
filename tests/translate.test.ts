import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateText, parseResponse, _internals } from '../src/services/translate';

describe('parseResponse', () => {
  it('extracts translated text from nested array', () => {
    const data = [[['你好世界', 'Hello world', null, null, 10]], null, 'en'];
    expect(parseResponse(data)).toBe('你好世界');
  });

  it('concatenates multiple translation segments', () => {
    const data = [
      [
        ['你好', 'Hello'],
        ['世界', ' world'],
      ],
    ];
    expect(parseResponse(data)).toBe('你好世界');
  });

  it('skips null entries', () => {
    const data = [[['你好', 'Hello'], null, ['世界', ' world']]];
    expect(parseResponse(data)).toBe('你好世界');
  });

  it('throws on invalid response format (not array)', () => {
    expect(() => parseResponse('invalid' as any)).toThrow('Invalid response format');
  });

  it('throws on invalid response format (data[0] not array)', () => {
    expect(() => parseResponse([null] as any)).toThrow('Invalid response format');
  });
});

describe('translateText', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalDelay = _internals.delay;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
    _internals.delay = vi.fn(() => Promise.resolve());
  });

  afterEach(() => {
    _internals.delay = originalDelay;
    vi.restoreAllMocks();
  });

  it('returns empty string for empty input', async () => {
    expect(await translateText('', 'zh-CN')).toBe('');
    expect(await translateText('   ', 'zh-CN')).toBe('');
    expect(await translateText(null as any, 'zh-CN')).toBe('');
    expect(await translateText(undefined as any, 'zh-CN')).toBe('');
  });

  it('calls correct API URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [[['你好', 'Hello']]],
    });

    await translateText('Hello', 'zh-CN');

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('translate.googleapis.com');
    expect(url).toContain('client=gtx');
    expect(url).toContain('sl=auto');
    expect(url).toContain('tl=zh-CN');
    expect(url).toContain('q=Hello');
  });

  it('returns translated text on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [[['你好世界', 'Hello world']]],
    });

    const result = await translateText('Hello world', 'zh-CN');
    expect(result).toBe('你好世界');
  });

  it('retries with exponential backoff on failure', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [[['你好', 'Hello']]],
      });
    });

    const result = await translateText('Hello', 'zh-CN');
    expect(result).toBe('你好');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(_internals.delay).toHaveBeenCalledTimes(2);
    expect(_internals.delay).toHaveBeenNthCalledWith(1, 1000);
    expect(_internals.delay).toHaveBeenNthCalledWith(2, 2000);
  });

  it('throws after max retries exhausted', async () => {
    fetchMock.mockImplementation(() => {
      return Promise.reject(new Error('Network error'));
    });

    await expect(translateText('Hello', 'zh-CN')).rejects.toThrow('Network error');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(_internals.delay).toHaveBeenCalledTimes(2);
  });

  it('pauses 30s on 429 rate limit', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 429 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [[['你好', 'Hello']]],
      });
    });

    const result = await translateText('Hello', 'zh-CN');
    expect(result).toBe('你好');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(_internals.delay).toHaveBeenCalledWith(30000);
  });

  it('throws on non-JSON response', async () => {
    fetchMock.mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Invalid JSON');
        },
      });
    });

    await expect(translateText('Hello', 'zh-CN')).rejects.toThrow('Invalid JSON response');
  });

  it('throws on HTTP error status', async () => {
    fetchMock.mockImplementation(() => {
      return Promise.resolve({ ok: false, status: 500 });
    });

    await expect(translateText('Hello', 'zh-CN')).rejects.toThrow('HTTP error: 500');
  });

  it('does not consume retry budget on 429', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({ ok: false, status: 429 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [[['你好', 'Hello']]],
      });
    });

    const result = await translateText('Hello', 'zh-CN');
    expect(result).toBe('你好');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 429 pauses should not count as retries — all 3 real retry slots still available
    expect(_internals.delay).toHaveBeenCalledTimes(2);
    expect(_internals.delay).toHaveBeenNthCalledWith(1, 30000);
    expect(_internals.delay).toHaveBeenNthCalledWith(2, 30000);
  });

  it('retries all attempts after consecutive 429s', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // First 2 calls: 429 rate limit
        return Promise.resolve({ ok: false, status: 429 });
      }
      // Next 3 calls: 500 server error (exhaust all 3 retries)
      return Promise.resolve({ ok: false, status: 500 });
    });

    await expect(translateText('Hello', 'zh-CN')).rejects.toThrow('HTTP error: 500');
    // Total calls = 2 (429) + 3 (500 retries) = 5
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
