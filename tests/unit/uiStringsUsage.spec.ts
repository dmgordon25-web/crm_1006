import { describe, expect, it, vi, afterEach } from 'vitest';

const STR_MODULE = '../../crm-app/js/ui/strings.js';

function baseElement(){
  const stub: any = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(() => baseElement()),
    querySelectorAll: vi.fn(() => []),
    appendChild: vi.fn(),
    append: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    closest: vi.fn(() => null),
    dataset: {},
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    showModal: vi.fn(),
    close: vi.fn(),
    hasAttribute: vi.fn(() => false),
    removeAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    reset: vi.fn()
  };
  return stub;
}

function stubGlobals(mapping: Record<string, () => any> = {}){
  const elements = new Map<string, any>();
  const doc = {
    readyState: 'complete',
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => baseElement()),
    getElementById: vi.fn((id: string) => {
      if(!elements.has(id)){
        const factory = mapping[id];
        elements.set(id, factory ? factory() : null);
      }
      return elements.get(id) || null;
    }),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn()
  } as unknown as Document;

  const windowStub: any = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    __INIT_FLAGS__: {},
    Settings: {
      get: vi.fn(async () => ({ loProfile: {}, goals: {}, signature: {} })),
      save: vi.fn(async () => ({}))
    },
    toast: vi.fn(),
    crypto: { randomUUID: vi.fn(() => 'stub-uuid') },
    renderAll: vi.fn()
  };

  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', windowStub);
  return { doc, windowStub, elements };
}

function mockStrings(used: string[]){
  vi.doMock(STR_MODULE, () => {
    const proxy = new Proxy({}, {
      get(_target, prop){
        const key = String(prop);
        used.push(key);
        return `__${key}__`;
      }
    });
    return {
      STR: proxy,
      text: (key: string) => {
        used.push(key);
        return `__${key}__`;
      },
      legacyText: (key: string) => `__${key}__`
    };
  });
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  // cleanup globals
  // @ts-ignore
  delete global.document;
  // @ts-ignore
  delete global.window;
});

describe('UI modules consume STR', () => {
  it('quick_add pulls modal copy from STR', async () => {
    const used: string[] = [];
    mockStrings(used);
    const { doc } = stubGlobals();
    const quickBtn = baseElement();
    doc.querySelector = vi.fn((selector: string) => selector === '[data-quick-add]' ? quickBtn : null);
    await import('../../crm-app/js/quick_add.js');
    expect(quickBtn.addEventListener).toHaveBeenCalled();
    const handler = quickBtn.addEventListener.mock.calls[0][1];
    handler({ preventDefault: vi.fn() });
    expect(used).toContain('modal.add-contact.title');
    expect(used).toContain('field.first-name');
  });

  it('importer dialog reads copy from STR', async () => {
    const used: string[] = [];
    mockStrings(used);
    const { elements } = stubGlobals({
      'btn-csv-import': () => ({ ...baseElement(), addEventListener: vi.fn() }),
      'btn-download-csv-template': () => ({ ...baseElement(), addEventListener: vi.fn() }),
      'csv-template-kind': () => ({ ...baseElement(), value: 'contacts' })
    });
    await import('../../crm-app/js/importer.js');
    const trigger = elements.get('btn-csv-import');
    expect(trigger?.addEventListener).toHaveBeenCalled();
    const handler = trigger?.addEventListener.mock.calls[0][1];
    handler?.({ preventDefault: vi.fn() });
    expect(used).toContain('importer.title');
    expect(used).toContain('importer.button.import-contacts');
  });

  it('calendar implementation uses STR entries', async () => {
    const used: string[] = [];
    mockStrings(used);
    const legendHost = baseElement();
    const viewShell = baseElement();
    viewShell.querySelector = vi.fn(() => legendHost);
    const { windowStub, doc } = stubGlobals({
      'view-calendar': () => viewShell,
      'calendar-legend': () => legendHost
    });
    await import('../../crm-app/js/calendar_impl.js');
    const render = windowStub.__CALENDAR_IMPL__.render as Function;
    await render(new Date(), 'month');
    expect(used).toContain('calendar.legend.event-types');
    expect(used).toContain('calendar.event.follow-up');
  });
});
