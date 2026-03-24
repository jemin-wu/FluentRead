/**
 * Google Translate 非官方 API 封装
 */

const API_BASE = 'https://translate.googleapis.com/translate_a/single';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const RATE_LIMIT_PAUSE_MS = 30000;

export function parseResponse(data: unknown[]): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Invalid response format');
  }
  return data[0]
    .filter((item: unknown[]) => item && item[0] != null)
    .map((item: unknown[]) => item[0])
    .join('');
}

export const _internals = {
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) {
    return '';
  }

  const url = `${API_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429) {
        await _internals.delay(RATE_LIMIT_PAUSE_MS);
        lastError = new Error('Rate limited (429)');
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      let data: unknown[];
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid JSON response');
      }

      return parseResponse(data);
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_DELAY_MS * Math.pow(2, attempt);
        await _internals.delay(backoff);
      }
    }
  }

  throw lastError;
}
