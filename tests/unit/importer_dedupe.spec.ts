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

describe('importer dedupe', () => {
  it('reuses an existing contact when dedupe keys match', () => {
    const {
      buildContactKeys,
      createIndex,
      registerRecord,
      pickExisting,
      mergeContactRecord
    } = internals;

    const existing = {
      id: 'c1',
      contactId: 'c1',
      email: 'ann@example.com',
      first: 'Ann',
      last: 'Smith',
      city: 'Austin',
      extras: {}
    } as any;
    existing._dedupeKeys = buildContactKeys(existing);
    const index = createIndex([existing], buildContactKeys);

    const incoming = {
      id: 'new-id',
      contactId: 'new-id',
      email: 'ANN@example.com',
      first: 'Ann',
      last: 'Smith',
      city: 'Austin',
      extras: {}
    } as any;
    incoming._dedupeKeys = buildContactKeys(incoming);

    const match = pickExisting(incoming, index);
    expect(match).toBe(existing);

    const merged = mergeContactRecord(existing, incoming);
    expect(merged.id).toBe('c1');
    registerRecord(merged, index, buildContactKeys);
    expect(index.byId.size).toBe(1);
  });

  it('registers a new contact when keys are unique', () => {
    const { buildContactKeys, createIndex, registerRecord, pickExisting } = internals;

    const index = createIndex([], buildContactKeys);
    const first = {
      id: 'c1',
      contactId: 'c1',
      email: 'first@example.com',
      first: 'First',
      last: 'Person',
      city: 'Austin',
      extras: {}
    } as any;
    first._dedupeKeys = buildContactKeys(first);
    registerRecord(first, index, buildContactKeys);
    expect(index.byId.size).toBe(1);

    const second = {
      id: 'c2',
      contactId: 'c2',
      email: 'second@example.com',
      first: 'Second',
      last: 'Person',
      city: 'Dallas',
      extras: {}
    } as any;
    second._dedupeKeys = buildContactKeys(second);
    expect(pickExisting(second, index)).toBeNull();
    registerRecord(second, index, buildContactKeys);
    expect(index.byId.size).toBe(2);
  });
});
