import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/ui/quick_add_unified.js';

describe('Unified Quick Add modal', () => {
  let windowStub: any;
  let documentStub: any;
  let contactSubmit: ((evt: any) => Promise<void>) | null;
  let partnerSubmit: ((evt: any) => Promise<void>) | null;
  let overlay: any;
  let overlayAttached: boolean;
  let removeChildSpy: any;

  beforeEach(async () => {
    vi.resetModules();

    contactSubmit = null;
    partnerSubmit = null;
    overlayAttached = false;

    const contactFormData = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '555-0100'
    };
    const partnerFormData = {
      company: 'Acme Co',
      name: 'Grace Hopper',
      email: 'grace@acme.test',
      phone: '555-0200'
    };

    const contactForm = {
      style: { display: '' },
      __data: contactFormData,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'submit') contactSubmit = handler as (evt: any) => Promise<void>;
      })
    } as any;

    const partnerForm = {
      style: { display: 'none' },
      __data: partnerFormData,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'submit') partnerSubmit = handler as (evt: any) => Promise<void>;
      })
    } as any;

    const tabContact = { style: { background: '#fff' }, addEventListener: vi.fn() } as any;
    const tabPartner = { style: { background: '#fff' }, addEventListener: vi.fn() } as any;
    const closeBtn = { addEventListener: vi.fn() } as any;
    const cancelButtons = [{ addEventListener: vi.fn() }, { addEventListener: vi.fn() }];

    removeChildSpy = vi.fn(() => { overlayAttached = false; });

    overlay = {
      style: {},
      parentElement: { removeChild: removeChildSpy },
      querySelector: vi.fn((selector: string) => {
        switch (selector) {
          case '.qa-form-contact':
          case '.qa-form[data-kind="contact"]':
            return contactForm;
          case '.qa-form-partner':
          case '.qa-form[data-kind="partner"]':
            return partnerForm;
          case '.qa-tab-contact':
            return tabContact;
          case '.qa-tab-partner':
            return tabPartner;
          case '.qa-close':
            return closeBtn;
          default:
            return null;
        }
      }),
      querySelectorAll: vi.fn((selector: string) => {
        if (selector === '.qa-cancel') return cancelButtons;
        return [];
      })
    };

    const templateStub = {
      innerHTML: '',
      content: {
        firstElementChild: overlay
      }
    };

    documentStub = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '.qa-overlay') return overlayAttached ? overlay : null;
        return null;
      }),
      querySelectorAll: vi.fn(() => []),
      createElement: vi.fn(() => templateStub),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: {
        appendChild: vi.fn((node: any) => {
          overlayAttached = true;
          node.parentElement = overlay.parentElement;
        }),
        removeChild: vi.fn()
      }
    } as any;

    windowStub = {
      document: documentStub,
      requestAnimationFrame: vi.fn((cb: any) => { cb(0); return 1; }),
      Contacts: { createQuick: vi.fn(async () => {}) },
      Partners: { createQuick: vi.fn(async () => {}) },
      dbPut: vi.fn(async () => {}),
      dispatchAppDataChanged: vi.fn()
    };

    class FormDataMock {
      private data: Record<string, string>;
      constructor(form: any) {
        this.data = form?.__data ?? {};
      }
      get(key: string) {
        return this.data[key];
      }
    }

    (globalThis as any).window = windowStub;
    (globalThis as any).document = documentStub;
    (globalThis as any).FormData = FormDataMock;

    const { wireQuickAddUnified } = await import(MODULE_PATH);
    wireQuickAddUnified();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).FormData;
  });

  it('saves contacts via Contacts.createQuick and dispatches a single repaint', async () => {
    expect(windowStub.QuickAddUnified).toBeTruthy();
    await windowStub.QuickAddUnified.open('contact');

    expect(typeof contactSubmit).toBe('function');

    const preventDefault = vi.fn();
    await contactSubmit!({ preventDefault } as any);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(windowStub.Contacts.createQuick).toHaveBeenCalledTimes(1);
    expect(windowStub.dbPut).not.toHaveBeenCalled();
    expect(windowStub.dispatchAppDataChanged).toHaveBeenCalledTimes(1);
    expect(windowStub.dispatchAppDataChanged).toHaveBeenCalledWith('quick-add:contact');
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to dbPut for partners when createQuick is unavailable', async () => {
    windowStub.Partners = {};
    windowStub.dispatchAppDataChanged.mockClear();
    windowStub.dbPut.mockClear();

    await windowStub.QuickAddUnified.open('partner');

    expect(typeof partnerSubmit).toBe('function');

    const preventDefault = vi.fn();
    await partnerSubmit!({ preventDefault } as any);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(windowStub.dbPut).toHaveBeenCalledWith('partners', expect.objectContaining({
      company: 'Acme Co',
      name: 'Grace Hopper'
    }));
    expect(windowStub.dispatchAppDataChanged).toHaveBeenCalledTimes(1);
    expect(windowStub.dispatchAppDataChanged).toHaveBeenCalledWith('quick-add:partner');
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
  });
});
