import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/quick_add.js';

describe('Quick Add toast integration', () => {
  let windowStub: any;
  let documentStub: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();

    documentStub = {
      readyState: 'complete',
      querySelector: vi.fn().mockReturnValue(null),
      getElementById: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockImplementation(() => ({
        innerHTML: '',
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        querySelector: vi.fn().mockReturnValue(null),
        querySelectorAll: vi.fn().mockReturnValue([]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        style: {},
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    windowStub = {
      document: documentStub,
      STR: {},
      text: (key: string) => key,
      dispatchAppDataChanged: vi.fn(),
      Toast: { show: vi.fn() },
      openDB: vi.fn(async () => {}),
      dbPut: vi.fn(async (_store: string, value: any) => value),
      dbGet: vi.fn(async () => null),
      dbBulkPut: vi.fn(async () => {}),
      dbDelete: vi.fn(async () => {})
    };

    (globalThis as any).window = windowStub;
    (globalThis as any).document = documentStub;
    (globalThis as any).openDB = windowStub.openDB;
    (globalThis as any).dbPut = windowStub.dbPut;
    (globalThis as any).dbGet = windowStub.dbGet;
    (globalThis as any).dbBulkPut = windowStub.dbBulkPut;
    (globalThis as any).dbDelete = windowStub.dbDelete;

    await import(MODULE_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).openDB;
    delete (globalThis as any).dbPut;
    delete (globalThis as any).dbGet;
    delete (globalThis as any).dbBulkPut;
    delete (globalThis as any).dbDelete;
  });

  it('shows one toast after a successful quick add save', async () => {
    const hooks = windowStub.__QuickAddTestHooks__;
    expect(hooks).toBeTruthy();

    const elements = new Map<string, any>([
      ['first', { value: 'Ada' }],
      ['last', { value: 'Lovelace' }],
      ['email', { value: 'ada@example.com' }],
      ['phone', { value: '555-0100' }],
      ['notes', { value: 'Interested in refinance' }]
    ]);

    const form = {
      elements: {
        namedItem: (name: string) => elements.get(name) || null
      },
      reset: vi.fn(),
      querySelector: vi.fn().mockReturnValue(null)
    } as unknown as HTMLFormElement;

    const dlg = {
      close: vi.fn(),
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
      hasAttribute: vi.fn().mockReturnValue(false),
      style: { display: '' }
    } as unknown as HTMLDialogElement;

    await hooks.handleSave(form, dlg);

    expect(windowStub.dbPut).toHaveBeenCalledWith('contacts', expect.any(Object));
    expect(windowStub.Toast.show).toHaveBeenCalledTimes(1);
    expect(windowStub.Toast.show).toHaveBeenCalledWith('Created');
  });
});
