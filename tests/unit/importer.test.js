import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let IMPORTER_INTERNALS;
let REQ_CONTACT;
let REQ_PARTNER;
let CONTACT_TEMPLATE_FIELDS;
let PARTNER_TEMPLATE_FIELDS;
let text;
let buildContactKeys;
let buildPartnerKeys;
let createIndex;
let pickExisting;
let findTruncatedHeaders;
let originalWindow;

beforeAll(async () => {
  originalWindow = global.window;
  global.window = global.window || globalThis;
  window.dbGet = vi.fn().mockResolvedValue(null);
  window.dbPut = vi.fn().mockResolvedValue(null);
  window.db = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(null)
  };
  window.dispatchAppDataChanged = vi.fn();
  window.Toast = { show: vi.fn() };

  const stringsModule = await import('../../crm-app/js/ui/strings.js');
  text = stringsModule.text;

  const importerModule = await import('../../crm-app/js/importer.js');
  ({
    IMPORTER_INTERNALS,
    REQ_CONTACT,
    REQ_PARTNER,
    CONTACT_TEMPLATE_FIELDS,
    PARTNER_TEMPLATE_FIELDS
  } = importerModule);

  ({
    buildContactKeys,
    buildPartnerKeys,
    createIndex,
    pickExisting,
    findTruncatedHeaders
  } = IMPORTER_INTERNALS);
  vi.resetModules();
});

afterAll(() => {
  if (window && window.__APP_DB__ && typeof window.__APP_DB__.close === 'function') {
    window.__APP_DB__.close();
  }
  if (window) {
    delete window.dbGet;
    delete window.dbPut;
    delete window.db;
    delete window.dispatchAppDataChanged;
    delete window.Toast;
  }
  if (originalWindow === undefined) {
    delete global.window;
  } else {
    global.window = originalWindow;
  }
});

describe('importer configuration', () => {
  it('includes required contact fields for v5 CSVs', () => {
    expect(REQ_CONTACT).toEqual(expect.arrayContaining(['state', 'zip', 'loanType', 'partnerLinkStatus']));
  });

  it('exposes required partner fields without truncation', () => {
    expect(REQ_PARTNER).toEqual(expect.arrayContaining(['partnerId', 'name', 'company', 'email', 'phone']));
  });

  it('publishes template fields without ellipsis placeholders', () => {
    const hasEllipsis = [...CONTACT_TEMPLATE_FIELDS, ...PARTNER_TEMPLATE_FIELDS].some(field => field.includes('...'));
    expect(hasEllipsis).toBe(false);
    expect(CONTACT_TEMPLATE_FIELDS).toEqual(expect.arrayContaining(['preApprovalExpires', 'expectedClosing']));
    expect(PARTNER_TEMPLATE_FIELDS).toEqual(expect.arrayContaining(['collaborationFocus', 'relationshipOwner']));
  });
});

describe('importer dedupe + normalization', () => {
  it('normalizes contact dedupe keys by id, email, phone, and fallback name/city', () => {
    const keys = buildContactKeys({
      contactId: ' 12345 ',
      email: 'User@Example.COM ',
      phone: '(555) 000-1111 x9',
      first: ' Ada ',
      last: ' Lovelace ',
      city: ' London '
    });
    expect(keys).toContain('id:12345');
    expect(keys).toContain('em:user@example.com');
    expect(keys).toContain('ph:5550001111x9');
    expect(keys).toContain('fb:ada|lovelace|london');
  });

  it('normalizes partner dedupe keys including partnerId and contact info', () => {
    const keys = buildPartnerKeys({
      partnerId: ' P-77 ',
      email: 'Broker@Example.com',
      phone: '+1 (555) 010-2020',
      name: 'Casey',
      company: ' Summit Realty ',
      city: 'Portland'
    });
    expect(keys).toContain('id:P-77');
    expect(keys).toContain('em:broker@example.com');
    expect(keys).toContain('ph:+15550102020');
    expect(keys).toContain('fb:casey|summit realty|portland');
  });

  it('matches existing contacts by normalized identifiers', () => {
    const existing = [{
      id: 'abc',
      contactId: 'C-42',
      email: 'existing@example.com',
      phone: '5551110000',
      first: 'Avery',
      last: 'Lee',
      city: 'Denver'
    }];
    const index = createIndex(existing, buildContactKeys);
    const incoming = {
      contactId: ' C-42 ',
      email: 'different@example.com',
      phone: '(555) 111-0000',
      first: 'Avery',
      last: 'Lee',
      city: 'Denver'
    };
    incoming._dedupeKeys = buildContactKeys(incoming);
    expect(pickExisting(incoming, index)).toBe(existing[0]);
  });

  it('matches partners by partnerId even when other fields differ', () => {
    const existing = [{
      id: 'p-1',
      partnerId: 'PID-100',
      email: 'original@example.com',
      phone: '555-010-3030',
      name: 'Jordan',
      company: 'Core Partners',
      city: 'Austin'
    }];
    const index = createIndex(existing, buildPartnerKeys);
    const incoming = {
      partnerId: ' PID-100 ',
      email: 'updated@example.com',
      phone: '+1 (555) 010-3030',
      name: 'Jordan',
      company: 'Core Partners',
      city: 'Austin'
    };
    incoming._dedupeKeys = buildPartnerKeys(incoming);
    expect(pickExisting(incoming, index)).toBe(existing[0]);
  });
});

describe('header validation', () => {
  it('flags truncated header tokens and produces a helpful message', () => {
    const truncated = findTruncatedHeaders(['state', 'loanType', 'preApprovalEx...']);
    expect(truncated).toEqual(['preApprovalEx...']);
    const message = text('importer.error.truncated-header', { headers: truncated.join(', ') });
    expect(message).toContain('preApprovalEx...');
  });
});
