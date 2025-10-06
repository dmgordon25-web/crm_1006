import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/patch_2025-09-27_merge_ui.js';

type ContactRecord = Record<string, any>;

type StoreMap = Map<string, any>;

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function setupDom() {
  const windowStub: any = {
    __INIT_FLAGS__: {},
    __PATCHES_LOADED__: [],
    NONE_PARTNER_ID: 'none',
    STORES: ['contacts', 'tasks', 'documents'],
    toast: vi.fn(),
    repointLinks: vi.fn().mockResolvedValue(undefined),
    dispatchAppDataChanged: vi.fn(),
    SelectionService: { clear: vi.fn() },
    bulkAppendLog: vi.fn().mockResolvedValue(undefined)
  };
  const documentStub: any = {
    body: { appendChild: () => {}, removeChild: () => {} },
    getElementById: () => null,
    createElement(tag: string) {
      return {
        tagName: tag,
        style: {},
        dataset: {},
        appendChild: () => {},
        remove: () => {},
        setAttribute: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
        innerHTML: '',
        className: '',
        id: ''
      };
    },
    dispatchEvent: vi.fn()
  };
  (globalThis as any).window = windowStub;
  (globalThis as any).document = documentStub;
}

function teardownDom() {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
}

describe('contact merge UI', () => {
  beforeEach(() => {
    vi.resetModules();
    setupDom();
  });

  afterEach(() => {
    delete (globalThis as any).openDB;
    delete (globalThis as any).dbGet;
    delete (globalThis as any).dbPut;
    delete (globalThis as any).dbGetAll;
    delete (globalThis as any).dbBulkPut;
    delete (globalThis as any).dbDelete;
    teardownDom();
    vi.restoreAllMocks();
  });

  it('resolves conflicting fields and preserves extras from both contacts', async () => {
    await import(MODULE_PATH);
    const hooks = (window as any).__CONTACT_MERGE_TEST__;
    expect(hooks).toBeTruthy();

    const contactA: ContactRecord = {
      id: 'a',
      first: 'Ada',
      email: '',
      updatedAt: 10,
      notes: 'Primary notes',
      extras: { alpha: 'one' }
    };
    const contactB: ContactRecord = {
      id: 'b',
      first: 'Ada',
      email: 'ada@example.com',
      updatedAt: 20,
      notes: 'Secondary notes',
      extras: { beta: 'two' }
    };

    const state = hooks.createState([contactA, contactB], { baseIndex: 0 });
    const result = hooks.compute(state);

    expect(result.merged.email).toBe('ada@example.com');
    expect(result.merged.extras.alpha).toBe('one');
    expect(result.merged.extras.beta).toBe('two');
    expect(result.changes).toContain('email');
  });

  it('merges records, rewires linked items, and dispatches once', async () => {
    await import(MODULE_PATH);
    const hooks = (window as any).__CONTACT_MERGE_TEST__;

    const contactsStore: StoreMap = new Map();
    const tasksStore: StoreMap = new Map();
    const documentsStore: StoreMap = new Map();

    contactsStore.set('keep', {
      id: 'keep',
      first: 'Jordan',
      email: '',
      buyerPartnerId: '',
      listingPartnerId: 'p-list',
      notes: 'Primary notes',
      extras: { focus: 'alpha' },
      updatedAt: 10,
      createdAt: 1
    });
    contactsStore.set('drop', {
      id: 'drop',
      first: 'Jordan',
      email: 'merged@example.com',
      buyerPartnerId: 'p-buy',
      listingPartnerId: '',
      notes: 'Secondary notes',
      extras: { region: 'beta' },
      updatedAt: 20,
      createdAt: 2
    });

    tasksStore.set('t1', {
      id: 't1',
      title: 'Follow up',
      contactId: 'drop',
      updatedAt: 5
    });

    const stores: Record<string, StoreMap> = {
      contacts: contactsStore,
      tasks: tasksStore,
      documents: documentsStore,
      activity: new Map()
    };

    (globalThis as any).openDB = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).dbGet = vi.fn(async (store: string, id: string) => {
      const map = stores[store];
      if (!map) return undefined;
      return clone(map.get(String(id)));
    });
    (globalThis as any).dbPut = vi.fn(async (store: string, value: any) => {
      const map = stores[store];
      if (!map) return value;
      const copy = clone(value);
      map.set(String(copy.id), copy);
      return copy;
    });
    (globalThis as any).dbGetAll = vi.fn(async (store: string) => {
      const map = stores[store];
      if (!map) return [];
      return Array.from(map.values()).map(clone);
    });
    (globalThis as any).dbBulkPut = vi.fn(async (store: string, records: any[]) => {
      const map = stores[store];
      if (!map) return;
      records.forEach((record) => {
        const copy = clone(record);
        map.set(String(copy.id), copy);
      });
    });
    (globalThis as any).dbDelete = vi.fn(async (store: string, id: string) => {
      const map = stores[store];
      if (!map) return;
      map.delete(String(id));
    });

    const confirmStub = { disabled: false } as { disabled: boolean };
    const dialogStub = { close: vi.fn(), removeAttribute: vi.fn(), style: {} };

    const state = hooks.createState([
      clone(contactsStore.get('keep')),
      clone(contactsStore.get('drop'))
    ], {
      baseIndex: 0,
      dialog: dialogStub,
      nodes: { confirm: confirmStub, error: null }
    });

    await hooks.executeMerge(state);
    await Promise.resolve();

    expect((window as any).dispatchAppDataChanged).toHaveBeenCalledTimes(1);
    expect((document as any).dispatchEvent).not.toHaveBeenCalled();

    const merged = contactsStore.get('keep');
    expect(merged).toBeTruthy();
    expect(merged?.email).toBe('merged@example.com');
    expect(merged?.buyerPartnerId).toBe('p-buy');
    expect(merged?.listingPartnerId).toBe('p-list');
    expect(merged?.extras.focus).toBe('alpha');
    expect(merged?.extras.region).toBe('beta');
    expect(merged?.notes).toContain('Primary notes');
    expect(merged?.notes).toContain('Secondary notes');

    expect(contactsStore.has('drop')).toBe(false);

    const rewiredTask = tasksStore.get('t1');
    expect(rewiredTask?.contactId).toBe('keep');

    expect(confirmStub.disabled).toBe(true);
  });
});
