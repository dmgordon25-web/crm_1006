export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_phase6_polish_telemetry';
  window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-27_phase6_polish_telemetry.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-27_phase6_polish_telemetry.js');
  }

  const isDebug = window.__ENV__ && window.__ENV__.DEBUG === true;
  const diagNoop = window.DIAG = window.DIAG || {};
  if(typeof diagNoop.getStoreSizes !== 'function'){
    diagNoop.getStoreSizes = () => ({});
  }
  if(typeof diagNoop.noteRepaint !== 'function'){
    diagNoop.noteRepaint = () => {};
  }
  if(typeof diagNoop.noteError !== 'function'){
    diagNoop.noteError = () => {};
  }
  if(!isDebug) return;

  const RenderGuard = window.RenderGuard || {
    enter(){},
    exit(){},
    isRendering(){ return false; }
  };
  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  function isoNow(){ return new Date().toISOString(); }
  function nowMs(){ return Date.now(); }

  const diagState = {
    enabled: false,
    metricsRunning: true,
    metricsTimer: null,
    trayElement: null,
    trayBody: null,
    trayVisible: false,
    trayCards: {},
    overlayElement: null,
    overlayVisible: false,
    perfFlag: false,
    eventTimestamps: [],
    eventLog: [],
    selection: {
      selectAllUses: 0,
      lastSize: 0,
      deltaLog: [],
      lastSelectAll: null
    },
    renderers: new Map(),
    automation: {
      queued: 0,
      due: 0,
      processed: 0,
      lastSnapshot: 0,
      needsRefresh: false
    },
    automationLog: [],
    listenerHistory: [],
    listenerWarning: false,
    lastListenerTotal: 0,
    storeCounts: null,
    lastStoreFetch: 0,
    storePromise: null,
    errorSize: 0,
    errorLast: null,
    legacyHidden: [],
    legacyLogged: false,
    diagParamShow: false,
    diagSource: 'init'
  };
  ['renderDashboard','renderKanban','renderCalendar'].forEach(name => {
    diagState.renderers.set(name, { samples: [], last: 0 });
  });

  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const PHONE_RE = /(?:\+?1[-.\s]*)?(?:\(\d{3}\)|\d{3})[-.\s]*\d{3}[-.\s]*\d{4}/g;
  const HEX_RE = /\b[0-9a-fA-F]{24,}\b/g;

  function sanitizeString(value){
    let text = '';
    try{
      if(typeof value === 'string') text = value;
      else if(typeof value === 'number' || typeof value === 'boolean') text = String(value);
      else if(value instanceof Error && typeof value.message === 'string') text = value.message;
      else if(value != null) text = JSON.stringify(value);
    }catch(_){ text = String(value); }
    text = text.replace(EMAIL_RE, '***@***');
    text = text.replace(PHONE_RE, '(***) ***-****');
    text = text.replace(HEX_RE, '...id');
    return text;
  }

  function sanitizeDeep(input, depth){
    if(depth > 4) return typeof input === 'object' ? '[depth]' : sanitizeString(input);
    if(input == null) return input;
    if(typeof input === 'string') return sanitizeString(input);
    if(typeof input === 'number' || typeof input === 'boolean') return input;
    if(Array.isArray(input)){
      return input.slice(0, 25).map(item => sanitizeDeep(item, depth + 1));
    }
    if(typeof input === 'object'){
      const out = {};
      Object.keys(input).slice(0, 25).forEach(key => {
        out[key] = sanitizeDeep(input[key], depth + 1);
      });
      return out;
    }
    return sanitizeString(input);
  }

  function sanitizePayload(value){
    return sanitizeDeep(value, 0);
  }

  const errorRing = (function(){
    const entries = [];
    const limit = 50;
    return {
      push(entry){
        entries.push(entry);
        if(entries.length > limit){ entries.splice(0, entries.length - limit); }
        diagState.errorSize = entries.length;
        diagState.errorLast = entry;
        if(diagState.trayElement) updateTray();
      },
      get(){ return entries.slice(); },
      clear(){ entries.length = 0; diagState.errorSize = 0; diagState.errorLast = null; if(diagState.trayElement) updateTray(); },
      size(){ return entries.length; }
    };
  })();

  window.__errorRing__ = {
    get(){ return errorRing.get(); },
    clear(){ errorRing.clear(); },
    size(){ return errorRing.size(); }
  };

  function recordError(level, args, stack){
    const payload = Array.isArray(args) ? args : [];
    const message = sanitizeString(payload.map(part => sanitizeString(part)).join(' '));
    let stackText = '';
    if(stack){ stackText = sanitizeString(stack); }
    else {
      for(const item of payload){
        if(item && typeof item === 'object' && item.stack){
          stackText = sanitizeString(item.stack);
          break;
        }
      }
    }
    const entry = { level, time: isoNow(), message };
    if(stackText) entry.stack = stackText;
    errorRing.push(entry);
  }

  (function wrapConsole(){
    if(typeof console !== 'object' || console.__diagWrappedPhase6) return;
    const originalWarn = typeof console.warn === 'function' ? console.warn.bind(console) : function(){};
    const originalError = typeof console.error === 'function' ? console.error.bind(console) : function(){};
    console.warn = function(){
      originalWarn.apply(console, arguments);
      recordError('warn', Array.from(arguments));
    };
    console.error = function(){
      originalError.apply(console, arguments);
      recordError('error', Array.from(arguments));
    };
    console.__diagWrappedPhase6 = true;
  })();

  let windowErrorOriginal = null;
  let windowRejectionOriginal = null;
  function activateGlobalErrorHooks(){
    if(windowErrorOriginal !== null) return;
    windowErrorOriginal = window.onerror;
    window.onerror = function(message, source, lineno, colno, error){
      recordError('error', [message, source, lineno, colno], error && error.stack);
      if(typeof windowErrorOriginal === 'function') return windowErrorOriginal.apply(this, arguments);
      return false;
    };
    windowRejectionOriginal = window.onunhandledrejection;
    window.onunhandledrejection = function(event){
      const reason = event && event.reason != null ? event.reason : 'unhandledrejection';
      const stack = reason && reason.stack ? reason.stack : null;
      const msg = reason && reason.message ? reason.message : reason;
      recordError('error', [msg], stack);
      if(typeof windowRejectionOriginal === 'function') return windowRejectionOriginal.call(this, event);
      return false;
    };
  }
  function deactivateGlobalErrorHooks(){
    if(windowErrorOriginal === null) return;
    window.onerror = windowErrorOriginal;
    window.onunhandledrejection = windowRejectionOriginal;
    windowErrorOriginal = null;
    windowRejectionOriginal = null;
  }

  const diagListeners = [];
  function addDiagListener(target, type, handler, options){
    if(!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler, options || false);
    diagListeners.push({ target, type, handler, options: options || false });
  }
  function removeDiagListeners(){
    while(diagListeners.length){
      const item = diagListeners.pop();
      try{ item.target.removeEventListener(item.type, item.handler, item.options); }
      catch(_){ }
    }
  }

  function pruneEventsWindow(){
    const cutoff = nowMs() - 120000;
    while(diagState.eventTimestamps.length && diagState.eventTimestamps[0] < cutoff){
      diagState.eventTimestamps.shift();
    }
  }

  function onDataChanged(evt){
    if(!diagState.enabled) return;
    const ts = nowMs();
    diagState.eventTimestamps.push(ts);
    pruneEventsWindow();
    const detail = evt && evt.detail != null ? sanitizePayload(evt.detail) : null;
    diagState.eventLog.push({ time: new Date(ts).toISOString(), detail });
    if(diagState.eventLog.length > 50) diagState.eventLog.shift();
  }

  function onSelectionChanged(evt){
    if(!diagState.enabled) return;
    const detail = evt && evt.detail;
    const ids = Array.isArray(detail && detail.ids) ? detail.ids : [];
    const nextSize = ids.length;
    const delta = nextSize - diagState.selection.lastSize;
    diagState.selection.lastSize = nextSize;
    const entry = { time: isoNow(), delta, size: nextSize };
    diagState.selection.deltaLog.push(entry);
    if(diagState.selection.deltaLog.length > 30) diagState.selection.deltaLog.shift();
  }

  function onSelectAllChange(evt){
    if(!diagState.enabled) return;
    const node = evt && evt.target;
    if(node && node.__masterfixSelectAll){
      diagState.selection.selectAllUses += 1;
      diagState.selection.lastSelectAll = isoNow();
    }
  }

  function logAutomation(eventName, detail){
    const entry = { time: isoNow(), event: eventName, detail: sanitizePayload(detail) };
    diagState.automationLog.push(entry);
    if(diagState.automationLog.length > 50) diagState.automationLog.shift();
  }

  function markAutomationRefresh(){
    diagState.automation.needsRefresh = true;
  }

  function onAutomationEnqueued(evt){
    if(!diagState.enabled) return;
    logAutomation('enqueued', evt && evt.detail);
    markAutomationRefresh();
  }

  function onAutomationCatchup(evt){
    if(!diagState.enabled) return;
    logAutomation('catchup', evt && evt.detail);
    markAutomationRefresh();
  }

  function onAutomationExecuted(evt){
    if(!diagState.enabled) return;
    diagState.automation.processed += 1;
    logAutomation('executed', evt && evt.detail);
    markAutomationRefresh();
  }

  async function refreshAutomationSnapshot(){
    if(!diagState.enabled) return;
    if(typeof window.dbGet !== 'function') return;
    const now = nowMs();
    if(!diagState.automation.needsRefresh && (now - diagState.automation.lastSnapshot) < 4000) return;
    try{
      const record = await window.dbGet('meta', 'automationsQueue');
      const items = Array.isArray(record && record.items) ? record.items : [];
      const queued = items.filter(item => item && item.status === 'queued');
      const due = queued.filter(item => Number(item && item.runAt || 0) <= now);
      diagState.automation.queued = queued.length;
      diagState.automation.due = due.length;
      diagState.automation.lastSnapshot = now;
      diagState.automation.needsRefresh = false;
    }catch(err){
      recordError('warn', ['automation snapshot', err && err.message ? err.message : err]);
      diagState.automation.needsRefresh = false;
    }
  }

  function calcStats(samples){
    if(!samples || !samples.length) return { count: 0, avg: 0, p95: 0, max: 0 };
    const sorted = samples.slice().sort((a,b)=> a-b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val)=> acc + val, 0);
    const avg = sum / count;
    const index = Math.max(0, Math.ceil(0.95 * count) - 1);
    const p95 = sorted[index];
    const max = sorted[count - 1];
    return { count, avg, p95, max };
  }

  function recordRenderSample(name, duration){
    const bucket = diagState.renderers.get(name);
    if(!bucket) return;
    bucket.samples.push(duration);
    if(bucket.samples.length > 100){ bucket.samples.splice(0, bucket.samples.length - 100); }
    bucket.last = duration;
    if(diagState.overlayVisible) updatePerfOverlay();
    if(diagState.trayElement) updateTray();
  }

  function instrumentRenderer(name){
    const fn = window[name];
    if(typeof fn !== 'function') return;
    if(fn.__diagInstrumentedPhase6) return;
    const wrapped = function(){
      const start = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now()
        : nowMs();
      let done = false;
      const finalize = ()=>{
        if(done) return;
        done = true;
        const end = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
          ? performance.now()
          : nowMs();
        recordRenderSample(name, end - start);
      };
      try{
        const result = fn.apply(this, arguments);
        if(result && typeof result.then === 'function'){
          return result.then(value => { finalize(); return value; }, err => { finalize(); throw err; });
        }
        finalize();
        return result;
      }catch(err){
        finalize();
        throw err;
      }
    };
    wrapped.__diagInstrumentedPhase6 = true;
    window[name] = wrapped;
  }

  function ensureRendererInstrumentation(){
    ['renderDashboard','renderKanban','renderCalendar'].forEach(instrumentRenderer);
  }
  ensureRendererInstrumentation();

  function computeEventRate(){
    pruneEventsWindow();
    const count = diagState.eventTimestamps.length;
    return count / 120;
  }

  function formatEventCard(){
    const rate = computeEventRate();
    const last = diagState.eventLog.slice(-3);
    const lines = [
      `Per-second (last 120s): ${rate.toFixed(3)}`,
      `Sample window count: ${diagState.eventTimestamps.length}`
    ];
    if(last.length){
      lines.push('Recent details:');
      last.forEach(item => {
        lines.push(`- ${item.time}`);
        if(item.detail){
          try{ lines.push(`  ${JSON.stringify(item.detail)}`); }
          catch(_){ lines.push('  [detail]'); }
        }
      });
    }
    return lines.join('\n');
  }

  function formatSelectionCard(){
    const lines = [
      `Select-all uses: ${diagState.selection.selectAllUses}`,
      `Current size: ${diagState.selection.lastSize}`
    ];
    if(diagState.selection.lastSelectAll) lines.push(`Last select-all: ${diagState.selection.lastSelectAll}`);
    if(diagState.selection.deltaLog.length){
      const deltas = diagState.selection.deltaLog.slice(-5).map(entry => `${entry.delta >= 0 ? '+' : ''}${entry.delta} (${entry.size})`);
      lines.push('Recent deltas: ' + deltas.join(', '));
    }
    return lines.join('\n');
  }

  function formatRenderCard(){
    const lines = [];
    diagState.renderers.forEach((bucket, name) => {
      const stats = calcStats(bucket.samples);
      lines.push(`${name}: avg ${stats.avg.toFixed(2)} ms • p95 ${stats.p95.toFixed(2)} ms • max ${stats.max.toFixed(2)} ms (n=${stats.count})`);
    });
    return lines.join('\n');
  }

  function formatAutomationCard(){
    const lines = [
      `Queued: ${diagState.automation.queued}`,
      `Due now: ${diagState.automation.due}`,
      `Processed (session): ${diagState.automation.processed}`
    ];
    if(diagState.automationLog.length){
      const recent = diagState.automationLog.slice(-3);
      lines.push('Recent automation events:');
      recent.forEach(item => {
        lines.push(`- ${item.time} ${item.event}`);
      });
    }
    return lines.join('\n');
  }

  function formatStoreCard(){
    if(!diagState.storeCounts) return 'No snapshot captured. Use Refresh to sample.';
    const entries = Object.entries(diagState.storeCounts).sort((a,b)=> a[0].localeCompare(b[0]));
    const lines = entries.map(([name, count]) => `${name}: ${count}`);
    return lines.join('\n');
  }
  function formatListenerCard(){
    const total = diagState.lastListenerTotal;
    const lines = [`Tracked listeners: ${total}`];
    if(diagState.listenerHistory.length){
      const last = diagState.listenerHistory[diagState.listenerHistory.length - 1];
      lines.push(`Last delta: ${last.delta >= 0 ? '+' : ''}${last.delta} (${last.type || 'unknown'})`);
    }
    lines.push(diagState.listenerWarning ? 'Warning: monotonic growth detected' : 'No growth warning');
    return lines.join('\n');
  }

  function formatErrorCard(){
    const lines = [`Buffered errors: ${diagState.errorSize}`];
    if(diagState.errorLast){
      lines.push(`Last: [${diagState.errorLast.level}] ${diagState.errorLast.message}`);
      if(diagState.errorLast.stack) lines.push('Stack captured');
    }
    return lines.join('\n');
  }

  function updateCard(key, formatter){
    const node = diagState.trayCards[key];
    if(!node) return;
    try{ node.textContent = formatter(); }
    catch(err){ node.textContent = `Error updating ${key}: ${err && err.message ? err.message : err}`; }
  }

  function updateTray(){
    if(!diagState.trayElement || !diagState.enabled) return;
    updateCard('events', formatEventCard);
    updateCard('selection', formatSelectionCard);
    updateCard('render', formatRenderCard);
    updateCard('automation', formatAutomationCard);
    updateCard('stores', formatStoreCard);
    updateCard('listeners', formatListenerCard);
    updateCard('errors', formatErrorCard);
  }

  function ensureStyles(){
    if(document.getElementById('diag-phase6-style')) return;
    const style = document.createElement('style');
    style.id = 'diag-phase6-style';
    style.textContent = `
      #diag-tray{position:fixed;bottom:16px;right:16px;width:320px;max-height:70vh;font-family:var(--font-body,Arial,Helvetica,sans-serif);font-size:12px;background:#fff;border:1px solid rgba(0,0,0,0.15);border-radius:8px;box-shadow:0 6px 16px rgba(15,23,42,0.2);z-index:30;display:none;flex-direction:column;overflow:hidden}
      #diag-tray[data-open="1"]{display:flex}
      #diag-tray header{display:flex;align-items:center;padding:8px 12px;background:#0f172a;color:#fff;font-size:12px}
      #diag-tray header .grow{flex:1}
      #diag-tray .diag-body{padding:8px 12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
      #diag-tray .diag-card{border:1px solid rgba(15,23,42,0.12);border-radius:6px;padding:6px 8px;background:#f8fafc;display:flex;flex-direction:column;gap:4px}
      #diag-tray .diag-card h3{margin:0;font-size:11px;display:flex;align-items:center;gap:6px;color:#0f172a}
      #diag-tray .diag-card pre{margin:0;font-family:var(--font-mono,Menlo,monospace);font-size:11px;white-space:pre-wrap}
      #diag-tray button.small{font-size:10px;padding:2px 6px;line-height:1;border-radius:4px;border:1px solid rgba(15,23,42,0.2);background:#fff;cursor:pointer}
      #diag-tray button.small:hover{background:#e2e8f0}
      #diag-tray .toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
      #diag-tray .toolbar button{font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid rgba(15,23,42,0.2);background:#fff;cursor:pointer}
      #diag-tray .toolbar button.primary{background:#0f172a;color:#fff;border-color:#0f172a}
      #diag-tray .toolbar button.danger{background:#fee2e2;color:#991b1b;border-color:#fecaca}
      #perf-overlay{position:fixed;top:12px;right:12px;min-width:240px;max-width:360px;background:rgba(15,23,42,0.9);color:#f8fafc;padding:8px 10px;border-radius:6px;font-family:var(--font-mono,Menlo,monospace);font-size:11px;z-index:25;display:none}
      #perf-overlay header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
      #perf-overlay header button{margin-left:auto;font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid rgba(248,250,252,0.6);background:rgba(15,23,42,0.6);color:#f8fafc;cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  function ensureTray(){
    if(diagState.trayElement) return diagState.trayElement;
    ensureStyles();
    const tray = document.createElement('section');
    tray.id = 'diag-tray';
    tray.innerHTML = `
      <header>
        <strong>Diagnostics</strong>
        <span class="grow"></span>
        <button type="button" class="small" data-role="diag-collapse">Collapse</button>
      </header>
      <div class="toolbar">
        <button type="button" class="primary" data-role="diag-start-stop">Pause</button>
        <button type="button" data-role="diag-copy-all">Copy All</button>
        <button type="button" data-role="diag-export">Export Support Bundle</button>
        <button type="button" data-role="diag-dead-code">Dead-code Report</button>
        <button type="button" data-role="diag-refresh-stores">Refresh Stores</button>
        <button type="button" class="danger" data-role="diag-clear-errors">Clear Errors</button>
      </div>
      <div class="diag-body">
        <article class="diag-card" data-card="events">
          <h3>Event Rate <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="events"></pre>
        </article>
        <article class="diag-card" data-card="selection">
          <h3>Selections <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="selection"></pre>
        </article>
        <article class="diag-card" data-card="render">
          <h3>Render Timings <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="render"></pre>
        </article>
        <article class="diag-card" data-card="automation">
          <h3>Automations <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="automation"></pre>
        </article>
        <article class="diag-card" data-card="stores">
          <h3>Store Counts <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="stores"></pre>
        </article>
        <article class="diag-card" data-card="listeners">
          <h3>Listener Sampler <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="listeners"></pre>
        </article>
        <article class="diag-card" data-card="errors">
          <h3>Error Buffer <button type="button" class="small" data-role="copy-card">Copy</button></h3>
          <pre data-field="errors"></pre>
        </article>
      </div>
    `;
    document.body.appendChild(tray);
    diagState.trayElement = tray;
    diagState.trayBody = tray.querySelector('.diag-body');
    diagState.trayCards = {
      events: tray.querySelector('[data-field="events"]'),
      selection: tray.querySelector('[data-field="selection"]'),
      render: tray.querySelector('[data-field="render"]'),
      automation: tray.querySelector('[data-field="automation"]'),
      stores: tray.querySelector('[data-field="stores"]'),
      listeners: tray.querySelector('[data-field="listeners"]'),
      errors: tray.querySelector('[data-field="errors"]')
    };
    bindTray(tray);
    return tray;
  }

  function copyToClipboard(text){
    if(!text) return;
    if(navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
      navigator.clipboard.writeText(text).catch(()=>{
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text){
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand('copy'); }
    catch(_){ }
    document.body.removeChild(ta);
  }

  function bindTray(tray){
    const startStop = tray.querySelector('[data-role="diag-start-stop"]');
    const collapse = tray.querySelector('[data-role="diag-collapse"]');
    const copyAll = tray.querySelector('[data-role="diag-copy-all"]');
    const exportBtn = tray.querySelector('[data-role="diag-export"]');
    const deadCodeBtn = tray.querySelector('[data-role="diag-dead-code"]');
    const refreshBtn = tray.querySelector('[data-role="diag-refresh-stores"]');
    const clearErrorsBtn = tray.querySelector('[data-role="diag-clear-errors"]');

    if(startStop && !startStop.__wired){
      startStop.__wired = true;
      startStop.addEventListener('click', ()=>{
        diagState.metricsRunning = !diagState.metricsRunning;
        startStop.textContent = diagState.metricsRunning ? 'Pause' : 'Resume';
        if(diagState.metricsRunning) startMetrics();
        else stopMetrics();
      });
    }
    if(collapse && !collapse.__wired){
      collapse.__wired = true;
      collapse.addEventListener('click', ()=>{
        diagState.trayVisible = false;
        tray.removeAttribute('data-open');
      });
    }
    if(copyAll && !copyAll.__wired){
      copyAll.__wired = true;
      copyAll.addEventListener('click', ()=>{
        const fields = Object.values(diagState.trayCards).map(node => node ? node.textContent : '').filter(Boolean);
        copyToClipboard(fields.join('\n\n'));
      });
    }
    if(exportBtn && !exportBtn.__wired){
      exportBtn.__wired = true;
      exportBtn.addEventListener('click', ()=>{
        window.exportSupportBundle && window.exportSupportBundle();
      });
    }
    if(deadCodeBtn && !deadCodeBtn.__wired){
      deadCodeBtn.__wired = true;
      deadCodeBtn.addEventListener('click', ()=>{
        window.generateDeadCodeReport && window.generateDeadCodeReport();
      });
    }
    if(refreshBtn && !refreshBtn.__wired){
      refreshBtn.__wired = true;
      refreshBtn.addEventListener('click', ()=>{
        diagState.storeCounts = null;
        diagState.lastStoreFetch = 0;
        captureStoreCounts();
      });
    }
    if(clearErrorsBtn && !clearErrorsBtn.__wired){
      clearErrorsBtn.__wired = true;
      clearErrorsBtn.addEventListener('click', ()=>{
        window.__errorRing__ && window.__errorRing__.clear();
      });
    }
    tray.querySelectorAll('[data-role="copy-card"]').forEach(btn => {
      if(btn.__wired) return;
      btn.__wired = true;
      btn.addEventListener('click', evt => {
        const card = evt.target.closest('[data-card]');
        if(!card) return;
        const field = card.querySelector('pre');
        if(field) copyToClipboard(field.textContent || '');
      });
    });
  }

  function showTray(){
    const tray = ensureTray();
    diagState.trayVisible = true;
    tray.setAttribute('data-open', '1');
    updateTray();
  }

  function hideTray(){
    if(!diagState.trayElement) return;
    diagState.trayVisible = false;
    diagState.trayElement.removeAttribute('data-open');
  }

  function ensurePerfOverlay(){
    ensureStyles();
    if(diagState.overlayElement) return diagState.overlayElement;
    const overlay = document.createElement('section');
    overlay.id = 'perf-overlay';
    overlay.innerHTML = `
      <header><strong>Render timings</strong><button type="button" data-role="perf-hide">Hide</button></header>
      <div data-role="perf-body"></div>
    `;
    document.body.appendChild(overlay);
    const hideBtn = overlay.querySelector('[data-role="perf-hide"]');
    if(hideBtn && !hideBtn.__wired){
      hideBtn.__wired = true;
      hideBtn.addEventListener('click', ()=>{
        setPerfOverlayVisible(false);
        if(typeof window.PERF_SHOW === 'boolean'){ window.PERF_SHOW = false; }
      });
    }
    diagState.overlayElement = overlay;
    return overlay;
  }

  function renderSummaryLines(){
    const lines = [];
    diagState.renderers.forEach((bucket, name) => {
      const stats = calcStats(bucket.samples);
      lines.push(`${name.padEnd(16)} avg ${stats.avg.toFixed(2)} ms | p95 ${stats.p95.toFixed(2)} ms | max ${stats.max.toFixed(2)} ms (n=${stats.count})`);
    });
    return lines;
  }

  function updatePerfOverlay(){
    if(!diagState.overlayVisible) return;
    const overlay = ensurePerfOverlay();
    const body = overlay.querySelector('[data-role="perf-body"]');
    if(!body) return;
    body.textContent = renderSummaryLines().join('\n');
  }

  function setPerfOverlayVisible(visible){
    diagState.overlayVisible = !!visible;
    const overlay = ensurePerfOverlay();
    overlay.style.display = diagState.overlayVisible ? 'block' : 'none';
    if(!diagState.overlayVisible){
      diagState.renderers.forEach(bucket => {
        if(bucket.samples.length > 100) bucket.samples.splice(0, bucket.samples.length - 100);
      });
    } else {
      updatePerfOverlay();
    }
  }

  function startMetrics(){
    if(diagState.metricsTimer){ clearInterval(diagState.metricsTimer); }
    if(!diagState.metricsRunning || !diagState.enabled) return;
    diagState.metricsTimer = setInterval(()=>{
      updateMetrics();
    }, 1000);
  }

  function stopMetrics(){
    if(diagState.metricsTimer){ clearInterval(diagState.metricsTimer); diagState.metricsTimer = null; }
  }

  async function updateMetrics(){
    if(!diagState.enabled || !diagState.metricsRunning) return;
    updateTray();
    if(diagState.overlayVisible) updatePerfOverlay();
    await refreshAutomationSnapshot();
    await maybeRefreshStores();
  }

  async function maybeRefreshStores(){
    if(!diagState.enabled) return;
    const now = nowMs();
    if(diagState.storeCounts && (now - diagState.lastStoreFetch) < 30000) return;
    await captureStoreCounts();
  }

  async function captureStoreCounts(){
    if(!diagState.enabled) return;
    if(diagState.storePromise) return diagState.storePromise;
    diagState.storePromise = (async ()=>{
      try{
        const counts = await DIAG.getStoreSizes();
        diagState.storeCounts = counts;
        diagState.lastStoreFetch = nowMs();
        updateTray();
      }catch(err){
        recordError('warn', ['store count', err && err.message ? err.message : err]);
      }finally{
        diagState.storePromise = null;
      }
    })();
    return diagState.storePromise;
  }
  function yieldControl(){
    return new Promise(resolve => {
      try{ queueMicro(resolve); }
      catch(_){ Promise.resolve().then(resolve); }
    });
  }

  async function getStoreSizes(){
    if(typeof window.openDB !== 'function' || !Array.isArray(window.STORES)) return {};
    const db = await window.openDB();
    const counts = {};
    for(const store of window.STORES){
      counts[store] = await new Promise(resolve => {
        try{
          const tx = db.transaction([store], 'readonly');
          const req = tx.objectStore(store).count();
          req.onsuccess = ()=> resolve(req.result || 0);
          req.onerror = ()=> resolve(0);
        }catch(_){ resolve(0); }
      });
      await yieldControl();
    }
    return counts;
  }

  function getRenderSummary(){
    const summary = {};
    diagState.renderers.forEach((bucket, name) => {
      summary[name] = calcStats(bucket.samples);
    });
    return summary;
  }

  function fileStamp(){
    const now = new Date();
    const pad = (n)=> String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function downloadBlob(name, blob){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    queueMicro(()=> URL.revokeObjectURL(url));
  }

  async function buildSupportBundle(){
    await captureStoreCounts();
    const appInfo = {
      version: window.APP_VERSION || 'unknown',
      phases: Object.keys(window.__INIT_FLAGS__ || {}),
      now: isoNow(),
      userAgent: (navigator && navigator.userAgent) || 'unknown',
      timezone: (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; }catch(_){ return 'unknown'; } })(),
      screen: { width: window.screen ? window.screen.width : null, height: window.screen ? window.screen.height : null },
      location: { path: window.location ? window.location.pathname : '', query: window.location ? window.location.search : '' }
    };
    const diag = {
      eventRatePerSecond: computeEventRate(),
      renderSummary: getRenderSummary(),
      listenerHistory: diagState.listenerHistory.slice(-20),
      automation: Object.assign({}, diagState.automation),
      errorBufferSize: diagState.errorSize
    };
    const stores = diagState.storeCounts || {};
    const recent = {
      events: diagState.eventLog.slice(-50),
      errors: window.__errorRing__ ? window.__errorRing__.get() : [],
      automations: diagState.automationLog.slice(-50)
    };
    const notes = {
      changelogSuggestion: 'Phase 6 — Diagnostics tray, support bundle, error ring, performance overlay, listener sampler, legacy guard, dead-code advisory.'
    };
    return { app: appInfo, diag, stores, recent, notes };
  }

  async function exportSupportBundle(){
    try{
      const bundle = await buildSupportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      downloadBlob(`support_bundle_${fileStamp()}.json`, blob);
    }catch(err){
      recordError('error', ['support bundle', err && err.message ? err.message : err]);
    }
  }

  function sameOrigin(url){
    try{
      const current = new URL(window.location.href);
      const target = new URL(url, window.location.href);
      return current.origin === target.origin;
    }catch(_){ return false; }
  }

  function relativePath(url){
    try{
      const current = new URL(window.location.href);
      const target = new URL(url, window.location.href);
      if(current.origin !== target.origin) return target.href;
      const path = target.pathname.startsWith('/') ? target.pathname.slice(1) : target.pathname;
      return path || target.href;
    }catch(_){ return url; }
  }

  function findBlockComments(lines){
    const blocks = [];
    let open = false;
    let start = 0;
    for(let i=0;i<lines.length;i++){
      const line = lines[i];
      if(!open){
        const idx = line.indexOf('/*');
        if(idx !== -1){ open = true; start = i; }
      }else{
        if(line.indexOf('*/') !== -1){
          const end = i;
          if((end - start + 1) > 12){ blocks.push({ start: start + 1, end: end + 1, type: 'block' }); }
          open = false;
        }
      }
    }
    return blocks;
  }

  function findLineCommentStreaks(lines){
    const streaks = [];
    let streakStart = null;
    for(let i=0;i<lines.length;i++){
      if(/^\s*\/\//.test(lines[i])){
        if(streakStart == null) streakStart = i;
      }else{
        if(streakStart != null && (i - streakStart) >= 12){
          streaks.push({ start: streakStart + 1, end: i, type: 'line' });
        }
        streakStart = null;
      }
    }
    if(streakStart != null && (lines.length - streakStart) >= 12){
      streaks.push({ start: streakStart + 1, end: lines.length, type: 'line' });
    }
    return streaks;
  }

  function findTodoLines(lines){
    const matches = [];
    const re = /(TODO:|FIXME|HACK|shim invoked)/i;
    lines.forEach((line, idx) => {
      if(re.test(line)) matches.push({ line: idx + 1, text: sanitizeString(line.trim()) });
    });
    return matches;
  }

  function findExportedFunctions(text){
    const names = [];
    const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g;
    let match;
    while((match = re.exec(text))){
      names.push({ name: match[1], index: match.index });
    }
    return names;
  }

  async function generateDeadCodeReport(){
    try{
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const seen = new Set();
      const modules = [];
      for(const script of scripts){
        const src = script.getAttribute('src');
        if(!src) continue;
        if(!sameOrigin(src)) continue;
        const url = new URL(src, window.location.href).toString();
        if(seen.has(url)) continue;
        seen.add(url);
        try{
          const res = await fetch(url);
          if(!res.ok){ continue; }
          const text = await res.text();
          const lines = text.split(/\r?\n/);
          const blockComments = findBlockComments(lines);
          const lineStreaks = findLineCommentStreaks(lines);
          const todos = findTodoLines(lines);
          const exports = findExportedFunctions(text);
          modules.push({ url, path: relativePath(url), text, lines, blockComments, lineStreaks, todos, exports });
        }catch(err){
          recordError('warn', ['dead code fetch', url, err && err.message ? err.message : err]);
        }
        await yieldControl();
      }
      const unused = [];
      modules.forEach(mod => {
        mod.exports.forEach(entry => {
          const name = entry.name;
          const re = new RegExp(`\\b${name}\\b`, 'g');
          let total = 0;
          modules.forEach(other => {
            const matches = other.text.match(re);
            if(matches) total += matches.length;
          });
          if(total <= 1) unused.push({ file: mod.path, name });
        });
      });
      const lines = [`# Dead Code Advisory — ${isoNow()}`];
      if(!modules.length){
        lines.push('No same-origin scripts enumerated.');
      }
      modules.forEach(mod => {
        const items = [];
        if(mod.blockComments.length || mod.lineStreaks.length) items.push('comments');
        if(mod.todos.length) items.push('todos');
        const fileUnused = unused.filter(item => item.file === mod.path);
        if(fileUnused.length) items.push('exports');
        if(!items.length) return;
        lines.push(`\n## ${mod.path}`);
        mod.blockComments.concat(mod.lineStreaks).forEach(block => {
          lines.push(`- Comment block lines ${block.start}-${block.end}`);
        });
        mod.todos.forEach(todo => {
          lines.push(`- Line ${todo.line}: ${todo.text}`);
        });
        fileUnused.forEach(entry => {
          lines.push(`- Exported function not referenced: ${entry.name}`);
        });
      });
      if(lines.length === 1){
        lines.push('No advisory findings detected.');
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      downloadBlob(`dead_code_report_${fileStamp()}.md`, blob);
    }catch(err){
      recordError('error', ['dead code report', err && err.message ? err.message : err]);
    }
  }

  const DIAG = window.DIAG = window.DIAG || {};
  Object.defineProperty(DIAG, 'enabled', { get(){ return diagState.enabled; } });
  DIAG.enable = function(){ try{ localStorage.setItem('DIAG_ENABLED', '1'); }catch(_){ } setDiagEnabled(true, 'api'); };
  DIAG.disable = function(){ try{ localStorage.removeItem('DIAG_ENABLED'); }catch(_){ } setDiagEnabled(false, 'api'); };
  DIAG.getStoreSizes = getStoreSizes;
  DIAG.getRenderSummary = getRenderSummary;
  DIAG.getListenerSamples = function(){ return diagState.listenerHistory.slice(); };

  window.exportSupportBundle = exportSupportBundle;
  window.generateDeadCodeReport = generateDeadCodeReport;

  function showDiagnosticsTray(){
    setDiagEnabled(true, 'manual');
    showTray();
  }
  window.showDiagnosticsTray = showDiagnosticsTray;

  function installListenerTracker(){
    const proto = window.EventTarget && window.EventTarget.prototype;
    if(!proto || proto.addEventListener.__diagTrackerPhase6) return null;
    const originalAdd = proto.addEventListener;
    const originalRemove = proto.removeEventListener;
    let enabled = false;
    let activeMap = new WeakMap();
    let totals = new Map();

    function reset(){
      activeMap = new WeakMap();
      totals = new Map();
      diagState.listenerHistory = [];
      diagState.listenerWarning = false;
      diagState.lastListenerTotal = 0;
    }

    function pushSample(type, delta){
      if(!enabled) return;
      const sample = { time: isoNow(), type: type || 'unknown', delta, total: diagState.lastListenerTotal };
      diagState.listenerHistory.push(sample);
      if(diagState.listenerHistory.length > 25) diagState.listenerHistory.shift();
      if(diagState.listenerHistory.length >= 5){
        const recent = diagState.listenerHistory.slice(-5);
        let monotonic = true;
        for(let i=1;i<recent.length;i++){
          if(recent[i].total <= recent[i-1].total){ monotonic = false; break; }
        }
        diagState.listenerWarning = monotonic;
      }
    }

    function computeTotals(){
      let total = 0;
      totals.forEach(val => { total += val; });
      diagState.lastListenerTotal = total;
    }

    function addRecord(target, type, listener){
      if(!enabled || typeof listener !== 'function') return;
      let typeMap = activeMap.get(target);
      if(!typeMap){
        typeMap = new Map();
        activeMap.set(target, typeMap);
      }
      let set = typeMap.get(type);
      if(!set){
        set = new Set();
        typeMap.set(type, set);
      }
      if(set.has(listener)) return;
      set.add(listener);
      totals.set(type, (totals.get(type) || 0) + 1);
      computeTotals();
      pushSample(type, 1);
    }

    function removeRecord(target, type, listener){
      if(!enabled || typeof listener !== 'function') return;
      const typeMap = activeMap.get(target);
      if(!typeMap) return;
      const set = typeMap.get(type);
      if(!set || !set.has(listener)) return;
      set.delete(listener);
      totals.set(type, Math.max(0, (totals.get(type) || 0) - 1));
      if(set.size === 0) typeMap.delete(type);
      computeTotals();
      pushSample(type, -1);
    }

    proto.addEventListener = function(type, listener, options){
      const result = originalAdd.apply(this, arguments);
      addRecord(this, type, listener);
      return result;
    };
    proto.removeEventListener = function(type, listener, options){
      const result = originalRemove.apply(this, arguments);
      removeRecord(this, type, listener);
      return result;
    };
    proto.addEventListener.__diagTrackerPhase6 = true;
    proto.removeEventListener.__diagTrackerPhase6 = true;

    return {
      enable(){ enabled = true; reset(); },
      disable(){ enabled = false; reset(); }
    };
  }
  diagState.listenerTracker = installListenerTracker();

  function hideLegacyBlocks(){
    const ids = ['dashboard-filters','dashboard-kpis','dashboard-pipeline-overview','dashboard-today','referral-leaderboard','dashboard-stale'];
    const hidden = [];
    ids.forEach(id => {
      const node = document.getElementById(id);
      if(node && node.style.display !== 'none'){
        node.dataset.phase6LegacyDisplay = node.style.display || '';
        node.style.display = 'none';
        hidden.push(`#${id}`);
      }
    });
    if(hidden.length) diagState.legacyHidden = hidden;
  }
  hideLegacyBlocks();

  ['renderLegacyDashboard','renderLegacyKanban','renderLegacyCalendar'].forEach(name => {
    if(typeof window[name] !== 'function'){
      const noop = function(){ return Promise.resolve(); };
      window[name] = noop;
    }
  });

  function attachDiagListeners(){
    addDiagListener(document, 'app:data:changed', onDataChanged);
    addDiagListener(document, 'selection:changed', onSelectionChanged);
    addDiagListener(document, 'change', onSelectAllChange);
    addDiagListener(document, 'automation:enqueued', onAutomationEnqueued);
    addDiagListener(document, 'automation:catchup', onAutomationCatchup);
    addDiagListener(document, 'automation:executed', onAutomationExecuted);
  }

  function setDiagEnabled(flag, source){
    const enable = !!flag;
    if(enable === diagState.enabled){
      if(enable && (source === 'manual' || diagState.trayVisible || diagState.diagParamShow)) showTray();
      return;
    }
    diagState.enabled = enable;
    if(enable){
      diagState.metricsRunning = true;
      diagState.diagSource = source || diagState.diagSource;
      if(diagState.listenerTracker) diagState.listenerTracker.enable();
      activateGlobalErrorHooks();
      attachDiagListeners();
      startMetrics();
      if(diagState.diagParamShow || diagState.trayVisible) showTray();
      else hideTray();
      if(diagState.trayElement){
        const startStop = diagState.trayElement.querySelector('[data-role="diag-start-stop"]');
        if(startStop) startStop.textContent = 'Pause';
      }
      if(diagState.legacyHidden.length && !diagState.legacyLogged){
        console.info(`[diag] Legacy dashboard nodes hidden: ${diagState.legacyHidden.join(', ')}`);
        diagState.legacyLogged = true;
      }
      updateMetrics();
    }else{
      stopMetrics();
      removeDiagListeners();
      deactivateGlobalErrorHooks();
      if(diagState.listenerTracker) diagState.listenerTracker.disable();
      hideTray();
    }
  }

  function initDiagFromFlags(){
    let queryDiag = false;
    let queryPerf = false;
    try{
      const params = new URLSearchParams(window.location.search || '');
      queryDiag = params.get('diag') === '1';
      queryPerf = params.get('perf') === '1';
    }catch(_){ }
    if(queryDiag){ diagState.diagParamShow = true; }
    let stored = false;
    try{ stored = localStorage.getItem('DIAG_ENABLED') === '1'; }
    catch(_){ stored = false; }
    if(queryDiag || stored){
      setDiagEnabled(true, queryDiag ? 'query' : 'storage');
      showTray();
    }
    let existingPerf = false;
    if(typeof window.PERF_SHOW === 'boolean') existingPerf = window.PERF_SHOW;
    let perfFlag = queryPerf || existingPerf;
    try{ delete window.PERF_SHOW; }
    catch(_){ }
    Object.defineProperty(window, 'PERF_SHOW', {
      configurable: true,
      get(){ return diagState.overlayVisible; },
      set(value){ setPerfOverlayVisible(Boolean(value)); }
    });
    if(perfFlag) setPerfOverlayVisible(true);
  }

  function onShortcut(evt){
    if(!evt || !evt.ctrlKey || !evt.altKey) return;
    if(evt.key && evt.key.toLowerCase() === 'd'){
      try{ localStorage.setItem('DIAG_ENABLED', '1'); }
      catch(_){ }
      setDiagEnabled(true, 'shortcut');
      showTray();
    }
  }
  document.addEventListener('keydown', onShortcut);

  initDiagFromFlags();

})();
