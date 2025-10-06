import { describe, expect, it } from 'vitest';
import { STR, text } from '../../crm-app/js/ui/strings.ts';

describe('STR map', () => {
  it('includes critical mortgage terminology', () => {
    expect(STR['tooltip.closing-disclosure']).toBe('Closing Disclosure: the final statement of loan terms and closing costs.');
    expect(STR['stage.processing-verb']).toBe('Move to Processing');
    expect(text('importer.status.imported', { count: 5 })).toBe('Imported: 5');
  });

  it('matches snapshot for representative keys', () => {
    expect({
      addContact: STR['modal.add-contact.title'],
      cd: STR['tooltip.closing-disclosure'],
      le: STR['tooltip.loan-estimate'],
      pipeline: STR['tooltip.pipeline']
    }).toEqual({
      addContact: 'Add Contact',
      cd: 'Closing Disclosure: the final statement of loan terms and closing costs.',
      le: 'Loan Estimate: the disclosure sent within three business days of application.',
      pipeline: 'Pipeline shows deals grouped by current milestone.'
    });
  });
});
