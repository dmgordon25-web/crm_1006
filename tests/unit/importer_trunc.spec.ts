import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createImporterHarness } from './helpers/importerHarness';

let internals: any;
let cleanup: () => void;

beforeAll(async () => {
  const harness = await createImporterHarness();
  internals = harness.internals;
  cleanup = harness.cleanup;
});

afterAll(() => {
  if (cleanup) cleanup();
});

describe('importer clamps', () => {
  it('clamps contact fields and tallies truncations', () => {
    const { clampContact } = internals;
    const stats = { count: 0 };
    const source = {
      first: 'A'.repeat(140),
      last: 'B'.repeat(140),
      address: '123 Main Street, '.repeat(30),
      notes: 'N'.repeat(12000)
    };

    const result = clampContact(source, stats);

    expect(result.first.length).toBe(120);
    expect(result.last.length).toBe(120);
    expect(result.address.length).toBe(200);
    expect(result.notes.length).toBe(10000);
    expect(stats.count).toBe(4);
    expect(source.first.length).toBe(140);
  });

  it('clamps partner fields without mutating input', () => {
    const { clampPartner } = internals;
    const stats = { count: 0 };
    const source = {
      name: 'Partner '.repeat(20),
      company: 'Company '.repeat(20),
      address: 'Address '.repeat(40),
      notes: 'Notes '.repeat(3000)
    };

    const result = clampPartner(source, stats);

    expect(result.name.length).toBe(120);
    expect(result.company.length).toBe(120);
    expect(result.address.length).toBe(200);
    expect(result.notes.length).toBe(10000);
    expect(stats.count).toBe(4);
    expect(source.name.length).toBeGreaterThan(120);
  });
});
