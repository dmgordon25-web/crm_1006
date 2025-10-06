import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODULE_PATH = '../../crm-app/js/services/pipelineStages.js';

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
});

async function loadModule(){
  vi.resetModules();
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = { __INIT_FLAGS__: {} };
  const mod = await import(MODULE_PATH);
  return { mod, warnSpy };
}

describe('pipelineStages normalizeStage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes common aliases', async () => {
    const { warnSpy } = await loadModule();
    expect((globalThis as any).window.normalizeStage('application')).toBe('Application');
    expect((globalThis as any).window.normalizeStage('preapproved')).toBe('Pre-Approved');
    expect((globalThis as any).window.normalizeStage('Pre App')).toBe('Pre-Approved');
    expect((globalThis as any).window.normalizeStage('c.t.c.')).toBe('CTC');
    expect((globalThis as any).window.normalizeStage('Cleared to Close')).toBe('CTC');
    expect((globalThis as any).window.normalizeStage('funding')).toBe('Funded');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns only once for unknown values and defaults to Processing', async () => {
    const { warnSpy } = await loadModule();
    const normalizeStage = (globalThis as any).window.normalizeStage;
    expect(normalizeStage('unknown-stage')).toBe('Processing');
    expect(normalizeStage('another mystery')).toBe('Processing');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('exposes canonical key helpers', async () => {
    const { warnSpy } = await loadModule();
    const stageKeyFromLabel = (globalThis as any).window.stageKeyFromLabel;
    const stageLabelFromKey = (globalThis as any).window.stageLabelFromKey;
    expect(stageKeyFromLabel('Pre-Approved')).toBe('preapproved');
    expect(stageKeyFromLabel('cleared-to-close')).toBe('cleared-to-close');
    expect(stageKeyFromLabel('Lead')).toBe('lead');
    expect(stageLabelFromKey('cleared-to-close')).toBe('CTC');
    expect(stageLabelFromKey('lead')).toBe('Lead');
    warnSpy.mockRestore();
  });
});
