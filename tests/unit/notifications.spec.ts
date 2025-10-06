import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/notifications.js';

describe('notifications compute pipeline', () => {
  let contactsData: any[];
  let tasksData: any[];
  let settingsData: any[];
  let module: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    (globalThis as any).window = globalThis;
    contactsData = [];
    tasksData = [];
    settingsData = [];
    (globalThis as any).openDB = vi.fn(async () => {});
    (globalThis as any).dbGetAll = vi.fn(async (store: string) => {
      if(store === 'contacts') return contactsData;
      if(store === 'tasks') return tasksData;
      if(store === 'settings') return settingsData;
      if(store === 'notifications') return [];
      return [];
    });
    (globalThis as any).dbGet = vi.fn(async () => null);
    (globalThis as any).dbPut = vi.fn(async () => {});
    (globalThis as any).dbBulkPut = vi.fn(async () => {});
    (globalThis as any).dbDelete = vi.fn(async () => {});
    (globalThis as any).__INIT_FLAGS__ = {};
    vi.resetModules();
    module = await import(MODULE_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).dbGetAll;
    delete (globalThis as any).dbGet;
    delete (globalThis as any).dbPut;
    delete (globalThis as any).dbBulkPut;
    delete (globalThis as any).dbDelete;
    delete (globalThis as any).openDB;
    delete (globalThis as any).__INIT_FLAGS__;
    delete (globalThis as any).window;
    vi.unstubAllGlobals();
  });

  it('includes a task due today in computed notifications', async () => {
    tasksData = [{ id: 't1', contactId: 'c1', done: false, due: '2025-01-01', title: 'Call' }];
    contactsData = [{ id: 'c1', first: 'Test', last: 'User' }];
    const list = await module.computeNotifications();
    expect(list.some((item: any) => item.type === 'taskDue')).toBe(true);
  });

  it('counts birthdays within the upcoming window', async () => {
    contactsData = [{ id: 'c2', first: 'Birthday', last: 'Person', birthday: '2025-01-11' }];
    const list = await module.computeNotifications();
    expect(list.some((item: any) => item.type === 'birthday')).toBe(true);
    const badge = await module.getBadgeCount();
    expect(badge).toBe(list.length);
  });
});
