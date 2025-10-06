import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/calendar_impl.js';

async function loadCalendarImpl(){
  vi.resetModules();
  const documentStub = {
    getElementById: vi.fn(),
    querySelector: vi.fn(),
    createElement: vi.fn(),
    addEventListener: vi.fn()
  } as unknown as Document;

  const windowStub = {
    document: documentStub
  } as unknown as typeof window;

  (globalThis as any).document = documentStub;
  (globalThis as any).window = windowStub;

  await import(MODULE_PATH);
  return windowStub as typeof window & { __CALENDAR_IMPL__: any };
}

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
});

describe('calendar loan legend', () => {
  it('exposes a stable loan palette mapping', async () => {
    const windowStub = await loadCalendarImpl();
    const palette = windowStub.__CALENDAR_IMPL__.__test__.loanPalette;
    expect(palette).toMatchInlineSnapshot(`
      [
        {
          "css": "loan-purchase",
          "key": "fha",
          "label": "FHA",
        },
        {
          "css": "loan-refi",
          "key": "va",
          "label": "VA",
        },
        {
          "css": "loan-heloc",
          "key": "conv",
          "label": "Conventional",
        },
        {
          "css": "loan-construction",
          "key": "jumbo",
          "label": "Jumbo",
        },
        {
          "css": "loan-other",
          "key": "other",
          "label": "Other",
        },
      ]
    `);
  });

  it('normalizes loan types into the palette keys', async () => {
    const windowStub = await loadCalendarImpl();
    const normalize = windowStub.__CALENDAR_IMPL__.__test__.normalizeLoanType as (value: string) => string;
    expect([
      normalize('FHA Streamline'),
      normalize('va IRRRL'),
      normalize('Conventional 30yr'),
      normalize('JUMBO Fixed'),
      normalize('Refinance - Cash Out'),
      normalize('Unknown'),
    ]).toEqual(['fha', 'va', 'conv', 'jumbo', 'conv', 'other']);
  });
});
