import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mock PWA virtual module in case main.tsx is imported in tests
vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => () => Promise.resolve()),
}));

// Ensure globalThis.localStorage points to a working Storage (Node 26 exposes an
// unconfigured localStorage getter on globalThis that returns undefined).
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

if (typeof window !== 'undefined') {
  let workingStorage: Storage;
  try {
    workingStorage =
      window.localStorage && typeof window.localStorage.getItem === 'function'
        ? window.localStorage
        : createMemoryStorage();
  } catch {
    workingStorage = createMemoryStorage();
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: workingStorage,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: workingStorage,
  });
}

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
});

// Polyfill window.matchMedia (absent in jsdom)
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Polyfill ResizeObserver (absent in jsdom)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Polyfill URL.createObjectURL / revokeObjectURL (for .ics & JSON export tests)
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

// Polyfill crypto.randomUUID if absent
if (typeof globalThis.crypto !== 'undefined' && !globalThis.crypto.randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  });
}
