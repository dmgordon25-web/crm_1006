/* P6e: quiet diagnostics */
(function(){
  if (window.__WIRED_DIAG_QUIET__) return; window.__WIRED_DIAG_QUIET__ = true;

  function summarize(){
    const loaded = (window.__PATCHES_LOADED__ && window.__PATCHES_LOADED__.length) || window.__MODULES_OK__ || 0;
    const failed = (window.__PATCHES_FAILED__ && window.__PATCHES_FAILED__.length) || window.__MODULES_FAIL__ || 0;
    const msg = `Boot OK — modules:${loaded} failures:${failed}`;
    // Dev-only if project exposes flag; otherwise always concise
    if (window.__DEV__ || typeof window.__DEV__ === "undefined"){
      try { console.info(msg); } catch {}
    }
  }

  // Self-Test hook (project style): expect window.SelfTest?.run to exist; never fail hard here
  if (window.SelfTest && typeof window.SelfTest.run === "function"){
    try { window.SelfTest.run().then(()=>summarize()).catch(()=>summarize()); }
    catch { summarize(); }
  } else {
    summarize();
  }
})();
