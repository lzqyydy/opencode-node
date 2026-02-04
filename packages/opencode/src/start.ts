// Polyfill for Array.fromAsync (ES2024, Node.js 22+)
if (typeof Array.fromAsync !== 'function') {
  (Array as any).fromAsync = async function<T>(asyncIterable: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
    const result: T[] = [];
    for await (const item of asyncIterable) {
      result.push(item);
    }
    return result;
  };
}

import {compare} from 'compare-versions';
if (compare(process.version, '18.0.0', '<')) {
  await import('web-streams-polyfill/polyfill');

  // polyfill for Fetch API (Headers, Request, Response, fetch)
  const undici = await import('undici');
  // 配置更长的连接超时时间，解决 Node.js 16 下 undici ConnectTimeoutError 问题
  undici.setGlobalDispatcher(new undici.Agent({
    connectTimeout: 30_000,  // 30秒
    headersTimeout: 60_000,  // 60秒
  }));
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
