import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const RENDER_GUARD_PATH = '../../crm-app/js/core/renderGuard.js';
const APP_PATH = '../../crm-app/js/app.js';

describe('RenderGuard scheduler', () => {
  let originalWindow: any;
  let originalRAF: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    originalWindow = (globalThis as any).window;
    (globalThis as any).window = globalThis;
    originalRAF = (globalThis as any).requestAnimationFrame;
    (globalThis as any).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      return setTimeout(cb, 0) as unknown as number;
    });
    vi.resetModules();
    await import(RENDER_GUARD_PATH);
  });

  afterEach(() => {
    const guard = (window as any).RenderGuard;
    if(guard && typeof guard.__reset === 'function'){
      guard.__reset();
    }
    vi.useRealTimers();
    if(originalRAF === undefined){
      delete (globalThis as any).requestAnimationFrame;
    }else{
      (globalThis as any).requestAnimationFrame = originalRAF;
    }
    (globalThis as any).window = originalWindow;
    vi.unstubAllGlobals();
  });

  it('coalesces multiple requestRender calls into a single subscriber invocation', () => {
    const guard = (window as any).RenderGuard;
    guard.__reset();
    const subscriber = vi.fn();
    guard.subscribeRender(subscriber);
    guard.requestRender();
    guard.requestRender();
    guard.requestRender();
    vi.runAllTimers();
    expect(subscriber).toHaveBeenCalledTimes(1);
    guard.unsubscribeRender(subscriber);
    guard.__reset();
  });
});

