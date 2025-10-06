import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import vm from 'node:vm';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const jsRoot = resolve(repoRoot, 'crm-app/js');
const DB_NAME = 'crm';

function runScript(relativePath) {
  const code = readFileSync(join(jsRoot, relativePath), 'utf8');
  vm.runInThisContext(code, { filename: relativePath });
}

function clearListeners(map) {
  if (!map) return;
  for (const set of map.values()) {
    set.clear();
  }
  map.clear();
}

function deleteDatabase(name) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolvePromise();
    request.onerror = event => rejectPromise(event?.target?.error || event);
    request.onblocked = () => resolvePromise();
  });
}

let listeners;

function setupWindow() {
  listeners = new Map();
  global.window = global;
  window.__INIT_FLAGS__ = {};
  window.__PATCHES_LOADED__ = [];
  window.addEventListener = (type, handler) => {
    if (typeof handler !== 'function') return;
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
  };
  window.removeEventListener = (type, handler) => {
    const set = listeners.get(type);
    if (!set) return;
    set.delete(handler);
    if (!set.size) listeners.delete(type);
  };
  window.dispatchEvent = event => {
    if (!event || !event.type) return true;
    const set = listeners.get(event.type);
    if (!set || !set.size) return true;
    event.target = window;
    event.currentTarget = window;
    [...set].forEach(handler => {
      handler.call(window, event);
    });
    return true;
  };
  global.CustomEvent = class {
    constructor(type, params = {}) {
      this.type = type;
      this.detail = params.detail;
      this.bubbles = Boolean(params.bubbles);
      this.cancelable = Boolean(params.cancelable);
      this.defaultPrevented = false;
      this.target = null;
      this.currentTarget = null;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

async function resetEnvironment() {
  if (global.window && window.__APP_DB__ && typeof window.__APP_DB__.close === 'function') {
    window.__APP_DB__.close();
  }
  if (global.window) {
    delete window.__APP_DB__;
  }
  await deleteDatabase(DB_NAME).catch(() => {});
  setupWindow();
  window.Toast = { show: vi.fn() };
  delete window.Settings;
  runScript('db.js');
  runScript('data/settings.js');
  window.dispatchAppDataChanged = detail => {
    window.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
  };
}

beforeEach(async () => {
  await resetEnvironment();
});

afterEach(async () => {
  if (window.__APP_DB__ && typeof window.__APP_DB__.close === 'function') {
    window.__APP_DB__.close();
  }
  delete window.__APP_DB__;
  await deleteDatabase(DB_NAME).catch(() => {});
  clearListeners(listeners);
});

describe('Settings data access', () => {
  it('merges partial saves, persists to IndexedDB, and dispatches once per save', async () => {
    const events = [];
    window.addEventListener('app:data:changed', evt => {
      events.push(evt.detail);
    });

    const baseline = await window.Settings.get();
    expect(baseline.goals.monthlyFundedGoal).toBe(0);
    expect(baseline.loProfile.name).toBe('');

    const firstSave = await window.Settings.save({
      goals: { monthlyFundedGoal: 12 },
      loProfile: { name: 'Initial' }
    });
    expect(firstSave.goals.monthlyFundedGoal).toBe(12);
    expect(firstSave.loProfile.name).toBe('Initial');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ scope: 'settings' });

    const stored = await window.dbGet('settings', 'app:settings');
    expect(stored).toBeTruthy();
    expect(stored.id).toBe('app:settings');
    expect(stored.goals.monthlyFundedGoal).toBe(12);

    const secondSave = await window.Settings.save({
      loProfile: { email: 'ada@example.com' },
      signature: {
        defaultId: 'primary',
        items: [
          { id: 'primary', title: 'Primary', body: 'Regards, Ada' }
        ]
      }
    });
    expect(secondSave.goals.monthlyFundedGoal).toBe(12);
    expect(secondSave.loProfile).toEqual({
      name: 'Initial',
      email: 'ada@example.com',
      phone: '',
      signature: '',
      photoDataUrl: ''
    });
    expect(secondSave.signature.items).toHaveLength(1);
    expect(secondSave.signature.defaultId).toBe('primary');
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ scope: 'settings' });

    expect(window.__SIGNATURE_CACHE__).toEqual({
      items: [
        { id: 'primary', title: 'Primary', body: 'Regards, Ada' }
      ],
      defaultId: 'primary',
      text: 'Regards, Ada'
    });
    expect(window.Toast.show).toHaveBeenCalledTimes(2);
    expect(window.Toast.show.mock.calls[0][0]).toBe('Saved');
    expect(window.Toast.show.mock.calls[1][0]).toBe('Saved');
    expect(window.__LO_PROFILE__).toEqual({
      name: 'Initial',
      email: 'ada@example.com',
      phone: '',
      signature: '',
      photoDataUrl: ''
    });

    const hydrated = await window.Settings.get();
    expect(hydrated.loProfile.email).toBe('ada@example.com');
    expect(hydrated.goals.monthlyFundedGoal).toBe(12);

    hydrated.goals.monthlyFundedGoal = 1;
    const followUp = await window.Settings.get();
    expect(followUp.goals.monthlyFundedGoal).toBe(12);
    expect(followUp.loProfile.email).toBe('ada@example.com');
  });

  it('normalizes dashboard preferences and merges widget visibility', async () => {
    const baseline = await window.Settings.get();
    expect(baseline.dashboard).toEqual({
      mode: 'today',
      widgets: {
        filters: true,
        kpis: true,
        pipeline: false,
        today: true,
        leaderboard: false,
        stale: false,
        insights: false,
        opportunities: false
      }
    });

    const afterMode = await window.Settings.save({ dashboard: { mode: 'all' } });
    expect(afterMode.dashboard.mode).toBe('all');
    expect(afterMode.dashboard.widgets.pipeline).toBe(false);

    const afterWidgets = await window.Settings.save({ dashboard: { widgets: { pipeline: true, leaderboard: true } } });
    expect(afterWidgets.dashboard.mode).toBe('all');
    expect(afterWidgets.dashboard.widgets.pipeline).toBe(true);
    expect(afterWidgets.dashboard.widgets.leaderboard).toBe(true);
    expect(afterWidgets.dashboard.widgets.filters).toBe(true);
  });

  it('invokes the toast API after a successful save', async () => {
    const spy = window.Toast.show;
    await window.Settings.save({ goals: { monthlyFundedGoal: 3 } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('Saved');
  });

  it('falls back to dispatchEvent when no dispatcher is registered', async () => {
    delete window.dispatchAppDataChanged;
    const events = [];
    const prevDocument = window.document;
    const docHandlers = new Set();
    const documentStub = {
      addEventListener: (type, handler) => {
        if(type !== 'app:data:changed' || typeof handler !== 'function') return;
        docHandlers.add(handler);
      },
      removeEventListener: (type, handler) => {
        if(type !== 'app:data:changed') return;
        docHandlers.delete(handler);
      },
      dispatchEvent: (event) => {
        if(!event || event.type !== 'app:data:changed') return true;
        docHandlers.forEach(fn => fn(event));
        return true;
      }
    };
    window.document = documentStub;
    global.document = documentStub;
    documentStub.addEventListener('app:data:changed', evt => {
      events.push(evt.detail);
    });

    try {
      await window.Settings.save({ goals: { monthlyVolumeGoal: 250000 } });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ scope: 'settings' });

      await window.Settings.save({ goals: { monthlyVolumeGoal: 500000 } });
      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({ scope: 'settings' });
    } finally {
      if(prevDocument){
        window.document = prevDocument;
        global.document = prevDocument;
      }else{
        delete window.document;
        delete global.document;
      }
    }
  });

  it('round-trips goals, signature, and profile with one dispatch per save', async () => {
    const events = [];
    window.addEventListener('app:data:changed', evt => events.push(evt.detail));

    await window.Settings.save({ goals: { monthlyFundedGoal: 9, monthlyVolumeGoal: 1250000 } });
    await window.Settings.save({
      signature: {
        defaultId: 'sig-1',
        items: [
          { id: 'sig-1', title: 'Primary', body: 'Thanks, {loName}' },
          { id: 'sig-2', title: 'Alt', body: 'Regards, {loName}' }
        ]
      }
    });
    await window.Settings.save({
      loProfile: {
        name: 'Jordan Blake',
        email: 'jordan@example.com',
        phone: '(555) 010-2222',
        signature: 'Sincerely, {loName}'
      }
    });

    expect(events).toHaveLength(3);
    events.forEach(detail => expect(detail).toEqual({ scope: 'settings' }));

    const snapshot = await window.Settings.refresh();

    expect(snapshot.goals.monthlyFundedGoal).toBe(9);
    expect(snapshot.goals.monthlyVolumeGoal).toBe(1250000);
    expect(typeof snapshot.goals.updatedAt).toBe('string');
    expect(Date.parse(snapshot.goals.updatedAt)).not.toBeNaN();
    expect(snapshot.goals).toEqual({
      monthlyFundedGoal: 9,
      monthlyVolumeGoal: 1250000,
      updatedAt: expect.any(String)
    });
    expect(snapshot.signature.defaultId).toBe('sig-1');
    expect(snapshot.signature.items).toHaveLength(2);
    expect(snapshot.signature.text).toBe('Thanks, {loName}');
    expect(snapshot.loProfile).toEqual({
      name: 'Jordan Blake',
      email: 'jordan@example.com',
      phone: '(555) 010-2222',
      signature: 'Sincerely, {loName}',
      photoDataUrl: ''
    });

    expect(window.__SIGNATURE_CACHE__).toEqual({
      items: [
        { id: 'sig-1', title: 'Primary', body: 'Thanks, {loName}' },
        { id: 'sig-2', title: 'Alt', body: 'Regards, {loName}' }
      ],
      defaultId: 'sig-1',
      text: 'Thanks, {loName}'
    });
    expect(window.__LO_PROFILE__).toEqual({
      name: 'Jordan Blake',
      email: 'jordan@example.com',
      phone: '(555) 010-2222',
      signature: 'Sincerely, {loName}',
      photoDataUrl: ''
    });

    const stored = await window.dbGet('settings', 'app:settings');
    expect(stored.goals.monthlyFundedGoal).toBe(9);
    expect(stored.signature.items).toHaveLength(2);
    expect(stored.loProfile.email).toBe('jordan@example.com');
  });
});
