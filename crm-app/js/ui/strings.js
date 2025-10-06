export const STR = {
  'general.close': 'Close',
  'general.save': 'Save',
  'general.delete': 'Delete',
  'general.none': 'None',
  'general.no-data': 'No data available.',
  'general.stage': 'Stage',
  'general.partner': 'Partner',
  'general.contact': 'Contact',
  'general.pipeline': 'Pipeline',
  'general.days': '{count} days',
  'general.auto-created-partners': 'auto-created partners: {count}',
  'general.all-required-auto': 'All required fields auto-mapped ✔',
  'general.defaults-preselected': 'Defaults are pre-selected when possible.',
  'modal.add-contact.title': 'Add Contact',
  'modal.add-contact.submit': 'Create Contact',
  'modal.add-contact.toast-missing-name': 'Enter a first or last name to create a contact.',
  'modal.add-contact.notes-placeholder': 'Add context or next steps',
  'field.first-name': 'First Name',
  'field.last-name': 'Last Name',
  'field.email': 'Email',
  'field.phone': 'Phone',
  'field.notes': 'Notes',
  'settings.signatures.empty': 'No saved signatures yet.',
  'settings.signatures.table-empty': 'No signatures saved yet. Click Add to create one.',
  'settings.signatures.placeholder-name': 'Signature name',
  'settings.signatures.placeholder-body': 'Kind regards,\nName',
  'settings.signatures.preview-empty': 'No saved signatures yet.',
  'settings.profile.prompt': 'Set your profile',
  'settings.toast.profile-saved': 'Profile saved',
  'settings.toast.goals-saved': 'Goals saved',
  'importer.title': 'Import Records from CSV',
  'importer.mode.label': 'Mode',
  'importer.mode.merge': 'Merge (deduplicate by ID or matching fields)',
  'importer.mode.replace': 'Replace (clear existing records first)',
  'importer.mode.merge-tooltip': 'Merge keeps existing records and updates matches while adding new ones.',
  'importer.mode.replace-tooltip': 'Replace removes existing records before importing this file.',
  'importer.step.partners': 'Step 1 — Partners',
  'importer.step.contacts': 'Step 2 — Contacts',
  'importer.step.description': 'Upload CSV. Known headers auto-map; extras are preserved.',
  'importer.placeholder.choose-column': '— choose column —',
  'importer.button.import-partners': 'Import Partners',
  'importer.button.import-contacts': 'Import Contacts',
  'importer.status.detected-columns': 'Detected {count} columns. Map required fields:',
  'importer.button.save-default': 'Save as default',
  'importer.error.missing-mapping': 'Missing mapping for: {fields}',
  'importer.error.truncated-header': 'Detected truncated column header(s): {headers}. Export a fresh CSV with full column names.',
  'importer.status.imported': 'Imported: {count}',
  'importer.status.imported-with-auto': 'Imported: {count} ({extra})',
  'importer.status.error': '{message}',
  'importer.tooltip.partners': 'Partner records include contact details and relationship data.',
  'importer.tooltip.contacts': 'Contact records include borrowers, prospects, and referral details.',
  'importer.status.defaults-preselected': 'Defaults are pre-selected when possible.',
  'importer.status.auto-map-note': 'All required fields auto-mapped ✔',
  'importer.status.mapping-help': 'Detected {count} columns. Map required fields:',
  'stage.long-shot': 'Long Shot',
  'stage.application': 'Application',
  'stage.processing': 'Processing',
  'stage.processing-verb': 'Move to Processing',
  'stage.underwriting': 'Underwriting',
  'stage.approved': 'Approved',
  'stage.cleared-to-close': 'Cleared to Close',
  'stage.funded': 'Funded',
  'stage.post-close': 'Post-Close',
  'stage.nurture': 'Nurture',
  'stage.lost': 'Lost',
  'stage.denied': 'Denied',
  'stage.pipeline': 'Pipeline',
  'tooltip.loan-estimate': 'Loan Estimate: the disclosure sent within three business days of application.',
  'tooltip.closing-disclosure': 'Closing Disclosure: the final statement of loan terms and closing costs.',
  'tooltip.pipeline': 'Pipeline shows deals grouped by current milestone.',
  'dashboard.reports.title': 'Reports',
  'dashboard.reports.subtitle': 'Ready-made snapshots with exportable CSVs.',
  'dashboard.reports.tab.stage': 'Contacts by Stage',
  'dashboard.reports.tab.partner': 'Partner Performance',
  'dashboard.reports.tab.past-clients': 'Past Clients',
  'dashboard.reports.tab.fallout': 'Loan Fallout',
  'dashboard.reports.export': 'Export CSV',
  'dashboard.reports.no-data': 'No data available.',
  'dashboard.reports.headers.stage': 'Stage',
  'dashboard.reports.headers.count': 'Count',
  'dashboard.reports.headers.percent-pipeline': 'Percent of Pipeline',
  'dashboard.reports.headers.partner': 'Partner',
  'dashboard.reports.headers.referrals': 'Referrals',
  'dashboard.reports.headers.funded': 'Funded',
  'dashboard.reports.headers.funded-volume': 'Funded Volume',
  'dashboard.reports.headers.avg-days-to-close': 'Average Days to Closing',
  'dashboard.reports.headers.name': 'Name',
  'dashboard.reports.headers.funded-date': 'Funded Date',
  'dashboard.reports.headers.loan-amount': 'Loan Amount',
  'dashboard.reports.headers.next-review': 'Next Review',
  'dashboard.reports.headers.reason': 'Reason',
  'dashboard.reports.headers.percent': 'Percent',
  'dashboard.reports.summary.funded-volume': '{amount}',
  'calendar.legend.event-types': 'Event Types',
  'calendar.legend.loan-types': 'Loan Types',
  'calendar.event.follow-up': 'Follow-Up',
  'calendar.event.closing': 'Closing',
  'calendar.event.funded': 'Funded',
  'calendar.event.task': 'Task',
  'calendar.event.deal': 'Deal',
  'calendar.event.birthday': 'Birthday',
  'calendar.event.anniversary': 'Anniversary',
  'calendar.subtitle.next-touch': 'Next Touch',
  'calendar.subtitle.closing': 'Closing',
  'calendar.subtitle.funded': 'Funded',
  'calendar.subtitle.deal': 'Deal',
  'calendar.subtitle.birthday': 'Birthday',
  'calendar.subtitle.anniversary': 'Anniversary',
  'calendar.modal.events-title': 'Events',
  'calendar.legend.loan-type.fha': 'FHA',
  'calendar.legend.loan-type.va': 'VA',
  'calendar.legend.loan-type.conv': 'Conventional',
  'calendar.legend.loan-type.jumbo': 'Jumbo',
  'calendar.legend.loan-type.other': 'Other',
  'calendar.legend.tooltip.loan-types': 'Loan color coding reflects the loan program for quick scanning.',
  'calendar.legend.tooltip.events': 'Icons highlight the type of milestone or reminder.',
  'kanban.placeholder.pipeline': 'Pipeline',
  'kanban.placeholder.client': 'Client',
  'kanban.placeholder.stage': 'Stage',
  'toast.signature.save-failed': 'Signature save failed',
  'toast.signature.delete-failed': 'Signature delete failed',
  'toast.signature.default-failed': 'Signature default update failed',
  'toast.settings.hydrate-failed': 'Settings hydrate failed',
  'toast.signature.preview-empty': 'No saved signatures yet.',
  'tooltip.cleared-to-close': 'Cleared to Close means all conditions are satisfied and documents are ready for signing.',
  'tooltip.processing': 'Processing verifies documents and collects outstanding borrower items.',
  'tooltip.underwriting': 'Underwriting reviews the file for credit, collateral, and capacity.',
  'tooltip.nurture': 'Nurture keeps prospects warm with automated touchpoints.'
};

const LEGACY_ALIAS = {
  'quickAdd.title': 'modal.add-contact.title',
  'quickAdd.submit': 'modal.add-contact.submit',
  'quickAdd.toast.missingName': 'modal.add-contact.toast-missing-name',
  'importer.mode.merge': 'importer.mode.merge',
  'importer.mode.replace': 'importer.mode.replace'
};

function resolveKey(key) {
  if (!key) return key;
  if (STR[key]) return key;
  if (LEGACY_ALIAS[key]) return LEGACY_ALIAS[key];
  const kebab = key.replace(/\./g, '-');
  if (STR[kebab]) return kebab;
  return key;
}

export function text(key, params) {
  const resolved = resolveKey(key);
  const template = STR[resolved];
  if (!template) return key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, token) => {
    const value = params[token];
    return value == null ? '' : String(value);
  });
}

export function legacyText(key, params) {
  return text(key, params);
}

if (typeof window !== 'undefined') {
  window.STR = STR;
  window.getUiString = text;
}
