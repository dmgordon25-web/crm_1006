export const __esModule = true;
(function(){
  const INIT_KEY = 'patch_2025_09_27_merge_ui';
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__[INIT_KEY]) return;
  window.__INIT_FLAGS__[INIT_KEY] = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-27_merge_ui.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-27_merge_ui.js');
  }

  const queueMicro = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn)=>Promise.resolve().then(fn);

  const RenderGuard = window.RenderGuard || { enter(){}, exit(){}, isRendering(){ return false; } };

  const STYLE_ID = 'merge-ui-styles';
  const MODAL_ID = 'contact-merge-modal';

  const STATIC_FIELD_DEFS = [
    { key:'first', label:'First Name', type:'text' },
    { key:'last', label:'Last Name', type:'text' },
    { key:'preferredName', label:'Preferred Name', type:'text' },
    { key:'email', label:'Primary Email', type:'email', normalize: normalizeEmail },
    { key:'secondaryEmail', label:'Secondary Email', type:'email', normalize: normalizeEmail },
    { key:'phone', label:'Mobile / Direct', type:'phone', normalize: normalizePhone },
    { key:'secondaryPhone', label:'Secondary Phone', type:'phone', normalize: normalizePhone },
    { key:'leadSource', label:'Lead Source', type:'text' },
    { key:'contactType', label:'Contact Role', type:'text' },
    { key:'priority', label:'Priority', type:'text' },
    { key:'communicationPreference', label:'Communication Preference', type:'text' },
    { key:'stage', label:'Pipeline Stage', type:'select', normalize: normalizeStage },
    { key:'status', label:'Status', type:'select', normalize: normalizeLower },
    { key:'loanType', label:'Loan Program', type:'text', normalize: normalizeLoanProgram },
    { key:'loanProgram', label:'Loan Program (Legacy)', type:'text', normalize: normalizeLoanProgram, hidden:true },
    { key:'loanPurpose', label:'Loan Purpose', type:'text' },
    { key:'loanAmount', label:'Loan Amount', type:'number' },
    { key:'rate', label:'Rate', type:'number' },
    { key:'fundedDate', label:'Funded / Expected Closing', type:'date' },
    { key:'closingTimeline', label:'Closing Timeline', type:'text' },
    { key:'pipelineMilestone', label:'Pipeline Milestone', type:'text' },
    { key:'docStage', label:'Documentation Stage', type:'text' },
    { key:'address', label:'Street', type:'text' },
    { key:'city', label:'City', type:'text' },
    { key:'state', label:'State', type:'text', normalize: (v)=>normalizeText(v).toUpperCase() },
    { key:'zip', label:'ZIP', type:'text' },
    { key:'lastContact', label:'Last Contact', type:'date' },
    { key:'nextFollowUp', label:'Next Follow-Up', type:'date' },
    { key:'referredBy', label:'Referred By', type:'text' },
    { key:'buyerPartnerId', label:'Buyer Partner', type:'partner' },
    { key:'listingPartnerId', label:'Listing Partner', type:'partner' },
    { key:'tags', label:'Tags', type:'tags' },
    { key:'notes', label:'Notes', type:'textarea', allowCustom:true }
  ];

  const SCORE_FIELDS = ['first','last','email','phone','leadSource','stage','loanType','loanProgram','loanAmount','notes','city','state','zip','tags','buyerPartnerId','listingPartnerId','priority','status'];

  const IGNORED_TOP_LEVEL_KEYS = new Set([
    'id',
    'contactId',
    'createdAt',
    'updatedAt',
    'stageEnteredAt',
    'stageHistory',
    'tasks',
    'documents',
    'messages',
    '__persisted',
    '__meta',
    'extras',
    'timeline',
    'companies',
    'logs'
  ]);

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${MODAL_ID}.merge-dialog::backdrop{background:rgba(15,23,42,.35)}
      #${MODAL_ID}.merge-dialog{max-width:960px;width:94vw;border:none;border-radius:12px;padding:0}
      #${MODAL_ID}.merge-dialog .merge-shell{display:flex;flex-direction:column;max-height:90vh}
      #${MODAL_ID}.merge-dialog .merge-header{display:flex;flex-direction:column;gap:12px;padding:18px 20px 0}
      #${MODAL_ID}.merge-dialog .merge-header h2{margin:0;font-size:20px;color:#0f172a}
      #${MODAL_ID}.merge-dialog .merge-sides{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #${MODAL_ID}.merge-dialog .merge-side{border:1px solid #e2e8f0;border-radius:10px;padding:12px}
      #${MODAL_ID}.merge-dialog .merge-side[data-base="true"]{border-color:#2563eb;box-shadow:0 0 0 1px rgba(37,99,235,0.2)}
      #${MODAL_ID}.merge-dialog .merge-side strong{font-size:16px;color:#0f172a}
      #${MODAL_ID}.merge-dialog .merge-body{padding:0 20px 12px;overflow:auto}
      #${MODAL_ID}.merge-dialog .merge-preview{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:1px solid #e2e8f0;margin-bottom:16px}
      #${MODAL_ID}.merge-dialog .merge-preview .preview-heading{font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:0.04em}
      #${MODAL_ID}.merge-dialog .merge-preview .preview-row{display:flex;flex-wrap:wrap;gap:16px}
      #${MODAL_ID}.merge-dialog .merge-preview .preview-card{flex:1 1 180px;border-radius:10px;background:#f8fafc;padding:12px 14px;min-width:160px}
      #${MODAL_ID}.merge-dialog .preview-card span{display:block;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px}
      #${MODAL_ID}.merge-dialog .preview-card strong{color:#0f172a;font-size:15px}
      #${MODAL_ID}.merge-dialog .merge-base-options{display:flex;flex-wrap:wrap;gap:16px;align-items:center}
      #${MODAL_ID}.merge-dialog .merge-grid{display:grid;grid-template-columns:180px 1fr 1fr;align-items:stretch}
      #${MODAL_ID}.merge-dialog .merge-row{display:contents}
      #${MODAL_ID}.merge-dialog .merge-label{padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#0f172a;font-size:13px}
      #${MODAL_ID}.merge-dialog .merge-option{padding:10px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:flex-start}
      #${MODAL_ID}.merge-dialog .merge-option .option-label{font-size:11px;color:#475569;font-weight:600;min-width:56px;padding-top:2px;text-transform:uppercase;letter-spacing:0.04em}
      #${MODAL_ID}.merge-dialog .merge-option input{margin-top:2px}
      #${MODAL_ID}.merge-dialog .merge-option .value{white-space:pre-wrap;font-size:13px;color:#0f172a}
      #${MODAL_ID}.merge-dialog .merge-option .value.muted{color:#94a3b8}
      #${MODAL_ID}.merge-dialog .merge-row.conflict .merge-label{background:#fef3c7}
      #${MODAL_ID}.merge-dialog .merge-row.conflict .merge-option{background:#fff8eb}
      #${MODAL_ID}.merge-dialog .merge-row.equal .merge-option{background:#f8fafc}
      #${MODAL_ID}.merge-dialog .merge-row .merge-custom{grid-column:span 3;border-bottom:1px solid #e2e8f0;padding:12px 12px 16px;background:#f8fafc;display:flex;flex-direction:column;gap:6px}
      #${MODAL_ID}.merge-dialog textarea.merge-notes-input{width:100%;min-height:120px;border:1px solid #cbd5f5;border-radius:8px;padding:8px;font-size:13px;font-family:inherit}
      #${MODAL_ID}.merge-dialog .merge-footer{display:flex;justify-content:flex-end;gap:12px;padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc}
      #${MODAL_ID}.merge-dialog .merge-error{color:#b91c1c;font-size:13px;margin-right:auto;align-self:center}
      #${MODAL_ID}.merge-dialog .merge-info{font-size:13px;color:#64748b}
      @media(max-width:768px){
        #${MODAL_ID}.merge-dialog .merge-grid{grid-template-columns:140px minmax(0,1fr)}
        #${MODAL_ID}.merge-dialog .merge-option[data-side="B"]{grid-column:span 2}
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeText(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeLower(value){
    return normalizeText(value).toLowerCase();
  }

  function normalizeEmail(value){
    const trimmed = normalizeText(value).toLowerCase();
    return trimmed;
  }

  function normalizePhone(value){
    const raw = normalizeText(value);
    return raw.replace(/[^0-9x+]/gi, '');
  }

  function normalizeLoanProgram(value){
    const text = normalizeText(value);
    if(!text) return '';
    const upper = text.toUpperCase();
    if(upper.includes('FHA')) return 'FHA';
    if(upper.includes('VA')) return 'VA';
    if(upper.includes('USDA')) return 'USDA';
    if(/JUMBO/.test(upper)) return 'Jumbo';
    if(/HELOC/.test(upper)) return 'HELOC';
    if(/CONV/.test(upper) || /CONVENTIONAL/.test(upper)) return 'Conventional';
    return text;
  }

  function normalizeStage(value){
    const fn = typeof window.canonicalizeStage === 'function'
      ? window.canonicalizeStage
      : (val)=>String(val==null?'':val).trim().toLowerCase();
    return fn(value);
  }

  function normalizeTags(value){
    const list = Array.isArray(value) ? value : String(value||'').split(',');
    const map = new Map();
    list.forEach(item => {
      const text = String(item||'').trim();
      if(!text) return;
      const key = text.toLowerCase();
      if(!map.has(key)) map.set(key, text);
    });
    return Array.from(map.values());
  }

  function combineNotes(base, other, loserName){
    const a = normalizeText(base);
    const b = normalizeText(other);
    if(!a && !b) return '';
    if(!a) return b;
    if(!b) return a;
    if(a === b) return a;
    const divider = `\n\n— merged from ${loserName || 'duplicate'} —\n`;
    if(a.includes(divider.trim()) || b.includes(divider.trim())){
      return `${a}\n\n${b}`.trim();
    }
    return `${a}${divider}${b}`;
  }

  function cloneContact(contact){
    return JSON.parse(JSON.stringify(contact||{}));
  }

  function scoreContact(contact){
    let score = 0;
    SCORE_FIELDS.forEach(key => {
      const value = contact && contact[key];
      if(value == null) return;
      if(Array.isArray(value)){ if(value.length) score += 2; return; }
      if(typeof value === 'object'){ if(Object.keys(value).length) score += 1; return; }
      const text = String(value).trim();
      if(text) score += 1;
    });
    if(contact && Array.isArray(contact.extras?.timeline)) score += contact.extras.timeline.length;
    score += Number(contact && contact.updatedAt || 0) / 1e11;
    return score;
  }

  function nameFor(contact){
    if(!contact) return '';
    const first = normalizeText(contact.first || contact.nameFirst);
    const last = normalizeText(contact.last || contact.nameLast);
    const alias = normalizeText(contact.preferredName || contact.nickname || contact.alias);
    const combo = [first, last].filter(Boolean).join(' ');
    if(combo) return combo;
    if(alias) return alias;
    const fallback = normalizeText(contact.name || contact.company || contact.email || contact.phone);
    return fallback || 'Contact';
  }

  function displayNameFor(contact){
    const first = normalizeText(contact.first);
    const last = normalizeText(contact.last);
    const alias = normalizeText(contact.preferredName || contact.nickname || contact.alias);
    const base = [first, last].filter(Boolean).join(' ');
    if(base) return base;
    if(alias) return alias;
    const raw = normalizeText(contact.displayName || contact.name || contact.company || contact.email || contact.phone);
    return raw || 'Contact';
  }

  function formatValue(field, value, contacts){
    if(field && typeof field.format === 'function'){
      try{ return field.format(value, contacts); }
      catch(_){ /* noop */ }
    }
    if(field.type === 'tags'){
      const list = Array.isArray(value) ? value : normalizeTags(value);
      return list.length ? list.join(', ') : '—';
    }
    if(field.type === 'partner'){
      if(!value) return '—';
      return partnerName(value, contacts);
    }
    if(field.type === 'textarea'){
      const text = normalizeText(value);
      return text || '—';
    }
    if(field.type === 'extra'){
      if(value == null) return '—';
      if(Array.isArray(value)){
        return value.length ? JSON.stringify(value, null, 2) : '—';
      }
      if(typeof value === 'object'){
        const keys = Object.keys(value);
        return keys.length ? JSON.stringify(value, null, 2) : '—';
      }
      const extraText = normalizeText(value);
      return extraText || '—';
    }

    const normalized = normalizeText(value);
    if(!normalized) return '—';
    if(field.type === 'date'){
      const ts = Date.parse(normalized);
      if(!Number.isNaN(ts)){
        try{
          return new Date(ts).toLocaleDateString();
        }catch(_){ /* noop */ }
      }
      return normalized;
    }
    if(field.type === 'number'){
      const num = Number(normalized);
      if(Number.isFinite(num)){
        if(/amount/i.test(field.label)){
          return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(num);
        }
        if(/rate/i.test(field.label)){
          return `${num.toFixed(3)}%`;
        }
      }
      return normalized || '—';
    }
    return normalized || '—';
  }

  function partnerName(id, contacts){
    const key = String(id||'');
    if(!key) return '—';
    try{
      const partners = contacts && contacts.partners ? contacts.partners : window.__CACHE__?.partners;
      if(Array.isArray(partners)){
        const match = partners.find(p => String(p.id) === key);
        if(match) return match.name || match.company || match.email || `Partner ${key}`;
      }
    }catch(_){ /* noop */ }
    if(key === String(window.NONE_PARTNER_ID || 'none')) return 'None';
    return `Partner ${key}`;
  }

  function comparisonValue(field, value){
    if(field && typeof field.compare === 'function'){
      try{ return field.compare(value); }
      catch(_){ /* noop */ }
    }
    if(field.type === 'tags'){
      return normalizeTags(value).map(v => v.toLowerCase()).sort().join('|');
    }
    if(field.type === 'textarea'){
      return normalizeText(value).replace(/\s+/g,' ');
    }
    if(field.type === 'partner'){
      return String(value||'').trim();
    }
    if(field.type === 'number'){
      const num = Number(value);
      return Number.isFinite(num) ? String(num) : normalizeText(value);
    }
    if(field.type === 'date'){
      const ts = Date.parse(value);
      if(!Number.isNaN(ts)) return new Date(ts).toISOString().slice(0,10);
      return normalizeText(value);
    }
    if(field.type === 'extra'){
      if(value == null) return '';
      if(Array.isArray(value)){
        return JSON.stringify(value);
      }
      if(typeof value === 'object'){
        const ordered = Object.keys(value).sort().map(key => `${key}:${JSON.stringify(value[key])}`);
        return ordered.join('|');
      }
      return normalizeText(value);
    }
    if(field.normalize){
      try{ return field.normalize(value); }
      catch(_){ return normalizeText(value); }
    }
    return normalizeText(value).toLowerCase();
  }

  function humanizeKey(key){
    if(!key) return '';
    const cleaned = String(key).replace(/([A-Z])/g, ' $1').replace(/[_\-]+/g, ' ');
    const spaced = cleaned.trim().replace(/\s+/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function buildFieldDefs(contacts){
    const map = new Map();
    STATIC_FIELD_DEFS.forEach(field => {
      map.set(field.key, Object.assign({ path: [field.key] }, field));
    });
    const extrasKeys = new Set();
    contacts.forEach(contact => {
      if(!contact) return;
      Object.keys(contact).forEach(key => {
        if(map.has(key) || IGNORED_TOP_LEVEL_KEYS.has(key)) return;
        const existing = map.get(key);
        if(existing) return;
        map.set(key, {
          key,
          label: humanizeKey(key),
          type: typeof contact[key] === 'number' ? 'number' : 'text',
          path: [key]
        });
      });
      const extras = contact.extras || {};
      Object.keys(extras).forEach(extraKey => extrasKeys.add(extraKey));
    });
    Array.from(extrasKeys).forEach(extraKey => {
      const label = `Extra: ${humanizeKey(extraKey)}`;
      map.set(`extras.${extraKey}`, {
        key: `extras.${extraKey}`,
        label,
        type: 'extra',
        path: ['extras', extraKey]
      });
    });
    const orderedStatic = STATIC_FIELD_DEFS.map(field => map.get(field.key)).filter(Boolean);
    const dynamicKeys = Array.from(map.values()).filter(field => !STATIC_FIELD_DEFS.some(staticField => staticField.key === field.key));
    const dynamicTopLevel = dynamicKeys.filter(field => !field.key.startsWith('extras.')).sort((a,b) => a.label.localeCompare(b.label));
    const dynamicExtras = dynamicKeys.filter(field => field.key.startsWith('extras.')).sort((a,b) => a.label.localeCompare(b.label));
    return orderedStatic.concat(dynamicTopLevel, dynamicExtras);
  }

  function getFieldValue(contact, field){
    if(!contact || !field) return undefined;
    if(Array.isArray(field.path)){
      let current = contact;
      for(const segment of field.path){
        if(current == null) return undefined;
        current = current[segment];
      }
      return current;
    }
    return contact[field.key];
  }

  function setFieldValue(target, field, value){
    if(!field) return;
    if(Array.isArray(field.path)){
      let current = target;
      for(let i=0;i<field.path.length;i++){
        const segment = field.path[i];
        if(i === field.path.length - 1){
          current[segment] = value;
        }else{
          if(!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
          current = current[segment];
        }
      }
      return;
    }
    target[field.key] = value;
  }

  function hasMeaningfulValue(field, value){
    if(value == null) return false;
    if(field.type === 'tags'){
      return normalizeTags(value).length > 0;
    }
    if(field.type === 'number'){
      if(typeof value === 'number') return !Number.isNaN(value);
      const num = Number(value);
      if(Number.isFinite(num)) return true;
      return normalizeText(value) !== '';
    }
    if(field.type === 'partner'){
      const noneId = typeof window !== 'undefined' ? window.NONE_PARTNER_ID : undefined;
      return normalizeText(value) !== '' && value !== noneId;
    }
    if(field.type === 'extra'){
      if(Array.isArray(value)) return value.length > 0;
      if(typeof value === 'object') return Object.keys(value).length > 0;
      return normalizeText(value) !== '';
    }
    if(field.type === 'textarea'){
      return normalizeText(value) !== '';
    }
    return normalizeText(value) !== '';
  }

  function determineDefaultSource(state, field, rowValues, normalized){
    if(!Array.isArray(rowValues) || rowValues.length < 2) return 'A';
    if(normalized[0] === normalized[1]) return null;
    const meaningfulA = hasMeaningfulValue(field, rowValues[0]);
    const meaningfulB = hasMeaningfulValue(field, rowValues[1]);
    if(meaningfulA && !meaningfulB) return 'A';
    if(meaningfulB && !meaningfulA) return 'B';
    const updatedA = Number(state.contacts[0]?.updatedAt || 0);
    const updatedB = Number(state.contacts[1]?.updatedAt || 0);
    if(updatedA !== updatedB){
      return updatedA >= updatedB ? 'A' : 'B';
    }
    return 'A';
  }

  function ensureModal(){
    let dlg = document.getElementById(MODAL_ID);
    if(dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = MODAL_ID;
    dlg.className = 'record-modal merge-dialog';
    dlg.innerHTML = `
      <div class="merge-shell">
        <div class="merge-header">
          <div class="row" style="align-items:center;gap:12px">
            <h2 class="grow">Merge Contacts</h2>
            <button class="btn" type="button" data-merge-close>Close</button>
          </div>
          <div class="merge-base-options" data-role="base-options"></div>
          <div class="merge-sides" data-role="sides"></div>
        </div>
        <div class="merge-body">
          <div class="merge-preview" data-role="preview"></div>
          <div class="merge-info" data-role="instructions">Select a base contact and resolve highlighted differences. Notes can be customized.</div>
          <div class="merge-grid" data-role="grid"></div>
        </div>
        <div class="merge-footer">
          <div class="merge-error" data-role="error" style="display:none"></div>
          <button class="btn" type="button" data-merge-cancel>Cancel</button>
          <button class="btn brand" type="button" data-merge-confirm disabled>Merge</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    return dlg;
  }

  function setError(state, message){
    const errEl = state.nodes.error;
    if(!errEl) return;
    if(message){
      errEl.textContent = message;
      errEl.style.display = '';
    }else{
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  function computeSelection(state){
    const merged = cloneContact(state.contacts[state.baseIndex]);
    const other = state.contacts[state.baseIndex===0?1:0];
    const loserName = nameFor(other);
    const base = state.contacts[state.baseIndex];
    const manual = state.manual;
    const fields = Array.isArray(state.fields) ? state.fields : [];
    for(const field of fields){
      if(field.hidden) continue;
      const selection = state.selections.get(field.key);
      const values = [
        getFieldValue(state.contacts[0], field),
        getFieldValue(state.contacts[1], field)
      ];
      let value = getFieldValue(base, field);
      if(selection){
        if(selection.source === 'A'){ value = values[0]; }
        else if(selection.source === 'B'){ value = values[1]; }
        else if(selection.source === 'custom'){ value = selection.value; }
      }else if(!manual.has(field.key)){
        const defaultSource = determineDefaultSource(state, field, values, values.map(v => comparisonValue(field, v)));
        if(defaultSource === 'A') value = values[0];
        else if(defaultSource === 'B') value = values[1];
      }
      if(field.key === 'notes'){
        const combined = combineNotes(getFieldValue(state.contacts[state.baseIndex], field), getFieldValue(other, field), loserName);
        if(selection && selection.source === 'custom') value = selection.value;
        else if(comparisonValue(field, values[0]) !== comparisonValue(field, values[1])){
          if(!manual.has(field.key)) value = combined;
        }
        setFieldValue(merged, field, value);
        continue;
      }
      if(field.key === 'tags'){
        const union = normalizeTags([].concat(state.contacts[0].tags||[], state.contacts[1].tags||[]));
        if(selection){
          if(selection.source === 'custom') setFieldValue(merged, field, normalizeTags(selection.value));
          else if(selection.source === 'A') setFieldValue(merged, field, normalizeTags(values[0]));
          else if(selection.source === 'B') setFieldValue(merged, field, normalizeTags(values[1]));
          else setFieldValue(merged, field, union);
        }else if(!manual.has(field.key)){
          setFieldValue(merged, field, union);
        }else{
          setFieldValue(merged, field, value);
        }
        continue;
      }
      if(field.key === 'extras.timeline'){
        const fromA = Array.isArray(values[0]) ? values[0] : [];
        const fromB = Array.isArray(values[1]) ? values[1] : [];
        let timelineValue = Array.isArray(value) ? value.slice() : (value == null ? [] : [].concat(value));
        if(selection){
          if(selection.source === 'A') timelineValue = fromA.slice();
          else if(selection.source === 'B') timelineValue = fromB.slice();
          else if(selection.source === 'custom') timelineValue = Array.isArray(selection.value) ? selection.value.slice() : selection.value;
        }else if(!manual.has(field.key)){
          timelineValue = fromA.concat(fromB);
        }
        setFieldValue(merged, field, timelineValue);
        continue;
      }
      if(field.key === 'loanProgram'){
        let resolvedLoanProgram = value || '';
        if(selection){
          if(selection.source === 'A') resolvedLoanProgram = values[0] || '';
          else if(selection.source === 'B') resolvedLoanProgram = values[1] || '';
          else if(selection.source === 'custom') resolvedLoanProgram = selection.value || '';
        }else if(!resolvedLoanProgram){
          resolvedLoanProgram = values[state.baseIndex===0?1:0] || '';
        }
        setFieldValue(merged, field, resolvedLoanProgram || '');
        continue;
      }
      setFieldValue(merged, field, value);
    }
    merged.createdAt = Math.min(...state.contacts.map(c => Number(c.createdAt||Date.now())));
    merged.updatedAt = Date.now();
    if(!merged.stage) merged.stage = state.contacts[state.baseIndex].stage || state.contacts[state.baseIndex].status;
    merged.stage = normalizeStage(merged.stage);
    merged.loanType = normalizeLoanProgram(merged.loanType || merged.loanProgram || '');
    if(merged.loanType && !merged.loanProgram) merged.loanProgram = merged.loanType;
    merged.email = normalizeEmail(merged.email);
    merged.secondaryEmail = normalizeEmail(merged.secondaryEmail);
    if(merged.phone) merged.phone = normalizeText(merged.phone);
    if(merged.secondaryPhone) merged.secondaryPhone = normalizeText(merged.secondaryPhone);
    merged.first = normalizeText(merged.first);
    merged.last = normalizeText(merged.last);
    merged.preferredName = normalizeText(merged.preferredName);
    merged.displayName = displayNameFor(merged);
    merged.leadSource = normalizeText(merged.leadSource);
    merged.referredBy = normalizeText(merged.referredBy);
    merged.address = normalizeText(merged.address);
    merged.city = normalizeText(merged.city);
    merged.state = normalizeText(merged.state).toUpperCase();
    merged.zip = normalizeText(merged.zip);
    if(merged.notes) merged.notes = normalizeText(merged.notes).replace(/\s+$/,'');
    merged.lastContact = merged.lastContact || state.contacts[state.baseIndex].lastContact || state.contacts[state.baseIndex].lastTouch;
    merged.extras = cloneContact(merged.extras || {});
    const baseExtras = state.contacts[state.baseIndex].extras || {};
    const otherExtras = state.contacts[state.baseIndex===0?1:0].extras || {};
    const baseTimeline = Array.isArray(baseExtras.timeline) ? baseExtras.timeline : [];
    const otherTimeline = Array.isArray(otherExtras.timeline) ? otherExtras.timeline : [];
    if(other.stageEnteredAt){
      merged.stageEnteredAt = Object.assign({}, other.stageEnteredAt, merged.stageEnteredAt || {});
    }
    const changes = [];
    for(const field of fields){
      if(field.hidden) continue;
      const before = getFieldValue(state.contacts[state.baseIndex], field);
      const after = getFieldValue(merged, field);
      if(field.key === 'loanProgram' && !before && !after) continue;
      if(comparisonValue(field, before) !== comparisonValue(field, after)) changes.push(field.key);
    }
    const mergedTimeline = Array.isArray(merged.extras?.timeline) ? merged.extras.timeline : [];
    const hasTimelineAddition = otherTimeline.length > 0 && mergedTimeline.length >= otherTimeline.length;
    const hasTags = Array.isArray(merged.tags) && merged.tags.length;
    return { merged, changes, hasTimelineAddition, diffCount: changes.length + (hasTimelineAddition ? 1 : 0) + (hasTags ? 0 : 0) };
  }

  function updatePreview(state, result){
    const preview = state.nodes.preview;
    if(!preview) return;
    preview.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'preview-heading';
    heading.textContent = 'Merged Preview';
    preview.appendChild(heading);
    const row = document.createElement('div');
    row.className = 'preview-row';
    const cards = [
      { label:'Display Name', value: displayNameFor(result.merged) },
      { label:'Primary Email', value: result.merged.email || '—' },
      { label:'Primary Phone', value: result.merged.phone || '—' }
    ];
    cards.forEach(card => {
      const div = document.createElement('div');
      div.className = 'preview-card';
      const span = document.createElement('span');
      span.textContent = card.label;
      const strong = document.createElement('strong');
      strong.textContent = card.value || '—';
      div.appendChild(span);
      div.appendChild(strong);
      row.appendChild(div);
    });
    preview.appendChild(row);
  }

  function refreshState(state){
    try{
      const result = computeSelection(state);
      state.result = result;
      const button = state.nodes.confirm;
      const diffCount = result.diffCount;
      const ready = diffCount >= 0 && !state.errors.size;
      if(button){ button.disabled = !ready; button.textContent = diffCount > 0 ? `Merge (${diffCount} change${diffCount===1?'':'s'})` : 'Merge'; }
      updatePreview(state, result);
      setError(state, state.errors.size ? Array.from(state.errors.values())[0] : '');
    }catch(err){
      console.error('merge preview error', err);
      state.errors.set('compute', err.message || 'Failed to compute merge');
      setError(state, err.message || 'Failed to compute merge');
      if(state.nodes.confirm) state.nodes.confirm.disabled = true;
    }
  }

  function clearRowCleanup(state){
    if(!Array.isArray(state.rowCleanup)) return;
    while(state.rowCleanup.length){
      const fn = state.rowCleanup.pop();
      try{ fn(); }
      catch(_){ /* noop */ }
    }
  }

  function buildRows(state){
    const grid = state.nodes.grid;
    if(!grid) return;
    clearRowCleanup(state);
    grid.innerHTML = '';
    const contacts = state.contacts;
    const fields = Array.isArray(state.fields) ? state.fields : [];
    fields.filter(field => !field.hidden).forEach(field => {
      const rowValues = contacts.map(c => getFieldValue(c, field));
      const normalized = rowValues.map(v => comparisonValue(field, v));
      const same = normalized[0] === normalized[1];
      const row = document.createElement('div');
      row.className = 'merge-row';
      if(same) row.classList.add('equal');
      else row.classList.add('conflict');

      const rowLabel = document.createElement('div');
      rowLabel.className = 'merge-label';
      rowLabel.textContent = field.label;
      row.appendChild(rowLabel);

      let selection = state.selections.get(field.key);
      if(!selection && !same){
        const defaultSource = determineDefaultSource(state, field, rowValues, normalized);
        if(defaultSource){
          selection = { source: defaultSource };
          state.selections.set(field.key, selection);
        }
      }

      const optionA = buildOption(state, field, 0, rowValues, normalized, same);
      const optionB = buildOption(state, field, 1, rowValues, normalized, same);
      optionA.dataset.side = 'A';
      optionB.dataset.side = 'B';
      row.appendChild(optionA);
      row.appendChild(optionB);

      if(field.allowCustom){
        const customWrap = document.createElement('div');
        customWrap.className = 'merge-custom';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `merge-${field.key}`;
        radio.value = 'custom';
        radio.dataset.field = field.key;
        radio.dataset.source = 'custom';
        radio.style.marginRight = '8px';
        const radioLabel = document.createElement('label');
        radioLabel.style.display = 'flex';
        radioLabel.style.alignItems = 'center';
        radioLabel.style.gap = '8px';
        radioLabel.appendChild(radio);
        radioLabel.appendChild(document.createTextNode('Use custom text'));

        const customLabel = document.createElement('label');
        customLabel.textContent = 'Custom notes';
        const textarea = document.createElement('textarea');
        textarea.className = 'merge-notes-input';
        textarea.value = combineNotes(rowValues[state.baseIndex], rowValues[state.baseIndex===0?1:0], nameFor(state.contacts[state.baseIndex===0?1:0]));

        const handleInput = ()=>{
          if(!radio.checked) radio.checked = true;
          state.errors.clear();
          setError(state, '');
          state.customValues.set(field.key, textarea.value);
          state.selections.set(field.key, { source:'custom', value: textarea.value });
          state.manual.add(field.key);
          refreshState(state);
        };
        const handleRadio = ()=>{
          if(radio.checked){
            state.errors.clear();
            setError(state, '');
            state.customValues.set(field.key, textarea.value);
            state.selections.set(field.key, { source:'custom', value: textarea.value });
            state.manual.add(field.key);
            refreshState(state);
          }
        };

        textarea.addEventListener('input', handleInput);
        radio.addEventListener('change', handleRadio);
        state.rowCleanup.push(()=> textarea.removeEventListener('input', handleInput));
        state.rowCleanup.push(()=> radio.removeEventListener('change', handleRadio));
        state.cleanup.push(()=> textarea.removeEventListener('input', handleInput));
        state.cleanup.push(()=> radio.removeEventListener('change', handleRadio));

        customWrap.appendChild(radioLabel);
        customWrap.appendChild(customLabel);
        customWrap.appendChild(textarea);
        row.appendChild(customWrap);
      }

      grid.appendChild(row);
    });
  }

  function buildOption(state, field, index, rowValues, normalized, same){
    const wrap = document.createElement('label');
    wrap.className = 'merge-option';
    wrap.dataset.field = field.key;
    wrap.dataset.side = index === 0 ? 'A' : 'B';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `merge-${field.key}`;
    input.value = index === 0 ? 'A' : 'B';
    input.dataset.field = field.key;
    input.dataset.source = input.value;
    const existing = state.selections.get(field.key);
    const sourceKey = input.value;
    if(existing){
      input.checked = existing.source === sourceKey;
    }else{
      const defaultSource = determineDefaultSource(state, field, rowValues, normalized);
      const resolvedSource = defaultSource || 'A';
      input.checked = resolvedSource === sourceKey;
      if(!state.selections.has(field.key)){
        state.selections.set(field.key, { source: resolvedSource });
      }
    }
    if(same) input.disabled = true;
    const value = rowValues[index];
    const valueDiv = document.createElement('div');
    valueDiv.className = 'value';
    const formatted = formatValue(field, value, state.cache);
    if(formatted === '—') valueDiv.classList.add('muted');
    valueDiv.textContent = formatted;
    const choiceLabel = document.createElement('span');
    choiceLabel.className = 'option-label';
    choiceLabel.textContent = sourceKey === 'A' ? 'Keep A' : 'Keep B';
    wrap.appendChild(input);
    wrap.appendChild(choiceLabel);
    wrap.appendChild(valueDiv);
    const onChange = ()=>{
      if(!input.checked) return;
      state.errors.clear();
      setError(state, '');
      state.selections.set(field.key, { source: input.value });
      state.manual.add(field.key);
      refreshState(state);
    };
    input.addEventListener('change', onChange);
    state.rowCleanup.push(()=> input.removeEventListener('change', onChange));
    state.cleanup.push(()=> input.removeEventListener('change', onChange));
    return wrap;
  }

  function renderSides(state){
    const sides = state.nodes.sides;
    if(!sides) return;
    sides.innerHTML = '';
    state.contacts.forEach((contact, idx) => {
      const div = document.createElement('div');
      div.className = 'merge-side';
      if(idx === state.baseIndex) div.dataset.base = 'true';
      const title = document.createElement('strong');
      title.textContent = nameFor(contact);
      const meta = document.createElement('div');
      meta.className = 'merge-info';
      const email = contact.email || '—';
      const stage = contact.stage || contact.status || '—';
      meta.textContent = `Email: ${email || '—'} • Stage: ${stage}`;
      const id = document.createElement('div');
      id.className = 'merge-info';
      id.textContent = `ID: ${contact.id}`;
      div.appendChild(title);
      div.appendChild(meta);
      div.appendChild(id);
      sides.appendChild(div);
    });
  }

  function renderBaseOptions(state){
    const wrap = state.nodes.baseOptions;
    if(!wrap) return;
    wrap.innerHTML = '';
    state.contacts.forEach((contact, idx) => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '8px';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'merge-base';
      input.value = String(idx);
      input.checked = idx === state.baseIndex;
      label.appendChild(input);
      label.appendChild(document.createTextNode(`Keep ${nameFor(contact)} as base`));
      const onChange = ()=>{
        if(!input.checked) return;
        if(state.baseIndex === idx) return;
        state.baseIndex = idx;
        state.selections.clear();
        state.manual.clear();
        state.customValues.clear();
        buildRows(state);
        renderSides(state);
        refreshState(state);
      };
      input.addEventListener('change', onChange);
      state.cleanup.push(()=> input.removeEventListener('change', onChange));
      wrap.appendChild(label);
    });
  }

  function planDefaultBase(contacts){
    const scores = contacts.map(scoreContact);
    if(scores[0] === scores[1]){
      const updated = contacts.map(c => Number(c.updatedAt||0));
      if(updated[0] === updated[1]){
        return displayNameFor(contacts[0]).toLowerCase() <= displayNameFor(contacts[1]).toLowerCase() ? 0 : 1;
      }
      return updated[0] >= updated[1] ? 0 : 1;
    }
    return scores[0] >= scores[1] ? 0 : 1;
  }

  function attachControls(state){
    const dlg = state.dialog;
    const closeBtn = dlg.querySelector('[data-merge-close]');
    const cancelBtn = dlg.querySelector('[data-merge-cancel]');
    const confirmBtn = dlg.querySelector('[data-merge-confirm]');
    const onClose = ()=>{ cleanupState(state); };
    const onCancel = ()=>{
      try{ dlg.close(); }
      catch(_){ dlg.removeAttribute('open'); dlg.style.display = 'none'; }
    };
    const onConfirm = ()=>{
      if(confirmBtn.disabled) return;
      executeMerge(state).catch(err => {
        console.error('merge failed', err);
        setError(state, err && err.message ? err.message : 'Merge failed');
      });
    };
    dlg.addEventListener('close', onClose);
    closeBtn.addEventListener('click', onCancel);
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    state.cleanup.push(()=> dlg.removeEventListener('close', onClose));
    state.cleanup.push(()=> closeBtn.removeEventListener('click', onCancel));
    state.cleanup.push(()=> cancelBtn.removeEventListener('click', onCancel));
    state.cleanup.push(()=> confirmBtn.removeEventListener('click', onConfirm));
  }

  function cleanupState(state){
    clearRowCleanup(state);
    while(state.cleanup.length){
      const fn = state.cleanup.pop();
      try{ fn(); }catch(_){ /* noop */ }
    }
    state.selections.clear();
    state.manual.clear();
    state.errors.clear();
    setError(state, '');
  }

  async function executeMerge(state){
    setError(state, '');
    state.errors.clear();
    const result = computeSelection(state);
    const winner = state.contacts[state.baseIndex];
    const loser = state.contacts[state.baseIndex===0?1:0];
    if(!winner || !loser){
      throw new Error('Missing selected contacts');
    }
    if(!winner.id || !loser.id){
      throw new Error('Contacts missing identifiers');
    }
    const merged = Object.assign({}, winner, result.merged, { id: String(winner.id) });
    const plan = await planRewires(String(winner.id), String(loser.id));
    const dryErrors = validatePlan(plan);
    if(dryErrors.length){
      state.errors.set('plan', dryErrors[0]);
      setError(state, dryErrors[0]);
      if(state.nodes.confirm) state.nodes.confirm.disabled = true;
      return;
    }
    const dlg = state.dialog;
    const confirmBtn = state.nodes.confirm;
    await openDB();
    const originalWinner = cloneContact(await dbGet('contacts', winner.id) || winner);
    const originalLoser = cloneContact(await dbGet('contacts', loser.id) || loser);
    confirmBtn.disabled = true;
    try{
      await dbPut('contacts', merged);
      await applyPlan(plan);
      try{ await dbDelete('contacts', loser.id); }
      catch(err){ console.warn('merge delete loser failed', err); }
      await logMergeSummary(merged, loser, plan);
      if(typeof window.repointLinks === 'function'){
        try{ await window.repointLinks({ winnerId: String(winner.id), loserId: String(loser.id) }); }
        catch(err){ console.warn('merge repointLinks failed', err); }
      }
      try{
        dlg.close();
      }catch(_){ dlg.removeAttribute('open'); dlg.style.display = 'none'; }
      if(window.SelectionService && typeof window.SelectionService.clear === 'function'){
        window.SelectionService.clear();
      }
      queueMicro(()=>{
        if(typeof window.dispatchAppDataChanged === 'function'){
          window.dispatchAppDataChanged({ topic:'merge:contacts', winnerId:String(winner.id), loserId:String(loser.id) });
        }else{
          document.dispatchEvent(new CustomEvent('app:data:changed',{ detail:{ topic:'merge:contacts', winnerId:String(winner.id), loserId:String(loser.id) } }));
        }
      });
      if(typeof window.toast === 'function'){
        const count = plan.summary.totalUpdates;
        window.toast(`Merged contacts. Rewired ${count} item${count===1?'':'s'}.`);
      }
    }catch(err){
      console.error('merge execution error', err);
      state.errors.set('execute', err.message || 'Merge failed');
      setError(state, err.message || 'Merge failed');
      try{ await rollbackPlan(plan); }
      catch(e){ console.warn('merge rollback failed', e); }
      try{ await dbPut('contacts', originalWinner); }
      catch(e){ console.warn('merge winner restore failed', e); }
      try{ await dbPut('contacts', originalLoser); }
      catch(e){ console.warn('merge loser restore failed', e); }
      confirmBtn.disabled = false;
      throw err;
    }
  }

  async function rollbackPlan(plan){
    if(!plan || !Array.isArray(plan.entries)) return;
    for(const item of plan.entries){
      if(item.revert && item.revert.length){
        try{ await dbBulkPut(item.store, item.revert); }
        catch(err){ console.warn('merge rollback bulkput', item.store, err); }
      }
      if(Array.isArray(item.changedIds)){
        for(const newId of item.changedIds){
          try{ await dbDelete(item.store, newId); }
          catch(err){ console.warn('merge rollback remove new id', item.store, err); }
        }
      }
    }
  }

  function validatePlan(plan){
    const errors = [];
    if(!plan || !Array.isArray(plan.entries)) return errors;
    plan.entries.forEach(item => {
      if(!item.store) errors.push('Invalid store in rewire plan');
    });
    return errors;
  }

  async function applyPlan(plan){
    if(!plan || !Array.isArray(plan.entries)) return;
    for(const item of plan.entries){
      if(item.deletes && item.deletes.length){
        for(const record of item.deletes){
          const key = record && record.oldId ? record.oldId : record;
          try{ await dbDelete(item.store, key); }
          catch(err){ console.warn('merge delete old key', item.store, err); }
        }
      }
      if(item.updates && item.updates.length){
        const batchSize = 200;
        const needsYield = item.updates.length > 500;
        for(let i=0;i<item.updates.length;i+=batchSize){
          const chunk = item.updates.slice(i, i+batchSize);
          await dbBulkPut(item.store, chunk);
          if(needsYield) await Promise.resolve();
        }
      }
    }
  }

  async function planRewires(winnerId, loserId){
    const stores = Array.isArray(window.STORES) ? window.STORES.slice() : [];
    if(!stores.includes('activity')) stores.push('activity');
    const entries = [];
    const summary = { totalUpdates:0 };
    for(const store of stores){
      if(store === 'contacts' || store === 'partners') continue;
      let rows = [];
      try{ rows = await dbGetAll(store); }
      catch(err){ continue; }
      if(!Array.isArray(rows) || !rows.length) continue;
      const updates = [];
      const deletes = [];
      const revert = [];
      const changedIds = [];
      const existingById = new Map(rows.map(r => [String(r && r.id), r]));
      for(const row of rows){
        if(!row || String(row.contactId||'') !== loserId) continue;
        const updated = Object.assign({}, row, { contactId: winnerId });
        if(Object.prototype.hasOwnProperty.call(row, 'updatedAt')) updated.updatedAt = Date.now();
        if(store === 'notifications'){
          const type = row.type || (typeof row.id === 'string' ? row.id.split('|')[0] : 'notification');
          const newId = `${type}|${winnerId}`;
          updated.id = newId;
          deletes.push({ oldId: String(row.id), newId });
          if(newId !== String(row.id)) changedIds.push(newId);
          const existing = existingById.get(newId);
          if(existing && existing !== row){
            updated.status = existing.status || updated.status;
            updated.createdAt = Math.min(existing.createdAt||Date.now(), updated.createdAt||Date.now());
            updated.sentAt = existing.sentAt || updated.sentAt;
          }
        }else if(String(updated.id) !== String(row.id)){
          changedIds.push(String(updated.id));
        }
        updates.push(updated);
        revert.push(row);
      }
      if(updates.length || deletes.length){
        entries.push({ store, updates, deletes, revert, changedIds });
        summary.totalUpdates += updates.length;
      }
    }
    return { entries, summary };
  }

  async function logMergeSummary(winner, loser, plan){
    const summary = `Merged with ${nameFor(loser)} (${loser.id}) on ${(new Date()).toISOString()}`;
    if(typeof window.bulkAppendLog === 'function'){
      try{ await window.bulkAppendLog([String(winner.id)], summary, new Date().toISOString().slice(0,10), 'merge'); return; }
      catch(err){ console.warn('merge log bulkAppendLog failed', err); }
    }
    try{
      const record = await dbGet('contacts', winner.id);
      if(record){
        record.notes = combineNotes(record.notes, summary, nameFor(loser));
        record.updatedAt = Date.now();
        await dbPut('contacts', record);
      }
    }catch(err){ console.warn('merge summary fallback failed', err); }
  }

  async function openMergeModal(contacts){
    ensureStyle();
    const dlg = ensureModal();
    const state = {
      dialog: dlg,
      contacts,
      baseIndex: planDefaultBase(contacts),
      selections: new Map(),
      manual: new Set(),
      errors: new Map(),
      cleanup: [],
      customValues: new Map(),
      rowCleanup: [],
      nodes: {},
      fields: buildFieldDefs(contacts)
    };
    state.nodes.baseOptions = dlg.querySelector('[data-role="base-options"]');
    state.nodes.sides = dlg.querySelector('[data-role="sides"]');
    state.nodes.preview = dlg.querySelector('[data-role="preview"]');
    state.nodes.grid = dlg.querySelector('[data-role="grid"]');
    state.nodes.error = dlg.querySelector('[data-role="error"]');
    state.nodes.confirm = dlg.querySelector('[data-merge-confirm]');
    state.cache = { partners: await loadPartnersCache() };
    renderBaseOptions(state);
    renderSides(state);
    buildRows(state);
    attachControls(state);
    refreshState(state);
    dlg.style.display = 'block';
    try{ dlg.showModal(); }
    catch(_){ dlg.setAttribute('open',''); }
  }

  async function loadPartnersCache(){
    try{
      if(window.__CACHE__ && Array.isArray(window.__CACHE__.partners)) return window.__CACHE__.partners;
      const partners = await dbGetAll('partners');
      window.__CACHE__ = window.__CACHE__ || {};
      window.__CACHE__.partners = partners;
      return partners;
    }catch(_){ return []; }
  }

  async function mergeContactsWithIds(ids){
    try{
      if(!Array.isArray(ids) || ids.length !== 2){
        if(typeof window.toast === 'function') window.toast('Select exactly two contacts to merge.');
        return;
      }
      await openDB();
      const [idA, idB] = ids.map(id => String(id));
      if(idA === idB){
        if(typeof window.toast === 'function') window.toast('Select two different contacts to merge.');
        return;
      }
      const [A,B] = await Promise.all([dbGet('contacts', idA), dbGet('contacts', idB)]);
      if(!A || !B){
        if(typeof window.toast === 'function') window.toast('Unable to load both contacts.');
        return;
      }
      const ordered = [cloneContact(A), cloneContact(B)];
      const baseIndex = planDefaultBase(ordered);
      if(baseIndex === 1){ ordered.reverse(); }
      await openMergeModal(ordered);
    }catch(err){
      console.error('mergeContactsWithIds failed', err);
      if(typeof window.toast === 'function') window.toast('Merge failed to start.');
    }
  }

  if(typeof window !== 'undefined'){
    window.__CONTACT_MERGE_TEST__ = {
      buildFieldDefs,
      cloneContact,
      planDefaultBase,
      determineDefaultSource,
      getFieldValue,
      setFieldValue,
      createState(contacts, overrides){
        const copies = Array.isArray(contacts) ? contacts.map(cloneContact) : [];
        const baseIndex = overrides && typeof overrides.baseIndex === 'number'
          ? overrides.baseIndex
          : planDefaultBase(copies);
        const state = {
          dialog: overrides?.dialog || { close(){}, removeAttribute(){}, style:{} },
          contacts: copies,
          baseIndex,
          selections: new Map(),
          manual: new Set(),
          errors: new Map(),
          cleanup: [],
          customValues: new Map(),
          rowCleanup: [],
          nodes: overrides?.nodes || { confirm: { disabled: false } },
          fields: buildFieldDefs(copies)
        };
        if(overrides?.selections){
          Object.entries(overrides.selections).forEach(([key, value]) => {
            if(!value) return;
            state.selections.set(key, typeof value === 'string' ? { source: value } : value);
          });
        }
        if(overrides?.manual){
          overrides.manual.forEach(key => state.manual.add(key));
        }
        return state;
      },
      compute(state){
        return computeSelection(state);
      },
      executeMerge
    };
  }

  window.mergeContactsWithIds = mergeContactsWithIds;
})();
