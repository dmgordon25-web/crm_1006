import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/ui/Toast.js';

describe('Toast host', () => {
  let body: { appendChild: ReturnType<typeof vi.fn>; contains: ReturnType<typeof vi.fn> };
  let appended: Set<unknown>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    appended = new Set();
    body = {
      appendChild: vi.fn((node: unknown) => {
        appended.add(node);
        return node;
      }),
      contains: vi.fn((node: unknown) => appended.has(node))
    };

    const head = {
      appendChild: vi.fn()
    };

    const createElement = vi.fn((_tag: string) => ({
      style: {},
      dataset: {},
      hidden: false,
      textContent: '',
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }
    }));

    const documentStub = {
      body,
      head,
      createElement
    } as unknown as Document;

    (globalThis as any).document = documentStub;
    (globalThis as any).window = { document: documentStub } as Window & typeof globalThis;

    vi.resetModules();
    await import(MODULE_PATH);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });

  it('coalesces duplicate show calls within 500ms', () => {
    const toast = (window as any).Toast;
    toast.show('Saved');
    expect(body.appendChild).toHaveBeenCalledTimes(1);

    toast.show('Saved');
    expect(body.appendChild).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(400);
    toast.show('Saved');
    expect(body.appendChild).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    toast.show('Saved');
    expect(body.appendChild).toHaveBeenCalledTimes(1);
  });
});
