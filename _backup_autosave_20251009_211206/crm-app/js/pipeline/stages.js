/* eslint-disable no-console */
const STAGE_DEFINITIONS = [
  {
    key: 'lead',
    label: 'Lead',
    aliases: [
      'Long Shot',
      'LongShot',
      'Long-Shot',
      'Leads',
      'Prospect',
      'New Lead',
      'Buyer Lead',
      'Buyer-Lead'
    ]
  },
  {
    key: 'application',
    label: 'Application',
    aliases: [
      'Application Started',
      'App Started',
      'Application-Started',
      'Nurture'
    ]
  },
  {
    key: 'preapproved',
    label: 'Pre-Approved',
    aliases: [
      'PreApproved',
      'Preapproved',
      'Pre Approved',
      'Pre-Approved',
      'Pre App',
      'Pre-App',
      'Preapp',
      'Pre Application',
      'Pre-Application',
      'Preapproval',
      'Pre-Approval',
      'Pre Approval'
    ]
  },
  {
    key: 'processing',
    label: 'Processing',
    aliases: []
  },
  {
    key: 'underwriting',
    label: 'Underwriting',
    aliases: ['UW', 'Under-write', 'Underwrite', 'Under Writing']
  },
  {
    key: 'approved',
    label: 'Approved',
    aliases: []
  },
  {
    key: 'cleared-to-close',
    label: 'CTC',
    aliases: [
      'CTC',
      'Clear to Close',
      'Clear-To-Close',
      'Clear-to-Close',
      'Clear 2 Close',
      'Clear2Close',
      'Cleared to Close',
      'Cleared-To-Close',
      'Cleared-to-Close',
      'Cleared 2 Close',
      'Cleared2Close',
      'Clear to-close'
    ]
  },
  {
    key: 'funded',
    label: 'Funded',
    aliases: [
      'Funded/Closed',
      'Closed',
      'Clients',
      'Client',
      'Past Client',
      'Past Clients',
      'Post Close',
      'Post-Close',
      'Funding'
    ]
  }
];

const KEY_TO_LABEL = new Map();
const LABEL_TO_KEY = new Map();
const ALIAS_TO_KEY = new Map();

function registerToken(token, key) {
  const raw = String(token ?? '').trim();
  if (!raw) return;
  const lowered = raw.toLowerCase();
  const dashed = lowered.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  const squished = lowered.replace(/[^a-z0-9]+/g, '');
  [lowered, dashed, squished].forEach((variant) => {
    if (variant) {
      ALIAS_TO_KEY.set(variant, key);
    }
  });
}

function registerStage(definition) {
  const { key, label, aliases = [] } = definition;
  KEY_TO_LABEL.set(key, label);
  LABEL_TO_KEY.set(label.toLowerCase(), key);
  const tokens = new Set([label, key, ...aliases]);
  tokens.forEach((token) => registerToken(token, key));
}

STAGE_DEFINITIONS.forEach(registerStage);

function registerAdditional(key, label, aliases = []) {
  KEY_TO_LABEL.set(key, label);
  LABEL_TO_KEY.set(label.toLowerCase(), key);
  const tokens = new Set([label, key, ...aliases]);
  tokens.forEach((token) => registerToken(token, key));
}

registerAdditional('lost', 'Lost', ['Lost']);
registerAdditional('denied', 'Denied', ['Denied']);
registerToken('long-shot', 'lead');
registerToken('longshot', 'lead');

export const PIPELINE_STAGE_KEYS = STAGE_DEFINITIONS.map((def) => def.key);
export const PIPELINE_STAGES = STAGE_DEFINITIONS.map((def) => def.label);

const FALLBACK_KEY = 'processing';
const FALLBACK_LABEL = KEY_TO_LABEL.get(FALLBACK_KEY) || 'Processing';
let warnedUnknownStage = false;

function resolveKey(value) {
  if (Array.isArray(value)) {
    return value.length ? resolveKey(value[0]) : null;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (ALIAS_TO_KEY.has(lowered)) return ALIAS_TO_KEY.get(lowered);
  const dashed = lowered.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (dashed && ALIAS_TO_KEY.has(dashed)) return ALIAS_TO_KEY.get(dashed);
  const squished = lowered.replace(/[^a-z0-9]+/g, '');
  if (squished && ALIAS_TO_KEY.has(squished)) return ALIAS_TO_KEY.get(squished);
  if (LABEL_TO_KEY.has(lowered)) return LABEL_TO_KEY.get(lowered);
  return null;
}

export function normalizeStage(value) {
  const key = resolveKey(value);
  if (key && KEY_TO_LABEL.has(key)) {
    return KEY_TO_LABEL.get(key);
  }
  if (!warnedUnknownStage) {
    warnedUnknownStage = true;
    try { console?.warn?.('[pipelineStages] Unknown stage value; defaulting to Processing.', value); }
    catch (_err) {}
  }
  return FALLBACK_LABEL;
}

export const NORMALIZE_STAGE = normalizeStage;

export function stageKeyFromLabel(value) {
  const key = resolveKey(value);
  if (key) return key;
  const normalized = normalizeStage(value);
  const lookup = LABEL_TO_KEY.get(String(normalized ?? '').toLowerCase());
  if (lookup) return lookup;
  return FALLBACK_KEY;
}

export function stageLabelFromKey(key) {
  const resolved = resolveKey(key);
  if (resolved && KEY_TO_LABEL.has(resolved)) {
    return KEY_TO_LABEL.get(resolved);
  }
  const lowered = String(key ?? '').trim().toLowerCase();
  if (KEY_TO_LABEL.has(lowered)) {
    return KEY_TO_LABEL.get(lowered);
  }
  return FALLBACK_LABEL;
}
