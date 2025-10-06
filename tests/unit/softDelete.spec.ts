import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/services/softDelete.js';

type RecordMap = Map<string, any>;

const clone = <T>(value: T): T => (value == null ? value : JSON.parse(JSON.stringify(value)));

let stores: Map<string, RecordMap>;
let dispatchSpy: ReturnType<typeof vi.fn>;
let toastSpy: ReturnType<typeof vi.fn>;
let lastUndo: (() => Promise<unknown>) | null;
let ttl: number;

function ensureStore(name: string): RecordMap {
  if(!stores.has(name)) stores.set(name, new Map());
  return stores.get(name)!;
}

function isPending(record: any): boolean {
  const value = Number(record?.deletedAtPending);
  return Number.isFinite(value) && value > 0;
}

function isDeleted(record: any): boolean {
  if(record?.isDeleted) return true;
  const value = Number(record?.deletedAt);
  return Number.isFinite(value) && value > 0;
}

function seed(initial: Record<string, any[]>){
  stores.clear();
  Object.entries(initial).forEach(([store, rows]) => {
    const map = ensureStore(store);
    map.clear();
    (rows||[]).forEach(row => {
      if(row && row.id != null){
        map.set(String(row.id), clone(row));
      }
    });
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  stores = new Map();
  dispatchSpy = vi.fn();
  lastUndo = null;
  toastSpy = vi.fn((input: any) => {
    if(input && typeof input === 'object' && input.action && typeof input.action.onClick === 'function'){
      // eslint-disable-next-line @typescript-eslint/ban-types
      lastUndo = input.action.onClick as unknown as () => Promise<unknown>;
    }
  });

  const documentStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  } as unknown as Document;

  const windowStub = {
    dispatchAppDataChanged: dispatchSpy,
    toast: toastSpy,
    document: documentStub
  } as unknown as typeof window;

  (globalThis as any).window = windowStub;
  (globalThis as any).document = documentStub;
  (globalThis as any).openDB = vi.fn(async () => {});
  (globalThis as any).dbGet = vi.fn(async (store: string, id: string, opts?: { includePending?: boolean; includeDeleted?: boolean }) => {
    const map = ensureStore(store);
    const record = map.get(String(id));
    if(!record) return null;
    const copy = clone(record);
    const includePending = !!(opts && opts.includePending);
    const includeDeleted = !!(opts && opts.includeDeleted);
    if(!includePending && isPending(copy)) return null;
    if(!includeDeleted && isDeleted(copy)) return null;
    return copy;
  });
  (globalThis as any).dbPut = vi.fn(async (store: string, value: any) => {
    if(!value || value.id == null) return value;
    const map = ensureStore(store);
    map.set(String(value.id), clone(value));
    return value;
  });
  (globalThis as any).dbGetAll = vi.fn(async (store: string, opts?: { includePending?: boolean; includeDeleted?: boolean }) => {
    const map = ensureStore(store);
    const includePending = !!(opts && opts.includePending);
    const includeDeleted = !!(opts && opts.includeDeleted);
    const rows: any[] = [];
    map.forEach(record => {
      const copy = clone(record);
      if(!includePending && isPending(copy)) return;
      if(!includeDeleted && isDeleted(copy)) return;
      rows.push(copy);
    });
    return rows;
  });
  windowStub.openDB = (globalThis as any).openDB;
  windowStub.dbGet = (globalThis as any).dbGet;
  windowStub.dbPut = (globalThis as any).dbPut;
  windowStub.dbGetAll = (globalThis as any).dbGetAll;

  await import(MODULE_PATH);
  ttl = Number((window as any).__SOFT_DELETE_SERVICE__?.ttl || 15000);
});

afterEach(() => {
  vi.useRealTimers();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).document;
  delete (globalThis as any).openDB;
  delete (globalThis as any).dbGet;
  delete (globalThis as any).dbPut;
  delete (globalThis as any).dbGetAll;
});

describe('softDelete service', () => {
  it('marks records pending and dispatches once', async () => {
    seed({ contacts: [{ id: 'c1', name: 'Ada' }] });
    const result = await (window as any).softDelete('contacts', 'c1', { source: 'test' });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const detail = dispatchSpy.mock.calls[0][0];
    expect(detail.action).toBe('soft-delete');
    expect(detail.entity).toBe('contacts');

    const pending = await (globalThis as any).dbGet('contacts', 'c1', { includePending: true, includeDeleted: true });
    expect(pending).not.toBeNull();
    expect(Number(pending.deletedAtPending)).toBeGreaterThan(0);
    expect(pending.isDeleted).toBe(false);
  });

  it('undo within TTL restores the record without loss', async () => {
    seed({ contacts: [{ id: 'c2', name: 'Lin' }] });

    await (window as any).softDelete('contacts', 'c2', { source: 'test' });
    expect(typeof lastUndo).toBe('function');
    await (lastUndo as (() => Promise<unknown>))();

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const restored = await (globalThis as any).dbGet('contacts', 'c2');
    expect(restored).not.toBeNull();
    expect(restored.deletedAtPending).toBeUndefined();
    expect(restored.isDeleted).not.toBe(true);

    await vi.advanceTimersByTimeAsync(ttl + 20);
    const afterTimers = await (globalThis as any).dbGet('contacts', 'c2');
    expect(afterTimers).not.toBeNull();
  });

  it('finalizes after TTL and removes from active queries', async () => {
    seed({ contacts: [{ id: 'c3', name: 'Nik' }] });

    await (window as any).softDelete('contacts', 'c3', { source: 'test' });
    await vi.advanceTimersByTimeAsync(ttl + 50);

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const raw = await (globalThis as any).dbGet('contacts', 'c3', { includePending: true, includeDeleted: true });
    expect(raw).not.toBeNull();
    expect(raw.isDeleted).toBe(true);
    expect(Number(raw.deletedAtPending||0)).toBe(0);

    const active = await (globalThis as any).dbGet('contacts', 'c3');
    expect(active).toBeNull();
  });
});
