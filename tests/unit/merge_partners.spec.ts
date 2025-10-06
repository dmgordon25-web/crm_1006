import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/db.js';

type StoreMap = Map<string, any>;

interface MergeEnv {
  stores: Record<'partners' | 'contacts' | 'relationships', StoreMap>;
  windowStub: any;
  dbDeleteSpy: ReturnType<typeof vi.fn>;
  cleanup: () => void;
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createStore(initial: any[]): StoreMap {
  const map: StoreMap = new Map();
  (initial || []).forEach((item) => {
    if (item && item.id != null) {
      map.set(String(item.id), clone(item));
    }
  });
  return map;
}

function createRequest(result: any) {
  const request: any = { result: clone(result), onsuccess: null, onerror: null };
  queueMicrotask(() => {
    if (typeof request.onsuccess === 'function') {
      request.onsuccess({ target: { result: request.result } });
    }
  });
  return request;
}

function createTransaction(stores: MergeEnv['stores']) {
  return {
    objectStore(name: keyof MergeEnv['stores']) {
      const store = stores[name];
      return {
        get(id: string) {
          return createRequest(store.get(String(id)) ?? null);
        },
        put(value: any) {
          const copy = clone(value);
          store.set(String(copy.id), copy);
          return createRequest(copy);
        },
        getAll() {
          return createRequest(Array.from(store.values()).map(clone));
        },
        delete(id: string) {
          store.delete(String(id));
          return createRequest(undefined);
        }
      };
    },
    oncomplete: null as ((event?: unknown) => void) | null,
    onerror: null as ((event?: unknown) => void) | null,
    onabort: null as ((event?: unknown) => void) | null
  };
}

async function setupMergeEnv(options?: { softDelete?: 'ok' | 'throw' | 'omit' }): Promise<MergeEnv> {
  vi.resetModules();

  const partners = createStore([
    {
      id: 'pKeep',
      partnerId: 'pKeep',
      name: 'Alpha Realty',
      company: 'Alpha Co',
      email: 'alpha@example.com',
      phone: '1112223333',
      tier: 'A',
      partnerType: 'Agent',
      focus: '',
      priority: 'High',
      preferredContact: 'Email',
      cadence: 'Monthly',
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      referralVolume: '5',
      lastTouch: '2023-01-01',
      nextTouch: '',
      relationshipOwner: 'Jordan',
      collaborationFocus: 'Events',
      notes: 'Primary notes',
      extras: { region: 'north', team: 'A' },
      createdAt: 1000
    },
    {
      id: 'pDrop',
      partnerId: 'pDrop',
      name: 'Beta Partners',
      company: 'Beta Co',
      email: '',
      phone: '9998887777',
      tier: 'B',
      partnerType: 'Builder',
      focus: 'Luxury',
      priority: '',
      preferredContact: '',
      cadence: '',
      address: '456 Market Rd',
      city: 'Dallas',
      state: 'TX',
      zip: '75001',
      referralVolume: '',
      lastTouch: '2023-02-02',
      nextTouch: '2023-03-03',
      relationshipOwner: '',
      collaborationFocus: 'CoMarketing',
      notes: 'Secondary notes',
      extras: { region: 'south', alias: 'Beta' },
      createdAt: 2000
    }
  ]);

  const contacts = createStore([
    {
      id: 'c1',
      contactId: 'c1',
      name: 'Contact One',
      partnerId: 'pDrop',
      buyerPartnerId: 'pDrop',
      listingPartnerId: 'pKeep',
      partnerIds: ['pDrop', 'pKeep', 'ally'],
      updatedAt: 1
    },
    {
      id: 'c2',
      contactId: 'c2',
      name: 'Contact Two',
      partnerId: 'ally',
      buyerPartnerId: 'ally',
      listingPartnerId: 'ally',
      partnerIds: ['ally'],
      updatedAt: 2
    }
  ]);

  const relationships = createStore([
    { id: 'r1', fromId: 'pDrop', toId: 'c1', edgeKey: 'pDrop::c1' },
    { id: 'r2', fromId: 'c2', toId: 'pDrop', edgeKey: 'c2::pDrop' }
  ]);

  const stores = { partners, contacts, relationships } as const;

  const fakeDb = {
    objectStoreNames: ['partners', 'contacts', 'relationships'],
    transaction() {
      const tx = createTransaction(stores);
      setTimeout(() => {
        if (typeof tx.oncomplete === 'function') {
          tx.oncomplete({ target: { result: undefined } });
        }
      }, 0);
      return tx;
    }
  };

  const windowStub: any = {
    document: {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    dispatchAppDataChanged: vi.fn(),
    toast: vi.fn(),
    CustomEvent: class {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init && init.detail ? init.detail : undefined;
      }
    }
  };

  if (options?.softDelete === 'omit') {
    delete windowStub.softDelete;
  } else if (options?.softDelete === 'throw') {
    windowStub.softDelete = vi.fn(async () => {
      throw new Error('soft delete failed');
    });
  } else {
    windowStub.softDelete = vi.fn(async (_store: string, id: string) => {
      partners.delete(String(id));
    });
  }

  (globalThis as any).__DB_CORE__ = {
    DB_NAME: 'test-db',
    DB_VERSION: 1,
    getDB: async () => fakeDb,
    useDB: async (fn: (db: typeof fakeDb) => any) => fn(fakeDb)
  };

  const dbDeleteSpy = vi.fn(async (store: keyof MergeEnv['stores'], id: string) => {
    stores[store].delete(String(id));
  });

  (globalThis as any).dbDelete = dbDeleteSpy;
  (globalThis as any).window = windowStub;
  (globalThis as any).document = windowStub.document;
  (globalThis as any).CustomEvent = windowStub.CustomEvent;
  (globalThis as any).openDB = vi.fn(async () => fakeDb);

  await import(MODULE_PATH);

  const cleanup = () => {
    delete (globalThis as any).__DB_CORE__;
    delete (globalThis as any).dbDelete;
    delete (globalThis as any).openDB;
    delete (globalThis as any).CustomEvent;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  };

  return { stores, windowStub, dbDeleteSpy, cleanup };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mergePartners', () => {
  it('merges records, updates references, and dispatches once', async () => {
    const env = await setupMergeEnv();
    const { stores, windowStub } = env;

    const result = await (windowStub as any).mergePartners('pKeep', 'pDrop', {});

    expect(result.keepId).toBe('pKeep');
    expect(result.dropId).toBe('pDrop');
    expect(result.contacts).toBe(1);
    expect(result.relationships).toBe(2);

    const merged = stores.partners.get('pKeep');
    expect(merged).toBeTruthy();
    expect(merged.focus).toBe('Luxury');
    expect(merged.notes).toContain('Primary notes');
    expect(merged.notes).toContain('Secondary notes');
    expect(merged.extras.region).toBe('south');
    expect(merged.extras.alias).toBe('Beta');
    expect(stores.partners.has('pDrop')).toBe(false);

    const contact = stores.contacts.get('c1');
    expect(contact.partnerId).toBe('pKeep');
    expect(contact.buyerPartnerId).toBe('pKeep');
    expect(contact.listingPartnerId).toBe('pKeep');
    expect(contact.partnerIds).toEqual(['pKeep', 'ally']);
    expect(contact.updatedAt).toBeGreaterThan(1);

    const rel1 = stores.relationships.get('r1');
    const rel2 = stores.relationships.get('r2');
    expect(rel1.fromId).toBe('pKeep');
    expect(rel1.toId).toBe('c1');
    expect(rel1.edgeKey).toBe('c1::pKeep');
    expect(rel2.fromId).toBe('c2');
    expect(rel2.toId).toBe('pKeep');
    expect(rel2.edgeKey).toBe('c2::pKeep');

    expect(windowStub.dispatchAppDataChanged).toHaveBeenCalledTimes(1);
    const detail = windowStub.dispatchAppDataChanged.mock.calls[0][0];
    expect(detail.scope).toBe('partners');
    expect(detail.action).toBe('merge');

    expect(windowStub.softDelete).toHaveBeenCalledTimes(1);

    env.cleanup();
  });

  it('falls back to dbDelete when softDelete throws', async () => {
    const env = await setupMergeEnv({ softDelete: 'throw' });
    const { windowStub, stores } = env;

    const result = await (windowStub as any).mergePartners('pKeep', 'pDrop', {});

    expect(result.keepId).toBe('pKeep');
    expect(windowStub.softDelete).toHaveBeenCalledTimes(1);
    expect(stores.partners.has('pDrop')).toBe(false);

    env.cleanup();
  });
});
