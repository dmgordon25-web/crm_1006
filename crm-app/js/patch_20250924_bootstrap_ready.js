// patch_20250924_bootstrap_ready.js — Ensure first render after DB ready
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.bootstrap_ready_fix) return; window.__INIT_FLAGS__.bootstrap_ready_fix = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_20250924_bootstrap_ready.js')){
    window.__PATCHES_LOADED__.push('/js/patch_20250924_bootstrap_ready.js');
  }

  async function emit(detail){
    const payload = detail || {source:'bootstrap'};
    if(typeof window.dispatchAppDataChanged === 'function'){
      window.dispatchAppDataChanged(payload);
      return;
    }
    document.dispatchEvent(new CustomEvent('app:data:changed', {detail: payload}));
  }

  async function init(){
    try{
      if(typeof openDB === 'function') await openDB();
    }catch(err){ console && console.warn && console.warn('bootstrap openDB failed', err); }
    await emit({source:'bootstrap'});
  }

  if(document.readyState==='complete' || document.readyState==='interactive'){ init(); }
  else document.addEventListener('DOMContentLoaded', init, {once:true});
})();
