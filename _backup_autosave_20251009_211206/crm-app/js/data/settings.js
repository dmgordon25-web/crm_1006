(function(){
  if(window.Settings && typeof window.Settings.get === 'function') return;

  const STORE = 'settings';
  const RECORD_ID = 'app:settings';
  const PROFILE_KEY = 'profile:v1';
  const SIGNATURE_KEY = 'signature:v1';

  let cache = null;
  let inflight = null;

  function clone(data){
    if(data == null) return data;
    const cloned = JSON.parse(JSON.stringify(data));
    if(cloned && cloned.loProfile && !cloned.profile){
      cloned.profile = cloned.loProfile;
    }
    return cloned;
  }

  function idFactory(){
    try{ if(window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); }
    catch(_err){}
    return 'sig-' + Math.random().toString(36).slice(2, 12);
  }

  function normalizeGoals(input){
    const source = input && typeof input === 'object' ? input : {};
    const monthlyFundedGoal = Math.max(0, Number(source.monthlyFundedGoal || source.funded || 0) || 0);
    const monthlyVolumeGoal = Math.max(0, Number(source.monthlyVolumeGoal || source.volume || 0) || 0);
    const updatedAt = source.updatedAt || (monthlyFundedGoal || monthlyVolumeGoal ? new Date().toISOString() : null);
    return { monthlyFundedGoal, monthlyVolumeGoal, updatedAt };
  }

  function normalizeSignature(input){
    if(typeof input === 'string'){
      const body = String(input);
      const rowId = idFactory();
      return {
        items: body ? [{ id: rowId, title: 'Default', body, updatedAt: Date.now() }] : [],
        defaultId: body ? rowId : null,
        text: body
      };
    }
    const itemsRaw = Array.isArray(input && input.items) ? input.items : [];
    const items = itemsRaw.map(row => ({
      id: String(row && row.id ? row.id : idFactory()),
      title: String(row && row.title != null ? row.title : ''),
      body: String(row && row.body != null ? row.body : ''),
      updatedAt: row && row.updatedAt ? row.updatedAt : Date.now()
    })).filter(row => row.title || row.body);
    let defaultId = items.length ? items[0].id : null;
    if(input && input.defaultId && items.some(row => row.id === input.defaultId)){
      defaultId = input.defaultId;
    }
    const text = defaultId ? (items.find(row => row.id === defaultId)?.body || '') : '';
    return { items, defaultId, text };
  }

  function mergeSignatureWithLocal(signature, localRaw){
    const body = typeof localRaw === 'string' ? localRaw : '';
    if(!body) return signature;
    const base = signature && typeof signature === 'object' ? signature : { items: [], defaultId: null, text: '' };
    const items = Array.isArray(base.items) ? base.items.map(row => Object.assign({}, row)) : [];
    if(!items.length){
      return normalizeSignature(body);
    }
    let defaultId = base.defaultId;
    if(!defaultId || !items.some(row => row.id === defaultId)){
      defaultId = items.length ? items[0].id : null;
    }
    if(!defaultId){
      return normalizeSignature(body);
    }
    const index = items.findIndex(row => row.id === defaultId);
    if(index === -1){
      return normalizeSignature(body);
    }
    if(items[index].body !== body){
      items[index] = Object.assign({}, items[index], { body, updatedAt: Date.now() });
    }
    return { items, defaultId, text: body };
  }

  function normalizeProfile(input){
    const source = input && typeof input === 'object' ? input : {};
    return {
      name: String(source.name || ''),
      email: String(source.email || ''),
      phone: String(source.phone || ''),
      signature: String(source.signature || ''),
      photoDataUrl: typeof source.photoDataUrl === 'string' ? source.photoDataUrl : ''
    };
  }

  function normalizeDashboard(input){
    const defaults = {
      mode: 'today',
      widgets: {
        filters: true,
        kpis: true,
        pipeline: false,
        today: true,
        leaderboard: false,
        stale: false,
        insights: false,
        opportunities: false
      }
    };
    const source = input && typeof input === 'object' ? input : {};
    const widgetsSource = source.widgets && typeof source.widgets === 'object' ? source.widgets : {};
    const widgets = Object.assign({}, defaults.widgets);
    Object.keys(widgets).forEach(key => {
      if(typeof widgetsSource[key] === 'boolean') widgets[key] = widgetsSource[key];
    });
    const mode = source.mode === 'all' ? 'all' : 'today';
    return { mode, widgets };
  }

  function normalize(raw){
    const base = raw && typeof raw === 'object' ? raw : {};
    const profileSource = base && base.loProfile !== undefined ? base.loProfile : base.profile;
    const normalized = {
      goals: normalizeGoals(base.goals),
      signature: normalizeSignature(base.signature),
      loProfile: normalizeProfile(profileSource),
      dashboard: normalizeDashboard(base.dashboard),
      updatedAt: base.updatedAt || null
    };
    return normalized;
  }

  function updateSignatureCache(signature){
    const payload = {
      items: signature.items.map(row => ({ id: row.id, title: row.title, body: row.body })),
      defaultId: signature.defaultId || null,
      text: signature.text || ''
    };
    window.__SIGNATURE_CACHE__ = payload;
  }

  function updateProfileCache(profile){
    window.__LO_PROFILE__ = Object.assign({}, profile);
  }

  function readProfileLocal(){
    try{
      const raw = localStorage.getItem(PROFILE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    }catch(_err){ return null; }
  }

  function writeProfileLocal(profile){
    try{
      if(profile){
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      }else{
        localStorage.removeItem(PROFILE_KEY);
      }
    }catch(_err){ /* noop */ }
  }

  function readSignatureLocal(){
    try{
      const raw = localStorage.getItem(SIGNATURE_KEY);
      return typeof raw === 'string' ? raw : '';
    }catch(_err){ return ''; }
  }

  function writeSignatureLocal(value){
    try{
      if(value){
        localStorage.setItem(SIGNATURE_KEY, String(value));
      }else{
        localStorage.removeItem(SIGNATURE_KEY);
      }
    }catch(_err){ /* noop */ }
  }

  async function ensureDb(){
    if(typeof window.openDB === 'function'){
      await window.openDB();
    }
  }

  async function readRecord(){
    await ensureDb();
    if(typeof window.dbGet !== 'function') return null;
    try{ return await window.dbGet(STORE, RECORD_ID); }
    catch(_err){ return null; }
  }

  async function writeRecord(data){
    await ensureDb();
    if(typeof window.dbPut !== 'function') return;
    const payload = Object.assign({ id: RECORD_ID }, data, { updatedAt: Date.now() });
    await window.dbPut(STORE, payload);
  }

  async function load(){
    if(cache) return clone(cache);
    if(inflight) return clone(await inflight);
    inflight = (async ()=>{
      const raw = await readRecord();
      const normalized = normalize(raw);
      const profileLocal = readProfileLocal();
      if(profileLocal){
        normalized.loProfile = normalizeProfile(Object.assign({}, normalized.loProfile, profileLocal));
      }
      const signatureLocal = readSignatureLocal();
      if(signatureLocal){
        normalized.signature = mergeSignatureWithLocal(normalized.signature, signatureLocal);
      }
      cache = normalized;
      updateSignatureCache(normalized.signature);
      updateProfileCache(normalized.loProfile);
      inflight = null;
      return normalized;
    })();
    const result = await inflight;
    return clone(result);
  }

  function mergeSettings(current, partial){
    const next = clone(current);
    const source = partial && typeof partial === 'object' ? partial : {};
    if(source.goals){
      next.goals = normalizeGoals(Object.assign({}, current.goals, source.goals));
    }
    if(source.signature){
      next.signature = normalizeSignature(source.signature);
    }
    if(source.loProfile){
      next.loProfile = normalizeProfile(Object.assign({}, current.loProfile, source.loProfile));
    }
    else if(source.profile){
      next.loProfile = normalizeProfile(Object.assign({}, current.loProfile, source.profile));
    }
    if(source.dashboard){
      const merged = Object.assign({}, current.dashboard, source.dashboard);
      merged.widgets = Object.assign({}, current.dashboard.widgets, source.dashboard.widgets);
      next.dashboard = normalizeDashboard(merged);
    }
    for(const key of Object.keys(source)){
      if(key === 'goals' || key === 'signature' || key === 'loProfile') continue;
      if(key === 'dashboard') continue;
      next[key] = source[key];
    }
    if('profile' in next) delete next.profile;
    return next;
  }

  async function save(partial){
    const current = await load();
    const next = mergeSettings(current, partial);
    cache = next;
    if(partial && typeof partial.loProfile === 'object'){
      writeProfileLocal(normalizeProfile(partial.loProfile));
    }else if(partial && typeof partial.profile === 'object'){
      writeProfileLocal(normalizeProfile(partial.profile));
    }
    if(partial && partial.signature){
      const normalizedSignature = normalizeSignature(partial.signature);
      const text = normalizedSignature.text || '';
      writeSignatureLocal(text);
    }
    await writeRecord(next);
    updateSignatureCache(next.signature);
    updateProfileCache(next.loProfile);
    const detail = { scope: 'settings' };
    if(typeof window.dispatchAppDataChanged === 'function'){
      window.dispatchAppDataChanged(detail);
    }else if(window.document && typeof window.document.dispatchEvent === 'function'){
      window.document.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
    }
    if(window.Toast && typeof window.Toast.show === 'function'){
      window.Toast.show('Saved');
    }
    return clone(next);
  }

  async function refresh(){
    cache = null;
    return load();
  }

  async function clearAllStores(){
    if(typeof window.openDB === 'function'){
      try{ await window.openDB(); }
      catch(_err){}
    }
    if(typeof window.dbClear === 'function' && window.DB_META && Array.isArray(window.DB_META.STORES)){
      for(const store of window.DB_META.STORES){
        try{ await window.dbClear(store); }
        catch(err){ if(console && console.warn) console.warn('[settings] dbClear failed', store, err); }
      }
      return;
    }
    if(typeof window.dbClear === 'function'){
      try{
        await window.dbClear('contacts');
        await window.dbClear('partners');
        await window.dbClear('settings');
        await window.dbClear('tasks');
        await window.dbClear('documents');
      }
      catch(err){ if(console && console.warn) console.warn('[settings] dbClear failed', err); }
    }
  }

  async function handleDeleteAll(){
    let confirmed = true;
    if(typeof window.confirmAction === 'function'){
      confirmed = await window.confirmAction({
        title: 'Delete all data',
        message: 'Delete ALL local data?',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep data',
        destructive: true
      });
    }else if(typeof window.confirm === 'function'){
      confirmed = window.confirm('Delete ALL local data?');
    }
    if(!confirmed) return;
    await clearAllStores();
    try{ localStorage.clear(); sessionStorage.clear(); }
    catch(_err){}
    if(window.toast){
      try{ window.toast('All data deleted'); }
      catch(_err){ console && console.info && console.info('[settings] toast skipped'); }
    }
    document.dispatchEvent(new CustomEvent('app:data:changed', { detail:{ source:'settings:deleteAll' } }));
    const micro = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (fn) => Promise.resolve().then(fn);
    micro(() => {
      if(window.renderAll){
        try{ window.renderAll('deleteAll'); }
        catch(err){ if(console && console.warn) console.warn('[settings] renderAll failed', err); }
      }
    });
  }

  function wireDeleteAll(){
    if(typeof document === 'undefined') return;
    const btn = document.getElementById('btn-delete-all');
    if(!btn || btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener('click', (evt)=>{
      evt.preventDefault();
      handleDeleteAll();
    });
  }

  function hideCardByHeading(text){
    if(typeof document === 'undefined') return;
    const cards = Array.from(document.querySelectorAll('.settings-panel[data-panel="general"] .card'));
    const target = typeof text === 'string' ? text.trim().toLowerCase() : '';
    if(!target) return;
    const card = cards.find(c => c.querySelector('h3')?.textContent?.trim().toLowerCase() === target);
    if(card) card.style.display = 'none';
  }

  function moveDeleteAll(){
    if(typeof document === 'undefined') return;
    const btn = document.getElementById('btn-delete-all');
    const container = document.getElementById('local-utilities-card');
    if(!btn || !container || btn.__moved) return;
    btn.__moved = true;
    const dangerZone = document.createElement('section');
    dangerZone.className = 'utility-block';
    dangerZone.innerHTML = `<h4>Danger Zone</h4><p class="muted fine-print">Delete all local data (irreversible).</p>`;
    dangerZone.appendChild(btn);
    const grid = container.querySelector('.local-utilities-grid');
    if(grid){
      grid.appendChild(dangerZone);
    }else{
      container.appendChild(dangerZone);
    }
  }

  function initSettingsUX(){
    function run(){
      hideCardByHeading('maintenance');
      hideCardByHeading('qa panel');
      const stale = document.getElementById('settings-preferences-stale');
      if(stale) stale.style.display = 'none';
      moveDeleteAll();
      wireDeleteAll();
    }
    if(typeof document === 'undefined') return;
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', run, { once: true });
    }else{
      run();
    }
    window.RenderGuard?.registerHook?.(run);
  }

  if(typeof document !== 'undefined'){
    initSettingsUX();
    wireDeleteAll();
  }

  window.Settings = {
    get: load,
    save,
    refresh,
    deleteAll: handleDeleteAll
  };
})();
