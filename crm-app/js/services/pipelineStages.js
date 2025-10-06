import { PIPELINE_STAGES, NORMALIZE_STAGE, stageKeyFromLabel as canonicalStageKey, stageLabelFromKey as canonicalStageLabel, PIPELINE_STAGE_KEYS } from '/js/pipeline/stages.js';

(function(){
  if(window.__INIT_FLAGS__ && window.__INIT_FLAGS__.pipelineStages) return;
  window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {};
  window.__INIT_FLAGS__.pipelineStages = true;

  const previousCanonicalize = typeof window.canonicalizeStage === 'function'
    ? window.canonicalizeStage
    : (value)=> String(value == null ? '' : value).toLowerCase().trim();

  const STAGES = PIPELINE_STAGES.slice();
  const STAGE_MAP = {};
  PIPELINE_STAGE_KEYS.forEach((key, index) => {
    const label = PIPELINE_STAGES[index];
    STAGE_MAP[key] = label;
    STAGE_MAP[label.toLowerCase()] = label;
  });

  function mergeStageMaps(source){
    const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const result = {};
    Object.keys(input).forEach(stageKey => {
      const canonicalKey = canonicalStageKey(stageKey);
      const value = input[stageKey];
      result[canonicalKey] = value;
    });
    return result;
  }

  const api = {
    STAGES,
    STAGE_MAP: Object.assign({}, STAGE_MAP),
    normalizeStage: NORMALIZE_STAGE,
    stageKeyFromLabel(value){
      const key = canonicalStageKey(value);
      return key || previousCanonicalize(value);
    },
    stageLabelFromKey: canonicalStageLabel,
    mergeStageMaps
  };

  window.PipelineStages = api;
  window.normalizeStage = NORMALIZE_STAGE;
  window.canonicalizeStage = function(value){
    const key = canonicalStageKey(value);
    return key || previousCanonicalize(value);
  };
  window.stageLabelFromKey = canonicalStageLabel;
  window.stageKeyFromLabel = canonicalStageKey;

})();
