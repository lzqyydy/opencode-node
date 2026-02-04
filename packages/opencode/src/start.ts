import {compare} from 'compare-versions';
if (compare(process.version, '18.0.0', '<')) {
  await import('web-streams-polyfill/polyfill');

  // polyfill for Fetch API (Headers, Request, Response, fetch)
  const undici = await import('undici');
  if (typeof globalThis.Headers === 'undefined') {
    (globalThis as any).Headers = undici.Headers;
  }
  if (typeof globalThis.Request === 'undefined') {
    (globalThis as any).Request = undici.Request;
  }
  if (typeof globalThis.Response === 'undefined') {
    (globalThis as any).Response = undici.Response;
  }
  if (typeof globalThis.fetch === 'undefined') {
    (globalThis as any).fetch = undici.fetch;
  }

  //polyfill for AbortSignal.timeout
  if (!AbortSignal.timeout) {
    AbortSignal.timeout = function (timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      return controller.signal;
    }
  };
}

// 通过await import延迟加载，使得polyfill在主模块之前执行
const {run} = await import('./index.ts');
run();
