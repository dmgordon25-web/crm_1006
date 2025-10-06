(function(){
  if(window.__INIT_FLAGS__ && window.__INIT_FLAGS__.pipelineStages) return;
  window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {};
  window.__INIT_FLAGS__.pipelineStages = true;

  const previousCanonicalize = typeof window.canonicalizeStage === 'function'
    ? window.canonicalizeStage
    : (value)=> String(value == null ? '' : value).toLowerCase().trim();

  const STAGES = [
    'Application',
    'Pre-Approved',
    'Processing',
    'Underwriting',
    'Approved',
    'CTC',
    'Funded'
  ];

  const STAGE_MAP = {
    'application': 'Application',
    'app': 'Application',
    'new application': 'Application',
    'preapproved': 'Pre-Approved',
    'pre approved': 'Pre-Approved',
    'pre-approved': 'Pre-Approved',
    'preapproval': 'Pre-Approved',
    'pre approval': 'Pre-Approved',
    'pre-app': 'Pre-Approved',
    'pre app': 'Pre-Approved',
    'processing': 'Processing',
    'in processing': 'Processing',
    'process': 'Processing',
    'underwriting': 'Underwriting',
    'uw': 'Underwriting',
    'approved': 'Approved',
    'approval': 'Approved',
    'approved/clear to close': 'CTC',
    'ctc': 'CTC',
    'c.t.c.': 'CTC',
    'c t c': 'CTC',
    'cleared-to-close': 'CTC',
    'cleared to close': 'CTC',
    'clear to close': 'CTC',
    'clear-to-close': 'CTC',
    'funded': 'Funded',
    'funding': 'Funded',
    'funded/closed': 'Funded'
  };

  const LABEL_TO_KEY = {
    'Application': 'application',
    'Pre-Approved': 'preapproved',
    'Processing': 'processing',
    'Underwriting': 'underwriting',
    'Approved': 'approved',
    'CTC': 'cleared-to-close',
    'Funded': 'funded'
  };

  const KEY_TO_LABEL = Object.assign({}, STAGE_MAP);
  Object.keys(LABEL_TO_KEY).forEach(label => {
    const key = LABEL_TO_KEY[label];
    KEY_TO_LABEL[key] = label;
  });

  let warnedUnknown = false;

  function sanitize(value){
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeStage(value){
    if(Array.isArray(value)) return normalizeStage(value[0]);
    const raw = String(value == null ? '' : value).trim();
    if(!raw){
      return warnAndFallback();
    }
    if(STAGES.includes(raw)){ return raw; }
    const lowered = sanitize(raw);
    if(!lowered){
      return warnAndFallback();
    }
    if(STAGE_MAP[lowered]) return STAGE_MAP[lowered];
    const labelMatch = STAGES.find(stage => stage.toLowerCase() === lowered);
    if(labelMatch) return labelMatch;
    return warnAndFallback(raw);
  }

  function warnAndFallback(raw){
    if(!warnedUnknown){
      warnedUnknown = true;
      const msg = raw ? `normalizeStage: unknown stage "${raw}"` : 'normalizeStage: missing stage';
      if(typeof console !== 'undefined' && console && typeof console.warn === 'function'){
        console.warn(msg);
      }
    }
    return 'Processing';
  }

  function stageKeyFromLabel(label){
    const raw = String(label == null ? '' : label).trim();
    if(!raw) return previousCanonicalize(label);
    if(LABEL_TO_KEY[raw]) return LABEL_TO_KEY[raw];
    const sanitized = sanitize(raw);
    if(!sanitized) return previousCanonicalize(label);
    const mapped = STAGE_MAP[sanitized];
    if(mapped && LABEL_TO_KEY[mapped]) return LABEL_TO_KEY[mapped];
    const labelMatch = STAGES.find(stage => stage.toLowerCase() === sanitized);
    if(labelMatch && LABEL_TO_KEY[labelMatch]) return LABEL_TO_KEY[labelMatch];
    return previousCanonicalize(label);
  }

  function stageLabelFromKey(key){
    const sanitized = sanitize(key);
    if(!sanitized) return 'Processing';
    if(KEY_TO_LABEL[sanitized]) return KEY_TO_LABEL[sanitized];
    if(STAGE_MAP[sanitized]) return STAGE_MAP[sanitized];
    return sanitized
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Processing';
  }

  function mergeStageMaps(source){
    const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const result = {};
    Object.keys(input).forEach(stageKey => {
      const canonicalKey = stageKeyFromLabel(stageKey);
      const value = input[stageKey];
      result[canonicalKey] = value;
    });
    return result;
  }

  const api = {
    STAGES: STAGES.slice(),
    STAGE_MAP: Object.assign({}, STAGE_MAP),
    normalizeStage,
    stageKeyFromLabel,
    stageLabelFromKey,
    mergeStageMaps
  };

  window.PipelineStages = api;
  window.normalizeStage = normalizeStage;

  window.canonicalizeStage = function(value){
    const key = stageKeyFromLabel(value);
    return key || previousCanonicalize(value);
  };

  window.stageLabelFromKey = stageLabelFromKey;
  window.stageKeyFromLabel = stageKeyFromLabel;

})();
