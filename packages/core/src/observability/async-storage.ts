// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Polyfill minimal de `AsyncLocalStorage` (Node `node:async_hooks`) pour
 * environnements sans ce module (WebView, browser).
 *
 * Limite : le store est global et restauré en `try/finally` autour de `run()`.
 * Ça suffit pour le single-thread JS tant que chaque appel est enveloppé dans
 * `run()` avant le premier `await`. Les contextes imbriqués sont correctement
 * empilés. Le vrai `AsyncLocalStorage` de Node propage aussi à travers les
 * microtasks — on perd cette propriété ici, à réadresser via asyncContext
 * (proposal TC39 stage 3) quand shipped.
 */
export class AsyncLocalStorage<T> {
  #store: T | undefined;

  getStore(): T | undefined {
    return this.#store;
  }

  run<R>(store: T, fn: () => R): R {
    const prev = this.#store;
    this.#store = store;
    try {
      return fn();
    } finally {
      this.#store = prev;
    }
  }
}
