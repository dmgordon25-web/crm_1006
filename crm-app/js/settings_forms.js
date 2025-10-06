import { STR, text } from './ui/strings.js';
const __STR_FALLBACK__ = (window.STR && typeof window.STR === 'object') ? window.STR : {};
function __textFallback__(k){ try { return (STR && STR[k]) || (__STR_FALLBACK__[k]) || k; } catch(_){ return k; } }

(function(){
  if(window.__INIT_FLAGS__ && window.__INIT_FLAGS__.settings_forms) return;
  window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {};
  window.__INIT_FLAGS__.settings_forms = true;

  function toastSafe(message){
    try{
      if(typeof window.toast === 'function') window.toast(message);
      else console.log(message);
    }catch(_err){ console.log(message); }
  }

  function ensureSettings(){
    if(window.Settings && typeof window.Settings.get === 'function') return true;
    console.warn('Settings API unavailable');
    return false;
  }

  (function injectSettingsTidy(){
    if(typeof document === 'undefined') return;
    function apply(){
      if(!document.getElementById('settings-inline-style')){
        const styleEl = document.createElement('style');
        styleEl.id = 'settings-inline-style';
        styleEl.textContent = '#dashboard-widget-list{ display:grid; grid-template-columns: repeat(auto-fill,minmax(220px,1fr)); gap:10px; }\n#dashboard-widget-list label.switch{ display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border-subtle,#DDD); border-radius:10px; background:#fff; }';
        const head = document.head || document.querySelector('head');
        if(head){
          head.appendChild(styleEl);
        }
      }
      const focusCard = document.querySelector('.settings-panel[data-panel="dashboard"] .card:nth-of-type(2)');
      if(focusCard) focusCard.style.display = 'none';
    }
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }else{
      apply();
    }
    window.RenderGuard?.registerHook?.(apply);
  })();

  const profileState = { name:'', email:'', phone:'', signature:'', photoDataUrl:'' };
  const signatureState = { rows: [], defaultId: null };
  const PROFILE_KEY = 'profile:v1';
  const SIGNATURE_KEY = 'signature:v1';
  const dashboardDefaults = {
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
  const dashboardState = {
    mode: 'today',
    widgets: Object.assign({}, dashboardDefaults.widgets)
  };
  let hydrating = false;

  function generateRowId(){
    try{ if(window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); }
    catch(_err){}
    return 'sig-' + Math.random().toString(36).slice(2, 12);
  }

  function applyTokens(text){
    const source = String(text || '');
    return source
      .replace(/\{loName\}/g, profileState.name)
      .replace(/\{loEmail\}/g, profileState.email)
      .replace(/\{loPhone\}/g, profileState.phone);
  }

  function ensureSignaturePreview(card){
    let preview = card.querySelector('[data-role="signature-preview"]');
    if(!preview){
      preview = document.createElement('pre');
      preview.setAttribute('data-role', 'signature-preview');
      preview.className = 'muted';
      preview.style.marginTop = '8px';
      preview.style.padding = '12px';
      preview.style.background = 'rgba(17,18,26,0.08)';
      preview.style.borderRadius = '8px';
      preview.style.whiteSpace = 'pre-wrap';
      preview.style.fontFamily = 'inherit';
      card.appendChild(preview);
    }
    return preview;
  }

  function renderComposePreview(text){
    const preview = document.getElementById('compose-preview');
    if(!preview) return;
    let value = text || '';
    if(!value){
      value = applyTokens(profileState.signature || '');
    }
    preview.value = value || '';
  }

  function renderSignaturePreview(card){
    const preview = ensureSignaturePreview(card);
    if(!signatureState.rows.length){
      preview.textContent = (text?.('settings.signatures.empty') ?? __textFallback__('settings.signatures.empty'));
      preview.classList.add('muted');
      renderComposePreview('');
      return;
    }
    const target = signatureState.rows.find(row => row.id === signatureState.defaultId) || signatureState.rows[0];
    const processedBody = applyTokens(target.body || '');
    preview.textContent = processedBody || (text?.('settings.signatures.preview-empty') ?? __textFallback__('settings.signatures.preview-empty'));
    if(processedBody){
      preview.classList.remove('muted');
    }else{
      preview.classList.add('muted');
    }
    renderComposePreview(processedBody);
  }

  function syncDashboardState(preferences){
    const source = preferences && typeof preferences === 'object' ? preferences : {};
    dashboardState.mode = source.mode === 'all' ? 'all' : 'today';
    const widgets = Object.assign({}, dashboardDefaults.widgets);
    if(source.widgets && typeof source.widgets === 'object'){
      Object.keys(widgets).forEach(key => {
        if(typeof source.widgets[key] === 'boolean') widgets[key] = source.widgets[key];
      });
    }
    dashboardState.widgets = widgets;
  }

  function renderDashboardSettings(){
    const list = document.getElementById('dashboard-widget-list');
    if(!list) return;
    const entries = [
      {key:'filters', label:'Filters'},
      {key:'kpis', label:'KPIs'},
      {key:'pipeline', label:'Pipeline Overview'},
      {key:'today', label:"Today's Work"},
      {key:'leaderboard', label:'Referral Leaderboard'},
      {key:'stale', label:'Stale Deals'},
      {key:'insights', label:'Numbers & Milestones'},
      {key:'opportunities', label:'Relationship Opportunities'}
    ];
    list.innerHTML = entries.map(entry => {
      const checked = dashboardState.widgets[entry.key] ? ' checked' : '';
      return `<label class="switch"><input type="checkbox" data-dashboard-widget="${entry.key}"${checked}><span>${entry.label}</span></label>`;
    }).join('');
    if(!list.__wired){
      list.__wired = true;
      list.addEventListener('change', evt => {
        if(hydrating) return;
        const target = evt.target instanceof HTMLInputElement ? evt.target : evt.target?.closest('input[data-dashboard-widget]');
        if(!target || !(target instanceof HTMLInputElement)) return;
        const key = target.getAttribute('data-dashboard-widget');
        if(!key) return;
        dashboardState.widgets[key] = target.checked;
        if(!ensureSettings()) return;
        window.Settings.save({ dashboard: { widgets: Object.assign({}, dashboardState.widgets) } }).catch(err => console && console.warn && console.warn('dashboard settings save failed', err));
      });
    }
  }

  function hydrateDashboardSettings(preferences){
    syncDashboardState(preferences);
    renderDashboardSettings();
  }

  function renderSignatureRows(card){
    const tbody = card.querySelector('#sig-table tbody');
    if(!tbody) return;
    if(!signatureState.rows.length){
      tbody.innerHTML = `<tr><td class="muted" colspan="4">${text?.('settings.signatures.table-empty') ?? __textFallback__('settings.signatures.table-empty')}</td></tr>`;
      renderSignaturePreview(card);
      return;
    }
    const rowsHtml = signatureState.rows.map(row => {
      const isDefault = signatureState.defaultId === row.id;
      const disabled = row.isNew ? ' disabled' : '';
      const checked = isDefault ? ' checked' : '';
      const rowId = row.id ? String(row.id).replace(/["&<>]/g, ch => ({'"':'&quot;','&':'&amp;','<':'&lt;','>':'&gt;'}[ch] || ch)) : '';
      const title = row.title ? row.title.replace(/["&<>]/g, ch => ({'"':'&quot;','&':'&amp;','<':'&lt;','>':'&gt;'}[ch] || ch)) : '';
      const body = row.body ? row.body.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch] || ch)) : '';
      return `
        <tr data-id="${rowId}">
          <td><input type="radio" name="sig-default" value="${rowId}"${checked}${disabled}></td>
          <td><input type="text" placeholder="${text?.('settings.signatures.placeholder-name') ?? __textFallback__('settings.signatures.placeholder-name')}" value="${title}"></td>
          <td><textarea rows="3" placeholder="${text?.('settings.signatures.placeholder-body') ?? __textFallback__('settings.signatures.placeholder-body')}">${body}</textarea></td>
          <td class="sig-actions">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button class="btn" type="button" data-action="save">${text?.('general.save') ?? __textFallback__('general.save')}</button>
              <button class="btn danger" type="button" data-action="delete">${text?.('general.delete') ?? __textFallback__('general.delete')}</button>
            </div>
          </td>
        </tr>`;
    }).join('');
    tbody.innerHTML = rowsHtml;
    renderSignaturePreview(card);
  }

  function renderProfileBadge(){
    const chip = document.getElementById('lo-profile-chip');
    if(!chip) return;
    const nameEl = chip.querySelector('[data-role="lo-name"]');
    const contactEl = chip.querySelector('[data-role="lo-contact"]');
    const name = String(profileState.name || '').trim();
    const email = String(profileState.email || '').trim();
    const phone = String(profileState.phone || '').trim();
    const photoDataUrl = typeof profileState.photoDataUrl === 'string' ? profileState.photoDataUrl : '';
    if(nameEl){
      if(photoDataUrl){
        if(!nameEl.__photoOriginal){
          nameEl.__photoOriginal = {
            display: nameEl.style.display || '',
            alignItems: nameEl.style.alignItems || '',
            gap: nameEl.style.gap || ''
          };
        }
        nameEl.style.display = 'flex';
        nameEl.style.alignItems = 'center';
        nameEl.style.gap = '8px';
      }else if(nameEl.__photoFlexApplied){
        const original = nameEl.__photoOriginal || {};
        nameEl.style.display = original.display || '';
        nameEl.style.alignItems = original.alignItems || '';
        nameEl.style.gap = original.gap || '';
        nameEl.__photoOriginal = null;
      }
      nameEl.textContent = name || (text?.('settings.profile.prompt') ?? __textFallback__('settings.profile.prompt'));
      if(photoDataUrl){
        let img = nameEl.querySelector('[data-role="lo-photo"]');
        if(!img){
          img = document.createElement('img');
          img.dataset.role = 'lo-photo';
          img.alt = '';
          img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;';
          nameEl.insertBefore(img, nameEl.firstChild);
        }
        img.src = photoDataUrl;
        nameEl.__photoFlexApplied = true;
      }else{
        const img = nameEl.querySelector('[data-role="lo-photo"]');
        if(img) img.remove();
        nameEl.__photoFlexApplied = false;
      }
    }
    if(contactEl){
      const parts = [];
      if(email) parts.push(email);
      if(phone) parts.push(phone);
      contactEl.textContent = parts.length ? parts.join(' • ') : '—';
    }
  }

  function normalizeSignatureRows(){
    return signatureState.rows
      .map(row => ({
        id: row.id,
        title: String(row.title || '').trim(),
        body: String(row.body || '').trim(),
        updatedAt: row.updatedAt || Date.now()
      }))
      .filter(row => row.title && row.body);
  }

  function syncSignatureState(signature){
    const items = Array.isArray(signature && signature.items) ? signature.items : [];
    signatureState.rows = items.map(item => ({
      id: String(item.id),
      title: String(item.title || ''),
      body: String(item.body || ''),
      updatedAt: item.updatedAt || Date.now(),
      isNew: false
    }));
    const stored = readSignatureLocal();
    if(stored){
      const match = signatureState.rows.find(row => row.body === stored);
      if(match){
        signatureState.defaultId = match.id;
      }else{
        const rowId = generateRowId();
        signatureState.rows.unshift({
          id: rowId,
          title: 'Default',
          body: stored,
          updatedAt: Date.now(),
          isNew: false
        });
        signatureState.defaultId = rowId;
      }
    }else{
      signatureState.defaultId = signature && signature.defaultId && signatureState.rows.some(row => row.id === signature.defaultId)
        ? signature.defaultId
        : (signatureState.rows[0] ? signatureState.rows[0].id : null);
    }
  }

  async function saveSignatures(card){
    if(!ensureSettings()) return;
    const items = normalizeSignatureRows();
    if(items.length === 0){
      signatureState.rows = [];
      signatureState.defaultId = null;
    }else if(!signatureState.defaultId || !items.some(row => row.id === signatureState.defaultId)){
      signatureState.defaultId = items[0].id;
    }
    const payload = { signature: { items, defaultId: signatureState.defaultId } };
    const result = await window.Settings.save(payload);
    syncSignatureState(result.signature);
    const defaultRow = signatureState.rows.find(row => row.id === signatureState.defaultId) || signatureState.rows[0];
    const defaultBody = defaultRow ? defaultRow.body : '';
    writeSignatureLocal(defaultBody);
    profileState.signature = defaultBody || profileState.signature;
    const signatureInput = document.getElementById('lo-signature');
    if(signatureInput && !signatureInput.matches(':focus')){
      signatureInput.value = profileState.signature;
    }
    renderSignatureRows(card);
    toastSafe('Signature saved');
  }

  function handleSignatureClick(card, evt){
    const target = evt.target;
    if(!target) return;
    if(target.id === 'btn-sig-add'){
      evt.preventDefault();
      const row = { id: generateRowId(), title: '', body: '', updatedAt: Date.now(), isNew: true };
      signatureState.rows.push(row);
      renderSignatureRows(card);
      const focusField = card.querySelector(`tr[data-id="${row.id}"] input[type="text"]`);
      if(focusField) focusField.focus();
      return;
    }
    const action = target.getAttribute('data-action');
    if(!action) return;
    const tr = target.closest('tr[data-id]');
    if(!tr) return;
    const rowId = tr.getAttribute('data-id');
    const row = signatureState.rows.find(item => item.id === rowId);
    if(!row) return;
    if(action === 'save'){
      evt.preventDefault();
      const titleField = tr.querySelector('input[type="text"]');
      const bodyField = tr.querySelector('textarea');
      row.title = titleField ? titleField.value : '';
      row.body = bodyField ? bodyField.value : '';
      row.updatedAt = Date.now();
      row.isNew = false;
      saveSignatures(card).catch(err => console.error(text?.('toast.signature.save-failed') ?? __textFallback__('toast.signature.save-failed'), err));
      return;
    }
    if(action === 'delete'){
      evt.preventDefault();
      signatureState.rows = signatureState.rows.filter(item => item.id !== rowId);
      if(signatureState.defaultId === rowId){
        signatureState.defaultId = signatureState.rows[0] ? signatureState.rows[0].id : null;
      }
      saveSignatures(card).catch(err => console.error(text?.('toast.signature.delete-failed') ?? __textFallback__('toast.signature.delete-failed'), err));
      return;
    }
  }

  function handleSignatureChange(card, evt){
    const target = evt.target;
    if(!(target instanceof HTMLInputElement)) return;
    if(target.name !== 'sig-default') return;
    const rowId = target.value;
    if(!rowId) return;
    signatureState.defaultId = rowId;
    saveSignatures(card).catch(err => console.error(text?.('toast.signature.default-failed') ?? __textFallback__('toast.signature.default-failed'), err));
  }

  function handleSignatureInput(card, evt){
    const target = evt.target;
    if(!target) return;
    if(!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    const tr = target.closest('tr[data-id]');
    if(!tr) return;
    const rowId = tr.getAttribute('data-id');
    const row = signatureState.rows.find(item => item.id === rowId);
    if(!row) return;
    if(target instanceof HTMLInputElement){
      row.title = target.value;
    }else{
      row.body = target.value;
    }
    renderSignaturePreview(card);
  }

  async function hydrateSignatures(snapshot){
    const card = document.getElementById('signatures-editor');
    if(!card || !ensureSettings()) return;
    if(snapshot && typeof snapshot === 'object' && snapshot.signature !== undefined){
      syncSignatureState(snapshot.signature);
    }else{
      const data = await window.Settings.get();
      syncSignatureState(data.signature);
    }
    renderSignatureRows(card);
    if(!card.__wired){
      card.__wired = true;
      card.addEventListener('click', evt => handleSignatureClick(card, evt));
      card.addEventListener('change', evt => handleSignatureChange(card, evt));
      card.addEventListener('input', evt => handleSignatureInput(card, evt));
    }
  }

  function hydrateGoals(goals){
    const fundedInput = document.getElementById('goal-funded');
    const volumeInput = document.getElementById('goal-volume');
    if(fundedInput) fundedInput.value = goals && goals.monthlyFundedGoal ? goals.monthlyFundedGoal : '';
    if(volumeInput) volumeInput.value = goals && goals.monthlyVolumeGoal ? goals.monthlyVolumeGoal : '';
    const saveBtn = document.getElementById('btn-goals-save');
    if(saveBtn && !saveBtn.__wired){
      saveBtn.__wired = true;
      saveBtn.addEventListener('click', async evt => {
        evt.preventDefault();
        if(!ensureSettings()) return;
        const funded = Math.max(0, Number(fundedInput && fundedInput.value ? fundedInput.value : 0) || 0);
        const volume = Math.max(0, Number(volumeInput && volumeInput.value ? volumeInput.value : 0) || 0);
        await window.Settings.save({ goals: { monthlyFundedGoal: funded, monthlyVolumeGoal: volume, updatedAt: new Date().toISOString() } });
        toastSafe(text?.('settings.toast.goals-saved') ?? __textFallback__('settings.toast.goals-saved'));
      });
    }
  }

  function hydrateProfile(profile){
    const nameInput = document.getElementById('lo-name');
    const emailInput = document.getElementById('lo-email');
    const phoneInput = document.getElementById('lo-phone');
    const signatureInput = document.getElementById('lo-signature');
    const localProfile = readProfileLocal();
    const mergedProfile = Object.assign({}, profile || {}, localProfile || {});
    profileState.name = mergedProfile && mergedProfile.name ? mergedProfile.name : '';
    profileState.email = mergedProfile && mergedProfile.email ? mergedProfile.email : '';
    profileState.phone = mergedProfile && mergedProfile.phone ? mergedProfile.phone : '';
    profileState.photoDataUrl = typeof mergedProfile.photoDataUrl === 'string' ? mergedProfile.photoDataUrl : '';
    const storedSignature = readSignatureLocal();
    profileState.signature = storedSignature || (mergedProfile && mergedProfile.signature ? mergedProfile.signature : '');
    if(nameInput) nameInput.value = profileState.name;
    if(emailInput) emailInput.value = profileState.email;
    if(phoneInput) phoneInput.value = profileState.phone;
    if(signatureInput) signatureInput.value = profileState.signature;
    const saveBtn = document.getElementById('btn-lo-save');
    if(saveBtn && !saveBtn.__wired){
      saveBtn.__wired = true;
      saveBtn.addEventListener('click', async evt => {
        evt.preventDefault();
        if(!ensureSettings()) return;
        profileState.name = nameInput ? nameInput.value : '';
        profileState.email = emailInput ? emailInput.value : '';
        profileState.phone = phoneInput ? phoneInput.value : '';
        profileState.signature = signatureInput ? signatureInput.value : '';
        renderProfileBadge();
        const card = document.getElementById('signatures-editor');
        if(card) renderSignaturePreview(card);
        const payload = Object.assign({}, profileState);
        writeProfileLocal(payload);
        writeSignatureLocal(profileState.signature || '');
        await window.Settings.save({ loProfile: payload });
        if(window.renderAll && typeof window.renderAll === 'function'){
          try{ window.renderAll('profiles:saved'); }
          catch(err){ console.warn('renderAll profiles:saved failed', err); }
        }
        toastSafe(text?.('settings.toast.profile-saved') ?? __textFallback__('settings.toast.profile-saved'));
      });
    }
    const card = document.getElementById('signatures-editor');
    if(card) renderSignaturePreview(card);
    renderProfileBadge();
  }

  async function hydrateAll(){
    if(hydrating) return;
    hydrating = true;
    try{
      if(!ensureSettings()) return;
      const data = await window.Settings.get();
      hydrateDashboardSettings(data.dashboard || {});
      hydrateGoals(data.goals || {});
      hydrateProfile(data.loProfile || {});
      syncSignatureState(data.signature || {});
      await hydrateSignatures(data);
    }catch(err){
      console.error(text?.('toast.settings.hydrate-failed') ?? __textFallback__('toast.settings.hydrate-failed'), err);
    }finally{
      hydrating = false;
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', hydrateAll, { once: true });
  }else{
    hydrateAll();
  }

  document.addEventListener('app:data:changed', evt => {
    const scope = evt && evt.detail && evt.detail.scope;
    if(scope && scope !== 'settings') return;
    hydrateAll();
  });
})();
  function readProfileLocal(){
    try{
      const raw = localStorage.getItem(PROFILE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    }catch(_err){ return null; }
  }

  function writeProfileLocal(data){
    try{
      if(data && typeof data === 'object'){
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
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

