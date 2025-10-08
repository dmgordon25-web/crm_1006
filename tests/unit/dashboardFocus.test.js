import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
const scriptsBaseUrl = new URL('../../crm-app/js/', import.meta.url);
let scriptLoadCounter = 0;
const DB_NAME = 'crm';

async function runScript(relativePath) {
  const url = new URL(relativePath, scriptsBaseUrl);
  url.searchParams.set('v', `${Date.now()}-${scriptLoadCounter += 1}`);
  await import(url.href);
}

class StubClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    names.forEach(name => this.set.add(name));
  }
  remove(...names) {
    names.forEach(name => this.set.delete(name));
  }
  toggle(name, force) {
    if (force === undefined) {
      if (this.set.has(name)) {
        this.set.delete(name);
        return false;
      }
      this.set.add(name);
      return true;
    }
    if (force) {
      this.set.add(name);
      return true;
    }
    this.set.delete(name);
    return false;
  }
  contains(name) {
    return this.set.has(name);
  }
}

function toDatasetKey(attr) {
  return attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function createMatcher(selector) {
  if (!selector) return () => false;
  selector = selector.trim();
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return node => node.id === id;
  }
  const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(="([^"]*)")?\]$/i);
  if (dataMatch) {
    const key = toDatasetKey(dataMatch[1]);
    const value = dataMatch[3];
    return node => {
      if (!node.dataset) return false;
      if (!(key in node.dataset)) return false;
      if (value == null) return true;
      return node.dataset[key] === value;
    };
  }
  return () => false;
}

class StubElement {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.innerHTML = '';
    this.dataset = {};
    this.style = {};
    this.classList = new StubClassList();
    this.attributes = {};
    this.listeners = new Map();
  }
  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter(item => item !== child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type, handler) {
    if (typeof handler !== 'function') return;
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(handler);
    if (!set.size) this.listeners.delete(type);
  }
  dispatchEvent(event) {
    if (!event || !event.type) return true;
    event.target = this;
    event.currentTarget = this;
    const set = this.listeners.get(event.type);
    if (!set || !set.size) return true;
    [...set].forEach(handler => handler.call(this, event));
    return !event.defaultPrevented;
  }
  setAttribute(name, value) {
    const val = String(value);
    this.attributes[name] = val;
    if (name === 'id') {
      this.id = val;
    }
    if (name.startsWith('data-')) {
      this.dataset[toDatasetKey(name.slice(5))] = val;
    }
  }
  getAttribute(name) {
    if (name.startsWith('data-')) {
      return this.dataset[toDatasetKey(name.slice(5))] ?? null;
    }
    return this.attributes[name] ?? null;
  }
  querySelectorAll(selector) {
    const results = [];
    const matcher = createMatcher(selector);
    const visit = node => {
      node.children.forEach(child => {
        if (matcher(child)) results.push(child);
        visit(child);
      });
    };
    visit(this);
    return results;
  }
  querySelector(selector) {
    const matcher = createMatcher(selector);
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (matcher(node)) return node;
      stack.unshift(...node.children);
    }
    return null;
  }
  closest(selector) {
    const matcher = createMatcher(selector);
    let node = this;
    while (node) {
      if (matcher(node)) return node;
      node = node.parentNode;
    }
    return null;
  }
}

let listeners;
let documentListeners;
let nodes;
let dashboardHook;

function deleteDatabase(name) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolvePromise();
    request.onerror = event => rejectPromise(event?.target?.error || event);
    request.onblocked = () => resolvePromise();
  });
}

