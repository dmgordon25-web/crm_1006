import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/state/selectionStore.js';

async function loadStore(){
  vi.resetModules();
  const dispatchSpy = vi.fn();
  class CustomEvt {
    constructor(type, init){
      this.type = type;
      this.detail = init && init.detail ? init.detail : undefined;
    }
  }
  (globalThis as any).window = {
    dispatchEvent: dispatchSpy,
    CustomEvent: CustomEvt
  };
  const mod = await import(MODULE_PATH);
  return { SelectionStore: mod.SelectionStore, dispatchSpy };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
});

describe('SelectionStore', () => {
  it('supports toggle/set/clear/count/isSelected semantics', async () => {
    const { SelectionStore, dispatchSpy } = await loadStore();
    const cb = vi.fn();
    const unsubscribe = SelectionStore.subscribe(cb);

    expect(SelectionStore.count('contacts')).toBe(0);
    SelectionStore.toggle('alpha', 'contacts');
    expect(SelectionStore.isSelected('alpha', 'contacts')).toBe(true);
    expect(Array.from(SelectionStore.get('contacts'))).toEqual(['alpha']);
    expect(SelectionStore.count('contacts')).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('app:data:changed');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual({
      scope: 'selection',
      selectionScope: 'contacts',
      ids: ['alpha']
    });

    cb.mockReset();
    dispatchSpy.mockReset();

    SelectionStore.toggle('alpha', 'contacts');
    expect(SelectionStore.isSelected('alpha', 'contacts')).toBe(false);
    expect(SelectionStore.count('contacts')).toBe(0);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('app:data:changed');

    unsubscribe();
  });

  it('fires one change event per mutation for set/clear', async () => {
    const { SelectionStore, dispatchSpy } = await loadStore();
    const cb = vi.fn();
    SelectionStore.subscribe(cb);

    SelectionStore.set(['a', 'b'], 'partners');
    expect(Array.from(SelectionStore.get('partners'))).toEqual(['a', 'b']);
    expect(SelectionStore.count('partners')).toBe(2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('app:data:changed');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual({
      scope: 'selection',
      selectionScope: 'partners',
      ids: ['a', 'b']
    });

    cb.mockReset();
    dispatchSpy.mockReset();

    SelectionStore.clear('partners');
    expect(SelectionStore.count('partners')).toBe(0);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('app:data:changed');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual({
      scope: 'selection',
      selectionScope: 'partners',
      ids: []
    });
  });

  it('dispatches when clear is invoked on an already empty scope', async () => {
    const { SelectionStore, dispatchSpy } = await loadStore();
    const cb = vi.fn();
    SelectionStore.subscribe(cb);

    SelectionStore.clear('contacts');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('app:data:changed');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual({
      scope: 'selection',
      selectionScope: 'contacts',
      ids: []
    });
  });
});