describe('App render coordination', () => {
  let originalWindow: any;
  let listeners: Map<string, Array<(event: Event) => void>>;
  let documentListeners: Map<string, Array<(event: Event) => void>>;

  function createElementStub(){
    const stub: any = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
      querySelector: vi.fn(() => createElementStub()),
      querySelectorAll: vi.fn(() => []),
      setAttribute: vi.fn(),
      style: {},
      innerHTML: '',
      appendChild: vi.fn(),
      remove: vi.fn(),
      matches: vi.fn(() => false),
      closest: vi.fn(() => null),
      dataset: {},
      value: '',
      textContent: '',
      indeterminate: false,
      checked: false
    };
    return stub;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    originalWindow = (globalThis as any).window;
    listeners = new Map();
    documentListeners = new Map();

    const documentStub: any = {
      getElementById: vi.fn(() => createElementStub()),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => createElementStub()),
      addEventListener: vi.fn((type: string, handler: (event: Event) => void) => {
        if(typeof handler !== 'function') return;
        if(!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type)!.push(handler);
      }),
      removeEventListener: vi.fn((type: string, handler: (event: Event) => void) => {
        const list = documentListeners.get(type);
        if(!list || !list.length) return;
        const idx = list.indexOf(handler);
        if(idx >= 0) list.splice(idx, 1);
        if(!list.length) documentListeners.delete(type);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        const list = documentListeners.get(event.type) || [];
        list.forEach(fn => fn.call(documentStub, event));
        return true;
      }),
      createElement: vi.fn(() => createElementStub()),
      body: createElementStub(),
      head: createElementStub(),
      readyState: 'complete',
      documentElement: { style: {} }
    };

    const navStub = createElementStub();
    const windowStub: any = {
      document: documentStub,
      __INIT_FLAGS__: {},
      addEventListener: (type: string, handler: (event: Event) => void) => {
        if(!listeners.has(type)) listeners.set(type, []);
        listeners.get(type)!.push(handler);
      },
      removeEventListener: vi.fn(),
      dispatchEvent: (event: Event) => {
        const list = listeners.get(event.type) || [];
        list.forEach(fn => fn.call(windowStub, event));
        return true;
      },
      history: { replaceState: vi.fn() },
      location: { hash: '', protocol: 'http:', assign: vi.fn(), replace: vi.fn() },
      scrollTo: vi.fn(),
      seedTestData: vi.fn(),
      renderExtrasRegistry: vi.fn(),
      renderDashboard: vi.fn(),
      renderPartners: vi.fn(),
      renderCalendar: vi.fn(),
      renderWorkbench: vi.fn(),
      renderNotifications: vi.fn(),
      refreshNotificationBadge: vi.fn(),
      refreshNotificationsPanel: vi.fn(),
      renderAll: vi.fn(),
      renderCommissions: vi.fn(),
      renderLedger: vi.fn(),
      renderPartnerModal: vi.fn(),
      renderContactModal: vi.fn(),
      $all: vi.fn((selector: string) => Array.from(documentStub.querySelectorAll(selector))),
      $: vi.fn((selector: string) => {
        if(selector === '#main-nav') return navStub;
        return documentStub.querySelector(selector);
      }),
      SelectionStore: {
        subscribe: vi.fn(),
        count: vi.fn(() => 0),
        clear: vi.fn(),
        get: vi.fn(() => new Set<string>()),
        set: vi.fn()
      },
      RenderGuard: {
        subscribeRender: vi.fn(),
        requestRender: vi.fn(),
        isRendering: vi.fn(() => false)
      },
      NONE_PARTNER_ID: 'none-id',
      __SEED_DATA__: null,
      crypto: { randomUUID: () => 'uuid' }
    };

    (globalThis as any).window = windowStub;
    (globalThis as any).document = documentStub;
    (globalThis as any).HTMLInputElement = function HTMLInputElement(){} as any;
    (globalThis as any).$all = windowStub.$all;
    (globalThis as any).$ = windowStub.$;

    (globalThis as any).DB_META = { STORES: [] };
    (globalThis as any).openDB = vi.fn(async () => {});
    (globalThis as any).dbGetAll = vi.fn(async () => []);
    (globalThis as any).dbBulkPut = vi.fn(async () => {});
    (globalThis as any).dbPut = vi.fn(async () => {});
    (globalThis as any).dbClear = vi.fn(async () => {});
    (globalThis as any).dbExportAll = vi.fn(async () => ({}));
    (globalThis as any).dbRestoreAll = vi.fn(async () => {});
    (globalThis as any).dbDelete = vi.fn(async () => {});
    (globalThis as any).dbGet = vi.fn(async () => null);

    vi.resetModules();
    await import(APP_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).DB_META;
    delete (globalThis as any).openDB;
    delete (globalThis as any).dbGetAll;
    delete (globalThis as any).dbBulkPut;
    delete (globalThis as any).dbPut;
    delete (globalThis as any).dbClear;
    delete (globalThis as any).dbExportAll;
    delete (globalThis as any).dbRestoreAll;
    delete (globalThis as any).dbDelete;
    delete (globalThis as any).dbGet;
    delete (globalThis as any).HTMLInputElement;
    delete (globalThis as any).document;
    delete (globalThis as any).$all;
    delete (globalThis as any).$;
    (globalThis as any).window = originalWindow;
    vi.unstubAllGlobals();
  });

  it('refreshes partners without triggering a global render', () => {
    const refresh = (window as any).__refreshByScope__;
    expect(typeof refresh).toBe('function');
    (window as any).renderPartners.mockClear();
    (window as any).renderAll.mockClear();
    const handled = refresh('partners');
    expect(handled).toBe(true);
    expect((window as any).renderPartners).toHaveBeenCalledTimes(1);
    expect((window as any).renderAll).not.toHaveBeenCalled();
  });

  it('coalesces partial partners change events', () => {
    (window as any).renderPartners.mockClear();
    (window as any).RenderGuard.requestRender.mockClear();
    const event = new CustomEvent('app:data:changed', { detail: { scope: 'partners', partial: true } });
    (document as any).dispatchEvent(event);
    expect((window as any).renderPartners).toHaveBeenCalledTimes(1);
    expect((window as any).RenderGuard.requestRender).not.toHaveBeenCalled();
  });

  it('falls back to global render when scope not handled', () => {
    (window as any).renderPartners.mockClear();
    (window as any).RenderGuard.requestRender.mockClear();
    const event = new CustomEvent('app:data:changed', { detail: { scope: 'reports' } });
    (document as any).dispatchEvent(event);
    expect((window as any).RenderGuard.requestRender).toHaveBeenCalledTimes(1);
  });
});