function setupEnvironment() {
  listeners = new Map();
  documentListeners = new Map();
  nodes = new Map();
  dashboardHook = null;

  global.window = global;
  window.__INIT_FLAGS__ = {};
  window.__PATCHES_LOADED__ = [];
  window.Toast = { show: vi.fn() };

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
    [...set].forEach(handler => handler.call(window, event));
    return !event.defaultPrevented;
  };
  window.registerRenderHook = fn => {
    if (typeof fn === 'function') {
      dashboardHook = fn;
    }
  };

  const body = new StubElement('body');

  function registerNode(id, element) {
    if (id) {
      element.id = id;
      nodes.set(id, element);
    }
    return element;
  }

  const documentStub = {
    body,
    readyState: 'complete',
    createElement: () => new StubElement(),
    addEventListener: (type, handler) => {
      if (typeof handler !== 'function') return;
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      const set = documentListeners.get(type);
      if (!set) return;
      set.delete(handler);
      if (!set.size) documentListeners.delete(type);
    },
    dispatchEvent: event => {
      if (!event || !event.type) return true;
      const set = documentListeners.get(event.type);
      if (!set || !set.size) return true;
      event.target = documentStub;
      event.currentTarget = documentStub;
      [...set].forEach(handler => handler.call(documentStub, event));
      return !event.defaultPrevented;
    },
    getElementById: id => nodes.get(id) || null,
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: selector => body.querySelector(selector)
  };

  global.document = documentStub;

  const header = registerNode('dashboard-header', new StubElement('dashboard-header'));
  body.appendChild(header);
  const caption = registerNode('dashboard-mode-caption', new StubElement('dashboard-mode-caption'));
  header.appendChild(caption);
  const toggleRow = new StubElement();
  header.appendChild(toggleRow);
  const todayBtn = new StubElement();
  todayBtn.setAttribute('data-dashboard-mode', 'today');
  todayBtn.classList.add('btn', 'pill', 'active');
  toggleRow.appendChild(todayBtn);
  const allBtn = new StubElement();
  allBtn.setAttribute('data-dashboard-mode', 'all');
  allBtn.classList.add('btn', 'pill');
  toggleRow.appendChild(allBtn);

  const focus = registerNode('dashboard-focus', new StubElement('dashboard-focus'));
  body.appendChild(focus);
  const filters = registerNode('dashboard-filters', new StubElement('dashboard-filters'));
  body.appendChild(filters);
  const kpis = registerNode('dashboard-kpis', new StubElement('dashboard-kpis'));
  body.appendChild(kpis);
  const pipeline = registerNode('dashboard-pipeline-overview', new StubElement('dashboard-pipeline-overview'));
  body.appendChild(pipeline);
  const today = registerNode('dashboard-today', new StubElement('dashboard-today'));
  body.appendChild(today);
  const leaderboard = registerNode('referral-leaderboard', new StubElement('referral-leaderboard'));
  body.appendChild(leaderboard);
  const stale = registerNode('dashboard-stale', new StubElement('dashboard-stale'));
  body.appendChild(stale);
  const insights = registerNode('dashboard-insights', new StubElement('dashboard-insights'));
  body.appendChild(insights);
  const opportunities = registerNode('dashboard-opportunities', new StubElement('dashboard-opportunities'));
  body.appendChild(opportunities);

  global.CustomEvent = class {
    constructor(type, params = {}) {
      this.type = type;
      this.detail = params.detail;
      this.bubbles = Boolean(params.bubbles);
      this.cancelable = Boolean(params.cancelable);
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  };

  window.dispatchAppDataChanged = detail => {
    const event = new CustomEvent('app:data:changed', { detail });
    window.dispatchEvent(event);
    if (document && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
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
  setupEnvironment();
  vi.resetModules();
  await runScript('db.js');
  await runScript('data/settings.js');
  await runScript('patch_2025-09-26_phase3_dashboard_reports.js');
}

async function seedData() {
  await window.openDB();
  const now = new Date();
  const todayIso = now.toISOString();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = tomorrow.toISOString();

  await window.dbPut('contacts', {
    id: 'c-1',
    first: 'Ada',
    last: 'Lovelace',
    stage: 'lead',
    createdAt: todayIso
  });
  await window.dbPut('contacts', {
    id: 'c-2',
    first: 'Grace',
    last: 'Hopper',
    stage: 'application',
    createdAt: todayIso
  });
  await window.dbPut('contacts', {
    id: 'c-3',
    first: 'Alan',
    last: 'Turing',
    stage: 'pre-app',
    createdAt: tomorrowIso
  });

  await window.dbPut('tasks', {
    id: 't-1',
    contactId: 'c-1',
    title: 'Collect documents',
    due: todayIso
  });
  await window.dbPut('tasks', {
    id: 't-2',
    contactId: 'c-2',
    title: 'Consultation call',
    due: tomorrowIso,
    type: 'Appointment'
  });
}

function clearListeners(map) {
  if (!map) return;
  for (const set of map.values()) {
    set.clear();
  }
  map.clear();
}

async function flushDashboard() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe('Dashboard focus layout', () => {
  beforeEach(async () => {
    await resetEnvironment();
    await seedData();
    if (typeof dashboardHook === 'function') {
      await dashboardHook();
    } else if (typeof window.renderDashboard === 'function') {
      await window.renderDashboard({ forceReload: true });
    }
  });

  afterEach(async () => {
    if (window.__APP_DB__ && typeof window.__APP_DB__.close === 'function') {
      window.__APP_DB__.close();
    }
    delete window.__APP_DB__;
    await deleteDatabase(DB_NAME).catch(() => {});
    clearListeners(listeners);
    clearListeners(documentListeners);
    dashboardHook = null;
    delete global.document;
    delete global.window;
  });

  it('renders Today view with focus widgets and hides secondary sections by default', async () => {
    const focus = document.getElementById('dashboard-focus');
    const filters = document.getElementById('dashboard-filters');
    const kpis = document.getElementById('dashboard-kpis');
    const insights = document.getElementById('dashboard-insights');
    expect(focus.classList.contains('hidden')).toBe(false);
    expect(focus.innerHTML).toContain('Due Today');
    expect(filters.classList.contains('hidden')).toBe(true);
    expect(kpis.classList.contains('hidden')).toBe(true);
    expect(insights.classList.contains('hidden')).toBe(true);
  });

  it('switches to All mode and shows configured widgets', async () => {
    await window.Settings.save({ dashboard: { mode: 'all' } });
    await flushDashboard();
    const focus = document.getElementById('dashboard-focus');
    const filters = document.getElementById('dashboard-filters');
    const kpis = document.getElementById('dashboard-kpis');
    const today = document.getElementById('dashboard-today');
    expect(focus.classList.contains('hidden')).toBe(true);
    expect(filters.classList.contains('hidden')).toBe(false);
    expect(kpis.classList.contains('hidden')).toBe(false);
    expect(today.classList.contains('hidden')).toBe(false);
  });

  it('persists widget visibility toggles across reloads', async () => {
    await window.Settings.save({ dashboard: { mode: 'all' } });
    await flushDashboard();
    await window.Settings.save({ dashboard: { widgets: { pipeline: true } } });
    await flushDashboard();
    const pipeline = document.getElementById('dashboard-pipeline-overview');
    expect(pipeline.classList.contains('hidden')).toBe(false);

    await window.Settings.refresh();
    if (typeof dashboardHook === 'function') {
      await dashboardHook();
    } else if (typeof window.renderDashboard === 'function') {
      await window.renderDashboard({ forceReload: true });
    }
    const pipelineAfter = document.getElementById('dashboard-pipeline-overview');
    expect(pipelineAfter.classList.contains('hidden')).toBe(false);
  });
});
