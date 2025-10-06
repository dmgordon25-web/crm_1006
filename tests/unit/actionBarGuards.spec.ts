import { describe, expect, it } from 'vitest';

import { computeActionBarGuards } from '../../crm-app/js/state/actionBarGuards.js';

describe('computeActionBarGuards', () => {
  it('disables all actions when nothing is selected', () => {
    const guards = computeActionBarGuards(0);
    expect(guards).toEqual({
      edit: false,
      merge: false,
      emailTogether: false,
      emailMass: false,
      addTask: false,
      bulkLog: false,
      convertToPipeline: false,
      delete: false,
      clear: false
    });
  });

  it('enables edit for a single selection', () => {
    const guards = computeActionBarGuards(1);
    expect(guards).toEqual({
      edit: true,
      merge: false,
      emailTogether: true,
      emailMass: true,
      addTask: true,
      bulkLog: true,
      convertToPipeline: true,
      delete: true,
      clear: true
    });
  });

  it('enforces merge-only for exactly two selections', () => {
    const guards = computeActionBarGuards(2);
    expect(guards).toEqual({
      edit: false,
      merge: true,
      emailTogether: true,
      emailMass: true,
      addTask: true,
      bulkLog: true,
      convertToPipeline: false,
      delete: true,
      clear: true
    });
  });

  it('keeps bulk actions enabled for more than two selections', () => {
    const guards = computeActionBarGuards(4);
    expect(guards).toEqual({
      edit: false,
      merge: false,
      emailTogether: true,
      emailMass: true,
      addTask: true,
      bulkLog: true,
      convertToPipeline: false,
      delete: true,
      clear: true
    });
  });
});
