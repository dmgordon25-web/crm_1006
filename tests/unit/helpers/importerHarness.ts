import { vi } from 'vitest';

const MODULE_PATH = '../../../crm-app/js/importer.js';

function createFakeElement() {
  const element: any = {
    style: {},
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn()
    },
    appendChild: vi.fn(() => element),
    removeChild: vi.fn(),
    remove: vi.fn(),
    querySelector: vi.fn(() => createFakeElement()),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    showModal: vi.fn(),
    close: vi.fn(),
    click: vi.fn(),
    focus: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ width: 0, height: 0 })),
    textContent: '',
    value: ''
  };
  Object.defineProperty(element, 'innerHTML', {
    configurable: true,
    enumerable: true,
    get() {
      return element.__innerHTML || '';
    },
    set(value) {
      element.__innerHTML = value;
    }
  });
  return element;
}

interface Harness {
  internals: any;
  cleanup: () => void;
}

export async function createImporterHarness(): Promise<Harness> {
  vi.resetModules();

  const previous = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    CustomEvent: (globalThis as any).CustomEvent,
    URL: (globalThis as any).URL,
    dbGetAll: (globalThis as any).dbGetAll,
    dbPut: (globalThis as any).dbPut,
    dbBulkPut: (globalThis as any).dbBulkPut,
    dbClear: (globalThis as any).dbClear,
    openDB: (globalThis as any).openDB,
    toast: (globalThis as any).toast
  };

  const elementsById = new Map<string, any>();

  const documentStub: any = {
    body: createFakeElement(),
    createElement: vi.fn(() => createFakeElement()),
    getElementById: vi.fn((id: string) => {
      if (!elementsById.has(id)) {
        const el = createFakeElement();
        elementsById.set(id, el);
      }
      return elementsById.get(id) || null;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  };

  const windowStub: any = {
    document: documentStub,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    CustomEvent: class {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init && 'detail' in (init as any) ? init!.detail : undefined;
      }
    }
  };

  const urlStub = {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn()
  };

  (globalThis as any).window = windowStub;
  (globalThis as any).document = documentStub;
  (globalThis as any).CustomEvent = windowStub.CustomEvent;
  (globalThis as any).URL = urlStub;

  const asyncNoop = vi.fn(async () => undefined);
  (globalThis as any).dbGetAll = vi.fn(async () => []);
  (globalThis as any).dbPut = asyncNoop;
  (globalThis as any).dbBulkPut = asyncNoop;
  (globalThis as any).dbClear = asyncNoop;
  (globalThis as any).openDB = vi.fn(async () => ({}));
  (globalThis as any).toast = vi.fn();

  windowStub.toast = (globalThis as any).toast;
  windowStub.NONE_PARTNER_ID = 'none-partner';

  const module = await import(MODULE_PATH);

  const cleanup = () => {
    if (previous.window === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previous.window;

    if (previous.document === undefined) delete (globalThis as any).document;
    else (globalThis as any).document = previous.document;

    if (previous.CustomEvent === undefined) delete (globalThis as any).CustomEvent;
    else (globalThis as any).CustomEvent = previous.CustomEvent;

    if (previous.URL === undefined) delete (globalThis as any).URL;
    else (globalThis as any).URL = previous.URL;

    if (previous.dbGetAll === undefined) delete (globalThis as any).dbGetAll;
    else (globalThis as any).dbGetAll = previous.dbGetAll;

    if (previous.dbPut === undefined) delete (globalThis as any).dbPut;
    else (globalThis as any).dbPut = previous.dbPut;

    if (previous.dbBulkPut === undefined) delete (globalThis as any).dbBulkPut;
    else (globalThis as any).dbBulkPut = previous.dbBulkPut;

    if (previous.dbClear === undefined) delete (globalThis as any).dbClear;
    else (globalThis as any).dbClear = previous.dbClear;

    if (previous.openDB === undefined) delete (globalThis as any).openDB;
    else (globalThis as any).openDB = previous.openDB;

    if (previous.toast === undefined) delete (globalThis as any).toast;
    else (globalThis as any).toast = previous.toast;

    delete (globalThis as any).__IMPORTER_INTERNALS_HARNESS__;
  };

  const internals = module.IMPORTER_INTERNALS;
  (globalThis as any).__IMPORTER_INTERNALS_HARNESS__ = internals;

  return { internals, cleanup };
}
