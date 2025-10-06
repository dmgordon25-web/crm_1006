(function(global){
  if(!global) return;
  const store = global.localStorage || null;
  let debug = false;
  try{
    const raw = store ? store.getItem('DEBUG') : null;
    if(raw && typeof raw === 'string'){
      const normalized = raw.trim().toLowerCase();
      if(normalized && normalized !== '0' && normalized !== 'false' && normalized !== 'off'){
        debug = true;
      }
    }
  }catch(_err){ debug = false; }
  const existing = global.__ENV__ && typeof global.__ENV__ === 'object'
    ? global.__ENV__
    : {};
  if(!Object.prototype.hasOwnProperty.call(existing, 'DEBUG')){
    existing.DEBUG = debug;
  }
  let params = null;
  try{
    if(global.location && typeof global.location.search === 'string'){
      params = new URLSearchParams(global.location.search);
    }
  }catch(_err){ params = null; }

  const hasDevProp = Object.prototype.hasOwnProperty.call(existing, 'DEV');
  if(!hasDevProp || existing.DEV === undefined || existing.DEV === null){
    const isDev = params
      ? (params.has('dev') || params.has('diagnose'))
      : false;
    existing.DEV = isDev;
  }

  function isTruthyFlag(value){
    if(value == null) return false;
    const normalized = String(value).trim().toLowerCase();
    if(!normalized) return false;
    return ['1','true','yes','on','enable','enabled'].includes(normalized);
  }

  const hasWorkbenchProp = Object.prototype.hasOwnProperty.call(existing, 'WORKBENCH');
  if(!hasWorkbenchProp || existing.WORKBENCH === undefined || existing.WORKBENCH === null){
    let workbenchStorage = null;
    try{
      workbenchStorage = store ? store.getItem('WORKBENCH') : null;
    }catch(_err){ workbenchStorage = null; }
    const workbenchFromStorage = isTruthyFlag(workbenchStorage);
    const workbenchQuery = params && params.has('workbench')
      ? isTruthyFlag(params.get('workbench'))
      : false;
    existing.WORKBENCH = workbenchQuery || workbenchFromStorage;
  }
  global.__ENV__ = existing;
  if(typeof module !== 'undefined' && module.exports){
    module.exports = existing;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
