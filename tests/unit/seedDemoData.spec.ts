import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SeedDemoData } = require('../../crm-app/seed_test_data.js');

describe('SeedDemoData', () => {
  function countBy(list: Array<Record<string, any>>, key: string) {
    return list.reduce<Record<string, number>>((acc, item) => {
      const value = item[key];
      if (value == null) {
        return acc;
      }
      const stringValue = String(value);
      acc[stringValue] = (acc[stringValue] || 0) + 1;
      return acc;
    }, {});
  }

  it('produces stable stage and loan type counts for identical seeds', () => {
    const options = {
      count: 63,
      stages: ['Application', 'ctc', 'funded'],
      loanTypes: ['FHA', 'VA'],
      seed: 'unit:test'
    };

    const datasetA = SeedDemoData.buildDataset(options);
    const datasetB = SeedDemoData.buildDataset(options);

    expect(datasetA.contacts).toHaveLength(63);
    expect(datasetB.contacts).toHaveLength(63);

    const stageCountsA = countBy(datasetA.contacts, 'stage');
    const stageCountsB = countBy(datasetB.contacts, 'stage');
    const loanCountsA = countBy(datasetA.contacts, 'loanType');
    const loanCountsB = countBy(datasetB.contacts, 'loanType');

    expect(stageCountsA).toEqual(stageCountsB);
    expect(loanCountsA).toEqual(loanCountsB);

    expect(stageCountsA).toEqual({
      application: 21,
      'cleared-to-close': 21,
      funded: 21
    });
    expect(Object.values(loanCountsA).sort()).toEqual([31, 32]);
  });

  it('normalizes stage aliases to canonical keys', () => {
    expect(SeedDemoData.normalizeStage('CTC')).toBe('cleared-to-close');
    expect(SeedDemoData.normalizeStage('Pre App')).toBe('preapproved');
    expect(SeedDemoData.normalizeStage('Application')).toBe('application');
  });
});
