import '../env.js';
import manifest from './manifest.js';

/** Enforce module type only for this app's same-origin scripts under /js or /patches. */
(() => {
  if (window.__MODULE_ENFORCER__) return;           // idempotent
  window.__MODULE_ENFORCER__ = true;

  const isSameOriginAppScript = (node) => {
    if (!node || node.tagName !== 'SCRIPT') return false;
    const raw = node.getAttribute('src') || '';
    if (!raw) return false;

    let url;
    try { url = new URL(raw, document.baseURI); } catch { return false; }

    // http(s) only, same origin only
    if (url.origin !== location.origin) return false;
    if (!/^https?:$/i.test(url.protocol)) return false;

    // only our code paths
    const p = url.pathname || '';
    if (!/(^|\/)(js|patches)\//i.test(p)) return false;

    // respect explicit signals
    if (node.hasAttribute('nomodule')) return false;

    return true;
  };

  const wrap = (proto, method) => {
    const orig = proto[method];
    proto[method] = function(node, ...args) {
      if (isSameOriginAppScript(node)) node.type = 'module';
      return orig.call(this, node, ...args);
    };
  };

  wrap(Node.prototype, 'appendChild');
  wrap(Node.prototype, 'insertBefore');
})();

if (window.__PATCH_LOADER_INIT__) {
  console.warn('[loader] Duplicate initialization blocked.');
} else {
  window.__PATCH_LOADER_INIT__ = true;
  (function(){
    const initFlags = window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {};
    const patchesLoaded = window.__PATCHES_LOADED__ = Array.isArray(window.__PATCHES_LOADED__)
      ? window.__PATCHES_LOADED__
      : [];
    const patchesFailed = window.__PATCHES_FAILED__ = Array.isArray(window.__PATCHES_FAILED__)
      ? window.__PATCHES_FAILED__
      : [];
    patchesFailed.length = 0;

    const telemetry = window.__PATCH_TELEMETRY__ = window.__PATCH_TELEMETRY__ || {};
    const loadLog = telemetry.loadLog = [];
    const failureLog = telemetry.failures = [];
    window.__PATCH_LOAD_LOG__ = loadLog;
    window.__PATCH_FAILURE_LOG__ = failureLog;

    const versionTag = (typeof window.__APP_VERSION__ === 'string' && window.__APP_VERSION__.trim())
      ? window.__APP_VERSION__.trim()
      : '';

    const patchEntries = Array.isArray(manifest)
      ? manifest.filter(item => typeof item === 'string' && item.includes('/patch')).map(item => item.trim())
      : [];

    if(!Object.prototype.hasOwnProperty.call(window, '__EXPECTED_PATCHES__')){
      Object.defineProperty(window, '__EXPECTED_PATCHES__', {
        value: patchEntries.slice(),
        enumerable: false,
        writable: false,
        configurable: true
      });
    }

    function logLoad(path, mode){
      const entry = {
        index: loadLog.length + 1,
        path,
        mode: (mode || 'classic').toLowerCase()
      };
      loadLog.push(entry);
      return entry;
    }

    function noteLoaded(path){
      if(!patchesLoaded.includes(path)){
        patchesLoaded.push(path);
      }
    }

    function noteFailed(path, error){
      const reason = error && error.message ? error.message : String(error);
      const entry = { path, reason };
      const exists = patchesFailed.some(item => item && item.path === path);
      if(!exists){
        patchesFailed.push(entry);
      }
      if(!failureLog.some(item => item && item.path === entry.path)){
        failureLog.push(entry);
      }
      return entry;
    }

    function isJavaScriptPath(path){
      return /\.js($|\?)/i.test(path);
    }

    function isPatchPath(path){
      return /\/patch(?:es)?\//i.test(path) || /\/patch_/i.test(path);
    }

    function buildUrl(path){
      const trimmed = path.trim();
      if(!isJavaScriptPath(trimmed)){
        throw new Error(`loader: refused to load non-JS asset → ${trimmed}`);
      }
      const url = new URL(trimmed, document.baseURI);
      if(!/\.js$/i.test(url.pathname)){
        throw new Error(`loader: refused to load non-JS asset → ${trimmed}`);
      }
      if(versionTag){
        url.searchParams.set('v', versionTag);
      }
      return url.toString();
    }

    function loadScript(path, { type = 'text/javascript' } = {}) {
      return new Promise((resolve, reject) => {
        const flags = (window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {});
        const key = `${type}:${path}`;
        if (flags[key]) return resolve('skip');
        flags[key] = true;

        const s = document.createElement('script');
        s.async = false;
        s.src = path.startsWith('http') ? path : buildUrl ? buildUrl(path) : path;
        if (type === 'module') s.type = 'module';
        s.onload = () => { if (typeof noteLoaded === 'function') noteLoaded(path); resolve(type); };
        s.onerror = () => reject(new Error(`loader: ${type} load failed for ${path}`));
        (document.head || document.documentElement).appendChild(s);
      });
    }

    async function loadModule(path){
      const key = `module:${path}`;
      if(initFlags[key]) return 'skip';
      initFlags[key] = true;
      try{
        await import(buildUrl(path));
        noteLoaded(path);
        return 'module';
      }catch(err){
        const message = err && err.message ? err.message : String(err);
        const shouldFallback = err instanceof SyntaxError
          || err instanceof TypeError
          || /module/i.test(message)
          || /unexpected token/i.test(message)
          || /mime/i.test(message);

        if(shouldFallback){
          const isOurCode = /^(\.\/)?(js|patches)\//i.test(path) || /\/(js|patches)\//i.test(path);
          if(isOurCode){
            delete initFlags[key];
          }
          try{
            const res = await loadScript(path, { type: isOurCode ? 'module' : 'text/javascript' });
            console.info('[loader] fallback-inject', { path, as: isOurCode ? 'module' : 'classic' });
            return res;
          }catch(fallbackErr){
            const err2 = new Error(`loader: failed importing ${path} and fallback failed`);
            err2.original = err;
            err2.fallback = fallbackErr;
            throw err2;
          }
        }

        if(err && typeof err === 'object'){
          err.message = `loader: failed to import ${path}: ${message}`;
          throw err;
        }
        throw new Error(`loader: failed to import ${path}: ${message}`);
      }
    }

    const isDebug = !!(window.DEBUG || localStorage.getItem('DEBUG') === '1');

    function renderPatchPanel(logEntries, failures){
      if(!isDebug) return;
      const host = document.getElementById('diagnostics');
      if(!host) return;
      host.hidden = false;
      let panel = host.querySelector('[data-diag-panel="patches"]');
      if(!panel){
        panel = document.createElement('details');
        panel.dataset.diagPanel = 'patches';
        panel.style.margin = '0';
        panel.style.padding = '8px 10px';
        panel.style.border = '1px solid rgba(148, 163, 184, 0.45)';
        panel.style.borderRadius = '10px';
        panel.style.background = '#ffffff';
        panel.style.minWidth = '220px';
        panel.style.font = '13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial';
        panel.open = false;
        const summary = document.createElement('summary');
        summary.style.fontWeight = '700';
        summary.style.cursor = 'pointer';
        summary.style.outline = 'none';
        panel.appendChild(summary);
        const list = document.createElement('ol');
        list.style.margin = '8px 0 0';
        list.style.padding = '0 0 0 18px';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '4px';
        panel.appendChild(list);
        host.insertAdjacentElement('afterbegin', panel);
      }
      const summary = panel.querySelector('summary');
      const list = panel.querySelector('ol');
      const failureCount = failures.length;
      if(summary){
        summary.textContent = failureCount
          ? `Patches Loaded (${logEntries.length}) — ${failureCount} ⚠`
          : `Patches Loaded (${logEntries.length})`;
        summary.style.color = failureCount ? '#b45309' : '#0f172a';
      }
      if(list){
        list.innerHTML = '';
        logEntries.forEach(entry => {
          const li = document.createElement('li');
          li.textContent = `${String(entry.index).padStart(2,'0')} · ${entry.mode.toUpperCase()} · ${entry.path}`;
          li.style.listStyle = 'none';
          li.style.padding = '4px 6px';
          li.style.borderRadius = '6px';
          li.style.background = 'rgba(226, 232, 240, 0.45)';
          li.style.color = '#1f2937';
          list.appendChild(li);
        });
      }
    }

    function renderFileProtocolOverlay(){
      if(document.getElementById('file-protocol-blocker')){
        return;
      }

      const overlay = document.createElement('div');
      overlay.id = 'file-protocol-blocker';
      overlay.setAttribute('role', 'alert');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '2147483647';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.background = 'rgba(15, 23, 42, 0.78)';
      overlay.style.backdropFilter = 'blur(1.5px)';
      overlay.style.padding = '20px';
      overlay.style.boxSizing = 'border-box';

      const panel = document.createElement('div');
      panel.style.background = '#ffffff';
      panel.style.borderRadius = '14px';
      panel.style.boxShadow = '0 18px 36px rgba(15, 23, 42, 0.18)';
      panel.style.maxWidth = '460px';
      panel.style.width = '100%';
      panel.style.padding = '28px 32px';
      panel.style.font = '16px/1.5 "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
      panel.style.color = '#0f172a';

      const title = document.createElement('h1');
      title.textContent = 'Open via Start CRM';
      title.style.margin = '0 0 12px';
      title.style.fontSize = '26px';
      title.style.lineHeight = '1.2';
      title.style.fontWeight = '700';

      const body = document.createElement('p');
      body.textContent = 'Double-click “Start CRM.bat” to launch the local server.';
      body.style.margin = '0 0 12px';

      const hint = document.createElement('p');
      hint.style.margin = '0 0 16px';
      hint.innerHTML = 'Then open <code>http://localhost:8080/</code> in your browser.';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.alignItems = 'center';
      actions.style.gap = '12px';

      const readmeLink = document.createElement('a');
      readmeLink.href = 'README.md';
      readmeLink.textContent = 'View README';
      readmeLink.target = '_blank';
      readmeLink.rel = 'noopener noreferrer';
      readmeLink.style.display = 'inline-flex';
      readmeLink.style.alignItems = 'center';
      readmeLink.style.justifyContent = 'center';
      readmeLink.style.padding = '8px 14px';
      readmeLink.style.borderRadius = '999px';
      readmeLink.style.fontSize = '14px';
      readmeLink.style.fontWeight = '600';
      readmeLink.style.color = '#ffffff';
      readmeLink.style.background = '#2563eb';
      readmeLink.style.textDecoration = 'none';
      readmeLink.style.boxShadow = '0 4px 10px rgba(37, 99, 235, 0.35)';

      actions.appendChild(readmeLink);
      panel.appendChild(title);
      panel.appendChild(body);
      panel.appendChild(hint);
      panel.appendChild(actions);
      overlay.appendChild(panel);

      const attach = () => {
        const parent = document.body || document.documentElement;
        if(parent && !overlay.isConnected){
          parent.appendChild(overlay);
        }
      };

      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', attach, { once: true });
      }else{
        attach();
      }
    }

    async function boot(){
      const entries = Array.isArray(manifest) ? manifest.slice() : [];
      if(!entries.length){
        throw new Error('loader: manifest is empty.');
      }

      const shouldLoadWorkbench = Boolean(window.__ENV__ && window.__ENV__.WORKBENCH);
      const workbenchPath = 'js/_legacy/patch_2025-09-27_workbench.js';
      let workbenchLoadAttempted = false;

      let classicCount = 0;
      let moduleCount = 0;
      const loaded = [];
      const failures = [];

      async function ensureWorkbenchLoaded(trigger){
        if(!shouldLoadWorkbench || workbenchLoadAttempted){
          return null;
        }
        workbenchLoadAttempted = true;
        try{
          const mode = await loadModule(workbenchPath);
          if(mode === 'module'){
            moduleCount += 1;
          }else if(mode === 'classic'){
            classicCount += 1;
          }
          logLoad(workbenchPath, mode || 'module');
          loaded.push(workbenchPath);
          if(Array.isArray(patchesLoaded) && !patchesLoaded.includes('workbench')){
            patchesLoaded.push('workbench');
          }
          return mode;
        }catch(err){
          const message = err && err.message ? err.message : String(err);
          if(console && typeof console.info === 'function'){
            console.info('[loader] Optional workbench patch unavailable.', { reason: message, trigger: trigger || 'optional' });
          }
          return null;
        }
      }

      for(const entry of entries){
        if(typeof entry !== 'string'){
          failures.push(noteFailed('invalid-entry', new Error('loader: manifest entry must be a string path.')));
          continue;
        }
        const path = entry.trim();
        if(!path){
          failures.push(noteFailed('invalid-entry', new Error('loader: manifest entry is empty.')));
          continue;
        }
        const isSelfTest = /\bselftest\.js$/i.test(path);
        if(shouldLoadWorkbench && !workbenchLoadAttempted && path === 'js/selftest.js'){
          await ensureWorkbenchLoaded('pre-selftest');
        }
        try{
          if(isSelfTest){
            const result = await loadModule(path);
            if(result === 'module') moduleCount += 1;
            else if(result === 'classic') classicCount += 1;
            logLoad(path, result || 'module');
          }else if(isPatchPath(path)){
            const result = await loadModule(path);
            if(result === 'module'){
              moduleCount += 1;
            }else if(result === 'classic'){
              classicCount += 1;
            }
            logLoad(path, result || 'module');
          }else{
            const result = await loadScript(path);
            if(result !== 'skip'){
              noteLoaded(path);
            }
            const mode = result === 'module'
              ? 'module'
              : result === 'text/javascript'
                ? 'classic'
                : result || 'classic';
            if(mode === 'classic') classicCount += 1;
            logLoad(path, mode);
          }
          loaded.push(path);
        }catch(err){
          const failure = noteFailed(path, err);
          failures.push(failure);
        }
      }

      await ensureWorkbenchLoaded('post-manifest');

      const total = classicCount + moduleCount;
      if(console && typeof console.log === 'function'){
        const payload = {
          classic: classicCount,
          modules: moduleCount,
          total,
          patchesLoaded: Array.isArray(patchesLoaded) ? patchesLoaded.slice() : []
        };
        console.log('BOOT OK', payload);
      }
      if(loadLog.length){
        if(console && typeof console.groupCollapsed === 'function'){
          console.groupCollapsed('Patches Loaded');
          loadLog.forEach(entry => {
            const idx = String(entry.index).padStart(2, '0');
            console.log(`${idx} — ${entry.mode.toUpperCase()} — ${entry.path}`);
          });
          console.groupEnd();
        }else if(console && typeof console.log === 'function'){
          console.log('Patches Loaded', loadLog.map(entry => `${entry.index}:${entry.mode}:${entry.path}`));
        }
      }
      if(failures.length){
        try{ console.error('BOOT ERRORS'); }
        catch(_){ /* noop */ }
        if(console && typeof console.table === 'function'){
          console.table(failures);
        }else if(console && typeof console.error === 'function'){
          failures.forEach(item => console.error(item.path, item.reason));
        }
      }
      if(!patchesLoaded.length && console && typeof console.error === 'function'){
        console.error('BOOT INCOMPLETE — __PATCHES_LOADED__ is empty after boot.');
      }
      return { loaded, classicCount, moduleCount, failures };
    }

    let bootPromise = Promise.resolve({ skipped: true });
    if(window.location && window.location.protocol === 'file:'){
      console.error('BOOT BLOCKED — Serve the CRM via http://localhost:8080/');
      renderFileProtocolOverlay();
    }else{
      bootPromise = boot().catch(err => {
        noteFailed('boot', err);
        return Promise.reject(err);
      });
    }

    window.__BOOT_DONE__ = bootPromise;
    const finalizeBootState = () => Promise.resolve({
      loaded: window.__PATCHES_LOADED__ || [],
      failed: window.__PATCHES_FAILED__ || []
    });

    bootPromise = bootPromise.finally(() => {
      renderPatchPanel(loadLog, failureLog);
      window.__BOOT_DONE__ = finalizeBootState();
      return window.__BOOT_DONE__;
    });

    (function bootWatchdog(){
      if (window.__BOOT_WATCHDOG__) return; window.__BOOT_WATCHDOG__ = true;
      function hasPaint(){
        return !!(document.querySelector('#main-nav, [data-view-active], #view-dashboard'));
      }
      function diagnose(){
        try {
          if (!hasPaint()) {
            console.warn('[boot] No first paint; showing diagnostics panel');
            try { window.showPatchPanel?.(); } catch {}
            if (typeof window.renderAll === 'function') {
              try { window.renderAll(); } catch(e){ console.warn('[boot] renderAll retry failed', e); }
            }
          }
        } catch {}
      }
      const arm = () => setTimeout(diagnose, 1500);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once:true }); else arm();
    })();
  })();
}
