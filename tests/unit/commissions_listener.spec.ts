import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/commissions.js';

describe('commissions listeners', () => {
  let documentListeners: Map<string, Array<(event: Event) => void>>;

  beforeEach(async () => {
    documentListeners = new Map();
    (globalThis as any).window = globalThis;
    const documentStub: any = {
      addEventListener: vi.fn((type: string, handler: (event: Event) => void) => {
        if(!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type)!.push(handler);
      }),
      removeEventListener: vi.fn(),
      getElementById: vi.fn(() => ({
        addEventListener: vi.fn(),
        value: '',
        __wired: false
      })),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement: vi.fn(() => ({ style: {}, setAttribute: vi.fn(), appendChild: vi.fn() })),
      body: { appendChild: vi.fn() }
    };
    (globalThis as any).document = documentStub;
    (globalThis as any).openDB = vi.fn(async () => {});
    (globalThis as any).dbGetAll = vi.fn(async (store: string) => {
      if(store === 'contacts') return [];
      if(store === 'partners') return [];
      if(store === 'settings') return [];
      if(store === 'notifications') return [];
      return [];
    });
    (globalThis as any).dbPut = vi.fn(async () => {});
    (globalThis as any).dbBulkPut = vi.fn(async () => {});
    (globalThis as any).dbDelete = vi.fn(async () => {});
    (globalThis as any).dbGet = vi.fn(async () => null);
    (globalThis as any).dbClear = vi.fn(async () => {});
    (globalThis as any).__INIT_FLAGS__ = {};
    delete (globalThis as any).__COMMISSIONS_DATA_HANDLER__;
    delete (globalThis as any).__COMMISSIONS_LEDGER_HANDLER__;
    delete (globalThis as any).__LEDGER_RENDER_WRAP__;
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid' });
    (globalThis as any).window.__INIT_FLAGS__ = {};
    vi.resetModules();
    await import(MODULE_PATH);
  });

  afterEach(() => {
    delete (globalThis as any).dbGetAll;
    delete (globalThis as any).dbPut;
    delete (globalThis as any).dbBulkPut;
    delete (globalThis as any).dbDelete;
    delete (globalThis as any).dbGet;
    delete (globalThis as any).dbClear;
    delete (globalThis as any).openDB;
    delete (globalThis as any).__INIT_FLAGS__;
    delete (globalThis as any).__COMMISSIONS_DATA_HANDLER__;
    delete (globalThis as any).__COMMISSIONS_LEDGER_HANDLER__;
    delete (globalThis as any).__LEDGER_RENDER_WRAP__;
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    vi.unstubAllGlobals();
  });

  it('registers exactly one handler per data stream', () => {
    const dataHandlers = documentListeners.get('app:data:changed') || [];
    expect(dataHandlers.length).toBe(2);
    const uniqueHandlers = new Set(dataHandlers);
    expect(uniqueHandlers.size).toBe(2);
  });

  it('does not invoke ledger handler more than once per event', () => {
    const handlers = documentListeners.get('app:data:changed') || [];
    expect(handlers.length).toBeGreaterThan(0);
    handlers.forEach(handler => handler({ detail: { action: 'commissions' } } as any));
    handlers.forEach(handler => handler({ detail: { action: 'commissions' } } as any));
    // ensure handlers themselves do not enqueue additional duplicates by checking stored list unchanged
    const refreshedHandlers = documentListeners.get('app:data:changed') || [];
    expect(refreshedHandlers.length).toBe(handlers.length);
  });
});
