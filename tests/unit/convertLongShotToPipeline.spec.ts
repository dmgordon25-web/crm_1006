import { afterEach, describe, expect, it, vi } from 'vitest';

const PATCH_PATH = '../../crm-app/js/patch_2025-09-27_masterfix.js';

function createElementStub() {
  return {
    style: {},
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    remove: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
      contains: vi.fn(() => false)
    },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    getAttribute: vi.fn(() => null),
    setAttributeNS: vi.fn(),
    innerHTML: '',
    textContent: '',
    dataset: {},
    parentNode: null
  } as unknown as HTMLElement;
}

describe('convertLongShotToPipeline', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).CustomEvent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).openDB;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).dbGet;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).dbPut;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).dbGetAll;
  });

  it('promotes a Long Shot contact into the pipeline with a single dispatch', async () => {
    vi.resetModules();

    const contactStore = new Map<string, any>();
    const baseContact = {
      id: 'c1',
      stage: 'long-shot',
      stageEnteredAt: { 'long-shot': 1690000000000 },
      status: 'prospect',
      pipelineMilestone: 'Discovery Call',
      loanType: 'Conventional',
      missingDocs: ''
    };
    contactStore.set('c1', { ...baseContact });

    const dbPutSpy = vi.fn(async (store: string, record: any) => {
      if (store === 'contacts' && record) {
        contactStore.set(String(record.id || record.contactId), { ...record });
      }
      return record;
    });

    const dispatchSpy = vi.fn();
    const docDispatchSpy = vi.fn();
    const ensureRequiredDocs = vi.fn(async () => ({ created: 2, docs: [] }));
    const computeMissingDocsFrom = vi.fn(async () => '[]');

    const documentStub: any = {
      readyState: 'complete',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      getElementById: vi.fn(() => createElementStub()),
      createElement: vi.fn(() => createElementStub()),
      body: Object.assign(createElementStub(), { appendChild: vi.fn(), removeChild: vi.fn() }),
      head: Object.assign(createElementStub(), { appendChild: vi.fn(), removeChild: vi.fn() }),
      documentElement: { style: {} },
      dispatchEvent: docDispatchSpy
    };

    class CustomEvt {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init?.detail;
      }
    }

    const windowStub: any = {
      document: documentStub,
      __INIT_FLAGS__: {},
      __PATCHES_LOADED__: [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      CustomEvent: CustomEvt,
      toast: vi.fn(),
      RenderGuard: {
        enter: vi.fn(),
        exit: vi.fn(),
        isRendering: vi.fn(() => false)
      },
      dispatchAppDataChanged: dispatchSpy,
      ensureRequiredDocs,
      computeMissingDocsFrom,
      dbGetAll: vi.fn(async () => []),
      requestAnimationFrame: (cb: (time: number) => void) => cb(performance.now()),
      queueMicrotask,
      setTimeout,
      clearTimeout,
      SelectionStore: {
        subscribe: vi.fn(() => vi.fn()),
        count: vi.fn(() => 0),
        clear: vi.fn(),
        get: vi.fn(() => new Set())
      }
    };

    (globalThis as any).window = windowStub;
    (globalThis as any).document = documentStub;
    (globalThis as any).CustomEvent = CustomEvt;

    (globalThis as any).openDB = vi.fn(async () => {});
    (globalThis as any).dbGet = vi.fn(async (store: string, id: string) => {
      if (store !== 'contacts') return null;
      return contactStore.get(id) || null;
    });
    (globalThis as any).dbPut = dbPutSpy;
    (globalThis as any).dbGetAll = windowStub.dbGetAll;

    await import(PATCH_PATH);

    const convert = (windowStub as any).convertLongShotToPipeline;
    expect(typeof convert).toBe('function');

    const result = await convert('c1');
    expect(result).toMatchObject({ ok: true, docsCreated: 2, missingChanged: true });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const detail = dispatchSpy.mock.calls[0][0];
    expect(detail).toMatchObject({
      scope: 'contacts',
      contactId: 'c1',
      stage: 'application',
      partial: { lane: 'pipeline:application' }
    });
    expect(docDispatchSpy).not.toHaveBeenCalled();

    expect(dbPutSpy).toHaveBeenCalled();
    const updated = contactStore.get('c1');
    expect(updated.stage).toBe('application');
    expect(updated.status).toBe('inprogress');
    expect(updated.stageEnteredAt).toHaveProperty('application');
    expect(updated.pipelineMilestone).toBe('Discovery Call');
    expect(updated.missingDocs).toBe('[]');

    expect(ensureRequiredDocs).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), expect.any(Object));
    expect(computeMissingDocsFrom).toHaveBeenCalledWith([], updated.loanType);
  });
});
