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

// Polyfill for Array.prototype.toSorted (ES2023, Node.js 20+)
if (typeof Array.prototype.toSorted !== 'function') {
  (Array.prototype as any).toSorted = function<T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
    return [...this].sort(compareFn);
  };
}

// Polyfill for Array.prototype.findLast (ES2023, Node.js 18+)
if (typeof Array.prototype.findLast !== 'function') {
  (Array.prototype as any).findLast = function<T>(this: T[], predicate: (value: T, index: number, array: T[]) => boolean, thisArg?: any): T | undefined {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) {
        return this[i];
      }
    }
    return undefined;
  };
}

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ReadableStream = require('stream/web').ReadableStream;
const WritableStream = require('stream/web').WritableStream;
const TransformStream = require('stream/web').TransformStream;
  if (typeof globalThis.ReadableStream === 'undefined') {
    (globalThis as any).ReadableStream = ReadableStream;
  }
  if (typeof globalThis.WritableStream === 'undefined') {
    (globalThis as any).WritableStream = WritableStream;
  }
  if (typeof globalThis.TransformStream === 'undefined') {
    (globalThis as any).TransformStream = TransformStream;
  }


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

  // polyfill for TextDecoderStream and TextEncoderStream (Node.js 18+)
  if (typeof globalThis.TextDecoderStream === 'undefined') {
    const { TextEncoderStream, TextDecoderStream } = await import('@stardazed/streams-text-encoding');
    (globalThis as any).TextDecoderStream = TextDecoderStream;
    (globalThis as any).TextEncoderStream = TextEncoderStream;
  }

  // polyfill for AbortSignal.timeout
  if (!AbortSignal.timeout) {
    AbortSignal.timeout = function (timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      return controller.signal;
    }
  };
// }

// 通过await import延迟加载，使得polyfill在主模块之前执行
const {run} = await import('./index.ts');
run();

export {};
