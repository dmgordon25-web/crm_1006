import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/ical.js';

const noop = () => {};

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).document;
  delete (globalThis as any).openDB;
  delete (globalThis as any).dbGetAll;
  delete (globalThis as any).fullName;
  vi.useRealTimers();
});

async function loadIcalModule({ contacts, tasks }:{ contacts: any[]; tasks: any[]; }){
  vi.resetModules();
  const documentStub = {
    createElement: vi.fn().mockImplementation((tag: string) => ({
      tagName: tag.toUpperCase(),
      style: {},
      setAttribute: noop,
      appendChild: noop,
      addEventListener: noop,
      remove: noop,
      click: noop
    })),
    head: {
      appendChild: noop
    },
    body: {
      appendChild: noop,
      removeChild: noop
    }
  } as unknown as Document;

  const windowStub = {
    __INIT_FLAGS__: {},
    openDB: vi.fn(async () => {}),
    dbGetAll: vi.fn(async (store: string) => {
      if(store === 'contacts') return contacts;
      if(store === 'tasks') return tasks;
      return [];
    }),
    document: documentStub,
    Blob,
    URL,
    dispatchEvent: noop
  } as unknown as typeof window;

  (globalThis as any).document = documentStub;
  (globalThis as any).window = windowStub;
  (globalThis as any).openDB = windowStub.openDB;
  (globalThis as any).dbGetAll = windowStub.dbGetAll;
  const fullNameStub = (c: any) => [c?.first, c?.last].filter(Boolean).join(' ') || c?.name || '';
  (globalThis as any).fullName = fullNameStub;
  (windowStub as any).fullName = fullNameStub;

  await import(MODULE_PATH);
  return windowStub;
}

describe('ICS export', () => {
  it('generates calendar text with DTSTART, DTEND, and SUMMARY entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-15T00:00:00Z'));
    const now = Date.now();
    const contacts = [
      { id: 'c1', first: 'Alex', last: 'Smith', birthday: '1985-09-01', fundedDate: '2024-09-10' },
      { id: 'c2', name: 'Jamie Client', fundedDate: '2024-10-12' }
    ];
    const tasks = [
      { id: 't1', title: 'Call borrower', due: new Date(now + 3 * 86400000).toISOString(), done: false }
    ];

    const windowStub = await loadIcalModule({ contacts, tasks });
    const ics = await (windowStub as any).__generateIcsTextForTest();

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');

    const lines = ics.split(/\r?\n/).filter(Boolean);
    const dtstartLines = lines.filter(line => line.startsWith('DTSTART;VALUE=DATE:'));
    const dtendLines = lines.filter(line => line.startsWith('DTEND;VALUE=DATE:'));
    const summaryLines = lines.filter(line => line.startsWith('SUMMARY:'));

    expect(dtstartLines.length).toBeGreaterThanOrEqual(2);
    expect(dtendLines.length).toBeGreaterThanOrEqual(dtstartLines.length);
    expect(summaryLines.some(line => line.includes('🎂 Alex Smith'))).toBe(true);
    expect(summaryLines.some(line => line.includes('🏁 Alex Smith'))).toBe(true);
    expect(summaryLines.some(line => line.includes('🔔'))).toBe(true);

    const eventBlocks = ics.split('BEGIN:VEVENT').slice(1);
    eventBlocks.forEach((block) => {
      const eventLines = block.split('\r\n').map((line) => line.replace(/^\s+/, '')).filter(Boolean);
      const dtstartIndex = eventLines.findIndex((line) => line.startsWith('DTSTART'));
      const dtendIndex = eventLines.findIndex((line) => line.startsWith('DTEND'));
      expect(dtstartIndex).toBeGreaterThan(-1);
      expect(dtendIndex).toBeGreaterThan(-1);
      expect(dtstartIndex).toBeLessThan(dtendIndex);
    });

    const normalized = ics.split('\r\n').filter(Boolean);
    expect(normalized).toMatchInlineSnapshot(`
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//THE CRM Tool//Modular v1//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:crm:bday:c1@local",
        "DTSTAMP:20240915T000000Z",
        "DTSTART;VALUE=DATE:19850901",
        "DTEND;VALUE=DATE:19850902",
        "SUMMARY:🎂 Alex Smith — Birthday",
        "RRULE:FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=1",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:crm:funded:c1@local",
        "DTSTAMP:20240915T000000Z",
        "DTSTART;VALUE=DATE:20240910",
        "DTEND;VALUE=DATE:20240911",
        "SUMMARY:🏁 Alex Smith — Funding Anniversary",
        "RRULE:FREQ=YEARLY",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:crm:funded:c2@local",
        "DTSTAMP:20240915T000000Z",
        "DTSTART;VALUE=DATE:20241012",
        "DTEND;VALUE=DATE:20241013",
        "SUMMARY:🏁 Jamie Client — Funding Anniversary",
        "RRULE:FREQ=YEARLY",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:crm:task:t1@local",
        "DTSTAMP:20240915T000000Z",
        "DTSTART;VALUE=DATE:20240918",
        "DTEND;VALUE=DATE:20240919",
        "SUMMARY:🔔 Call borrower (Due)",
        "END:VEVENT",
        "END:VCALENDAR",
      ]
    `);
  });
});
