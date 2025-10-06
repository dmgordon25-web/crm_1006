import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/patch_2025-09-26_phase1_pipeline_partners.js';

const noop = () => {};

let contactsStore: Map<string, any>;

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function loadModule(initialContacts: any[]){
  vi.resetModules();
  contactsStore = new Map(initialContacts.map(item => [String(item.id), clone(item)]));

  class FakeMutationObserver {
    callback: MutationCallback;
    constructor(callback: MutationCallback){
      this.callback = callback;
    }
    observe(){ /* noop */ }
    disconnect(){ /* noop */ }
  }

  (globalThis as any).MutationObserver = FakeMutationObserver;

  const documentStub = {
    readyState: 'complete',
    getElementById: vi.fn().mockReturnValue(null),
    querySelector: vi.fn().mockReturnValue(null),
    querySelectorAll: vi.fn().mockReturnValue([]),
    createElement: vi.fn().mockImplementation((tag: string) => ({
      tagName: String(tag).toUpperCase(),
      style: {},
      dataset: {},
      classList: { add: noop, remove: noop, toggle: noop },
      appendChild: noop,
      querySelector: vi.fn().mockReturnValue(null),
      querySelectorAll: vi.fn().mockReturnValue([]),
      addEventListener: noop,
      removeEventListener: noop,
      setAttribute: noop,
      removeAttribute: noop,
      innerHTML: '',
      textContent: ''
    })),
    head: {
      appendChild: noop,
      querySelector: vi.fn().mockReturnValue(null)
    },
    body: {
      appendChild: noop,
      querySelector: vi.fn().mockReturnValue(null),
      classList: { add: noop, remove: noop, toggle: noop }
    },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: vi.fn()
  } as unknown as Document;

  (globalThis as any).document = documentStub;

  const dispatchSpy = vi.fn();
  const raf = (cb: FrameRequestCallback) => { cb(Date.now()); return 0; };

  const dbGetAll = vi.fn(async (store: string) => {
    if(store === 'contacts'){
      return Array.from(contactsStore.values()).map(clone);
    }
    if(store === 'partners'){
      return [];
    }
    return [];
  });

  const dbGet = vi.fn(async (store: string, id: string) => {
    if(store !== 'contacts') return undefined;
    const record = contactsStore.get(String(id));
    return record ? clone(record) : undefined;
  });

  const dbPut = vi.fn(async (store: string, value: any) => {
    if(store === 'contacts' && value && value.id){
      contactsStore.set(String(value.id), clone(value));
    }
    return value;
  });

  const windowStub = {
    __INIT_FLAGS__: {},
    __PATCHES_LOADED__: [],
    CSS: { escape: (value: string) => value },
    dispatchAppDataChanged: dispatchSpy,
    requestAnimationFrame: raf,
    cancelAnimationFrame: noop,
    addEventListener: noop,
    removeEventListener: noop,
    registerRenderHook: noop,
    PipelineStages: {
      stageKeyFromLabel: (label: string) => {
        const raw = String(label || '').toLowerCase();
        if(raw === 'cleared to close') return 'cleared-to-close';
        if(raw === 'pre-approved' || raw === 'preapproved') return 'preapproved';
        return '';
      }
    },
    openDB: vi.fn(async () => {}),
    dbGetAll,
    dbGet,
    dbPut,
    dbBulkPut: vi.fn(async (_store: string, list: any[]) => list),
    dbDelete: vi.fn(async () => {}),
    document: documentStub,
    requestIdleCallback: (cb: () => void) => cb(),
    cancelIdleCallback: noop,
    toast: noop
  } as unknown as typeof window;

  (globalThis as any).window = windowStub;
  (globalThis as any).openDB = windowStub.openDB;
  (globalThis as any).dbGetAll = dbGetAll;
  (globalThis as any).dbGet = dbGet;
  (globalThis as any).dbPut = dbPut;
  (globalThis as any).dbBulkPut = windowStub.dbBulkPut;
  (globalThis as any).dbDelete = windowStub.dbDelete;

  await import(MODULE_PATH);

  return { updateContactStage: (window as any).updateContactStage as Function, dispatchSpy };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).document;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).MutationObserver;
  delete (globalThis as any).openDB;
  delete (globalThis as any).dbGetAll;
  delete (globalThis as any).dbGet;
  delete (globalThis as any).dbPut;
  delete (globalThis as any).dbBulkPut;
  delete (globalThis as any).dbDelete;
});

function getContact(id: string){
  return contactsStore.get(String(id));
}

describe('updateContactStage', () => {
  it('persists stage transitions and emits exactly one app:data:changed', async () => {
    const stageTs = Date.now() - 10_000;
    const { updateContactStage, dispatchSpy } = await loadModule([
      { id: '123', stage: 'processing', stageEnteredAt: { processing: stageTs } }
    ]);

    const result = await updateContactStage('123', 'underwriting', 'processing');
    expect(result).toBeTruthy();
    expect(result.stage).toBe('underwriting');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toMatchObject({ action: 'stage', contactId: '123', stage: 'underwriting' });

    const stored = getContact('123');
    expect(stored.stage).toBe('underwriting');
    expect(stored.stageEnteredAt).toHaveProperty('underwriting');
    expect(stored.stageEnteredAt.processing).toBe(stageTs);
  });

  it('restores previous stage metadata when reverting', async () => {
    const stageTs = Date.now() - 50_000;
    const { updateContactStage, dispatchSpy } = await loadModule([
      { id: '456', stage: 'funded', stageEnteredAt: { funded: stageTs } }
    ]);

    await updateContactStage('456', 'underwriting', 'funded');
    const mid = getContact('456');
    const underwritingTs = mid.stageEnteredAt.underwriting;

    await updateContactStage('456', 'funded', 'underwriting');

    const stored = getContact('456');
    expect(stored.stage).toBe('funded');
    expect(stored.stageEnteredAt.funded).toBe(stageTs);
    expect(stored.stageEnteredAt.underwriting).toBe(underwritingTs);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy.mock.calls[1][0]).toMatchObject({ action: 'stage', contactId: '456', stage: 'funded' });
  });
});
