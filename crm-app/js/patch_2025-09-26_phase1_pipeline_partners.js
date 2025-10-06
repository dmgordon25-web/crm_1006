// patch_2025-09-26_phase1_pipeline_partners.js — Phase 1 pipeline lanes + partner core
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.patch_2025_09_26_phase1_pipeline_partners) return;
  window.__INIT_FLAGS__.patch_2025_09_26_phase1_pipeline_partners = true;
  if(Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes('/js/patch_2025-09-26_phase1_pipeline_partners.js')){
    window.__PATCHES_LOADED__.push('/js/patch_2025-09-26_phase1_pipeline_partners.js');
  }

  const STATUSES = ['New','Application','Pre-Approved','Processing','Underwriting','Approved','CTC','Funded'];
  const STATUS_TO_LANE = {
    'New': 'new',
    'Application': 'application',
    'Pre-Approved': 'preapproved',
    'Processing': 'processing',
    'Underwriting': 'underwriting',
    'Approved': 'approved',
    'CTC': 'cleared-to-close',
    'Funded': 'funded'
  };
  const STAGE_TO_LANE = {
    'lead': STATUS_TO_LANE['New'],
    'new': STATUS_TO_LANE['New'],
    'prospect': STATUS_TO_LANE['New'],
    'long-shot': STATUS_TO_LANE['New'],
    'application': STATUS_TO_LANE['Application'],
    'nurture': STATUS_TO_LANE['Application'],
    'preapproved': STATUS_TO_LANE['Pre-Approved'],
    'pre-app': STATUS_TO_LANE['Pre-Approved'],
    'processing': STATUS_TO_LANE['Processing'],
    'underwriting': STATUS_TO_LANE['Underwriting'],
    'approved': STATUS_TO_LANE['Approved'],
    'cleared-to-close': STATUS_TO_LANE['CTC'],
    'ctc': STATUS_TO_LANE['CTC'],
    'funded': STATUS_TO_LANE['Funded'],
    'post-close': STATUS_TO_LANE['Funded'],
    'closed': STATUS_TO_LANE['Funded'],
    'lost': STATUS_TO_LANE['Application'],
    'denied': STATUS_TO_LANE['Application']
  };
  const LANE_TO_STAGE = {
    [STATUS_TO_LANE['New']]: 'lead',
    [STATUS_TO_LANE['Application']]: 'application',
    [STATUS_TO_LANE['Pre-Approved']]: 'preapproved',
    [STATUS_TO_LANE['Processing']]: 'processing',
    [STATUS_TO_LANE['Underwriting']]: 'underwriting',
    [STATUS_TO_LANE['Approved']]: 'approved',
    [STATUS_TO_LANE['CTC']]: 'cleared-to-close',
    [STATUS_TO_LANE['Funded']]: 'funded'
  };
  const LANE_ORDER = STATUSES.map(label => STATUS_TO_LANE[label]);
  const LANE_LABELS = Object.fromEntries(STATUSES.map(label => [STATUS_TO_LANE[label], label]));
  const LOSS_REASONS = ['no-docs','rate','competitor','credit','withdrew','other'];
  const LOSS_REASON_LABELS = {
    'no-docs':'Missing Documents',
    'rate':'Rate / Terms',
    'competitor':'Went with Competitor',
    'credit':'Credit',
    'withdrew':'Client Withdrew',
    'other':'Other'
  };
  const PARTNER_NONE_ID = '00000000-0000-none-partner-000000000000';
  const DAY_MS = 86400000;
  const currencyFmt = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const cssEscape = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape.bind(window.CSS) : function(value){
    return String(value==null?'':value).replace(/[^a-zA-Z0-9_\-]/g, ch => '\\'+ch);
  };

  window.PARTNER_NONE_ID = PARTNER_NONE_ID;
  if(!window.NONE_PARTNER_ID) window.NONE_PARTNER_ID = PARTNER_NONE_ID;

  const state = {
    contacts: new Map(),
    partners: new Map(),
    lanes: new Map(),
    contactLane: new Map()
  };
  const pendingStageRecords = new Map();
  let refreshBusy = false;
  let queuedDetail = null;
  const PIPELINE_LANE_PREFIX = 'pipeline:';
  const PIPELINE_LANE_SET = new Set(LANE_ORDER);

  function fallbackCanonical(value){
    const raw = String(value==null?'':value).toLowerCase().trim();
    if(!raw) return raw;
    return raw.replace(/[\s_]+/g,'-').replace(/-+/g,'-');
  }
  function canonicalizeStage(value){
    if(window.PipelineStages && typeof window.PipelineStages.stageKeyFromLabel === 'function'){
      const mapped = window.PipelineStages.stageKeyFromLabel(value);
      if(mapped) return mapped;
    }
    const raw = String(value==null?'':value).trim().toLowerCase();
    if(!raw) return fallbackCanonical(value) || 'application';
    if(raw==='lead' || raw==='leads' || raw==='new-lead') return 'lead';
    if(raw==='pre-app' || raw==='preapp' || raw==='pre application' || raw==='pre-application') return 'preapproved';
    if(raw==='buyer-lead') return 'lead';
    return fallbackCanonical(value) || raw;
  }

  function laneKeyFromStage(stage){
    const canonical = canonicalizeStage(stage);
    if(Object.prototype.hasOwnProperty.call(STAGE_TO_LANE, canonical)){
      return STAGE_TO_LANE[canonical];
    }
    return STATUS_TO_LANE['Application'];
  }
  function stageForLane(lane){
    if(Object.prototype.hasOwnProperty.call(LANE_TO_STAGE, lane)){
      return LANE_TO_STAGE[lane];
    }
    return canonicalizeStage(lane || 'application');
  }

  function ensureStyle(){
    if(document.getElementById('phase1-pipeline-style')) return;
    const style = document.createElement('style');
    style.id = 'phase1-pipeline-style';
    style.textContent = `
    #kanban-area[data-phase1="true"]{padding-bottom:12px}
    #kanban-area[data-phase1="true"] .phase1-columns{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
    #kanban-area[data-phase1="true"] .phase1-lane{min-width:220px;display:flex;flex-direction:column;max-height:70vh}
    #kanban-area[data-phase1="true"] .phase1-lane [data-role="list"]{display:flex;flex-direction:column;gap:8px;padding:6px;overflow-y:auto}
    .kanban-card[data-card-id]{cursor:grab}
    .kanban-card[data-card-id].dragging{opacity:.6}
    .kanban-card.age-7{box-shadow:0 0 0 2px rgba(250,204,21,.45)}
    .kanban-card.age-14{box-shadow:0 0 0 2px rgba(249,115,22,.5)}
    .kanban-card.age-21{box-shadow:0 0 0 2px rgba(239,68,68,.55)}
    .kanban-card .kanban-age-pill{margin-left:auto;font-size:12px;border-radius:999px;background:#0f172a;color:#fff;padding:2px 8px}
    #referral-leaderboard{display:flex;flex-direction:column;gap:12px}
    #referral-leaderboard .leaderboard-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
    #referral-leaderboard .leaderboard-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
    #referral-leaderboard .leaderboard-item{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer}
    #referral-leaderboard .leaderboard-item:hover{background:#f8fafc}
    #referral-leaderboard .leaderboard-rank{font-weight:600;width:20px;text-align:center}
    #referral-leaderboard .leaderboard-name{flex:1 1 auto}
    #referral-leaderboard .leaderboard-count{width:56px;text-align:right;font-variant-numeric:tabular-nums}
    #referral-leaderboard .leaderboard-volume{width:120px;text-align:right;font-variant-numeric:tabular-nums}
    #partner-profile-modal::backdrop{background:rgba(15,23,42,.35)}
    #partner-profile-modal .profile-shell{min-width:420px;max-width:640px}
    #partner-profile-modal .profile-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
    #partner-profile-modal .profile-meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px}
    #partner-profile-modal .profile-meta div{display:flex;flex-direction:column;font-size:13px;color:#475569}
    #partner-profile-modal .profile-meta strong{color:#0f172a;font-size:18px}
    #partner-profile-modal .profile-actions{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
    #partner-profile-modal table{width:100%;border-collapse:collapse}
    #partner-profile-modal thead th{font-size:12px;text-transform:uppercase;color:#64748b;padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
    #partner-profile-modal tbody td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:13px}
    #partner-profile-modal tbody tr:hover{background:#f8fafc}
    #partner-delete-guard::backdrop{background:rgba(15,23,42,.3)}
    #partner-delete-guard .guard-shell{min-width:360px;max-width:480px}
    #partner-delete-guard .guard-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    #partner-delete-guard .guard-summary{font-size:13px;color:#475569;margin-bottom:12px}
    `;
    document.head.appendChild(style);
  }
  ensureStyle();

  function safe(value){
    return String(value==null?'':value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  async function ensurePartnerNone(){
    if(typeof openDB!=='function' || typeof dbGet!=='function' || typeof dbPut!=='function') return;
    await openDB();
    const existing = await dbGet('partners', PARTNER_NONE_ID);
    if(!existing){
      const now = Date.now();
      const rec = { id: PARTNER_NONE_ID, name:'None', tier:'Keep in Touch', createdAt:now, updatedAt:now };
      await dbPut('partners', rec);
    }
  }

  function stageEntryTimestamp(contact, lane){
    if(!contact) return null;
    const normalizedLane = typeof lane === 'string' ? lane : '';
    const key = normalizedLane === STATUS_TO_LANE['CTC']
      ? 'cleared-to-close'
      : normalizedLane === STATUS_TO_LANE['Pre-Approved']
        ? 'preapproved'
        : canonicalizeStage(contact.stage);
    const map = contact.stageEnteredAt || {};
    const raw = map[key];
    if(typeof raw === 'number') return raw;
    if(typeof raw === 'string'){ const ts = Date.parse(raw); if(!Number.isNaN(ts)) return ts; }
    return null;
  }

  function hydrateStageMap(value, stageKey, now){
    const map = {};
    if(value && typeof value === 'object' && !Array.isArray(value)){
      Object.keys(value).forEach(k => {
        const norm = canonicalizeStage(k);
        const raw = value[k];
        const ts = typeof raw === 'number' ? raw : Date.parse(raw);
        if(!Number.isNaN(ts)) map[norm] = ts;
      });
    }else if(value){
      const ts = typeof value === 'number' ? value : Date.parse(value);
      if(!Number.isNaN(ts)) map[stageKey] = ts;
    }
    if(!map[stageKey]) map[stageKey] = now;
    return map;
  }

  function hydrateContact(record){
    if(!record) return null;
    const now = Date.now();
    const id = String(record.id||'');
    const stageKey = canonicalizeStage(record.stage);
    const contact = Object.assign({}, record, {
      id,
      stage: stageKey,
      buyerPartnerId: record.buyerPartnerId ? String(record.buyerPartnerId) : PARTNER_NONE_ID,
      listingPartnerId: record.listingPartnerId ? String(record.listingPartnerId) : PARTNER_NONE_ID
    });
    contact.stageEnteredAt = hydrateStageMap(record.stageEnteredAt, stageKey, now);
    const order = Number(record.stageOrder);
    contact.stageOrder = Number.isFinite(order) ? order : null;
    if(record.stageChangedAt){
      const changed = Number(record.stageChangedAt);
      contact.stageChangedAt = Number.isFinite(changed) ? changed : contact.stageChangedAt;
    }
    if(contact.lossReason && stageKey!=='lost' && stageKey!=='denied') delete contact.lossReason;
    return contact;
  }

  function applyStageTransition(record, nextStage, prevStage, options){
    if(!record) return null;
    const canonical = canonicalizeStage(nextStage);
    const prior = prevStage != null ? canonicalizeStage(prevStage) : canonicalizeStage(record.stage);
    const now = options && Number.isFinite(options.now) ? options.now : Date.now();
    const result = Object.assign({}, record, {
      stage: canonical,
      stageEnteredAt: hydrateStageMap(record.stageEnteredAt, canonical, now),
      updatedAt: now,
      stageChangedAt: now
    });
    if(prior === canonical && record.stageEnteredAt && record.stageEnteredAt[canonical]){
      const ts = record.stageEnteredAt[canonical];
      result.stageEnteredAt[canonical] = typeof ts === 'number' ? ts : Date.parse(ts) || now;
    }
    const lossReason = options && options.lossReason;
    if(lossReason && (canonical === 'lost' || canonical === 'denied')){
      result.lossReason = lossReason;
    }else if(canonical!=='lost' && canonical!=='denied' && result.lossReason){
      delete result.lossReason;
    }
    return result;
  }

  function ensureLaneMaps(){
    if(!(state.lanes instanceof Map)) state.lanes = new Map();
    if(!(state.contactLane instanceof Map)) state.contactLane = new Map();
    LANE_ORDER.forEach(key => { if(!state.lanes.has(key)) state.lanes.set(key, []); });
  }

  function removeFromLane(lane, id){
    if(!lane) return;
    const list = state.lanes.get(lane);
    if(!Array.isArray(list)) return;
    const idx = list.indexOf(id);
    if(idx>=0) list.splice(idx,1);
  }

  function sortLane(lane){
    const list = state.lanes.get(lane);
    if(!Array.isArray(list)) return;
    list.sort((a,b)=>{
      const ca = state.contacts.get(a);
      const cb = state.contacts.get(b);
      const oa = ca && Number.isFinite(ca.stageOrder) ? Number(ca.stageOrder) : null;
      const ob = cb && Number.isFinite(cb.stageOrder) ? Number(cb.stageOrder) : null;
      if(oa!=null || ob!=null){
        if(oa==null) return 1;
        if(ob==null) return -1;
        if(oa!==ob) return oa - ob;
      }
      const ta = stageEntryTimestamp(ca, lane) || 0;
      const tb = stageEntryTimestamp(cb, lane) || 0;
      if(ta===tb) return (cb?.updatedAt||0) - (ca?.updatedAt||0);
      return ta - tb;
    });
  }

  function placeContactInLane(contact){
    if(!contact || !contact.id) return;
    ensureLaneMaps();
    const id = contact.id;
    const prevLane = state.contactLane.get(id);
    const nextLane = laneKeyFromStage(contact.stage);
    if(prevLane && prevLane!==nextLane) removeFromLane(prevLane, id);
    const laneList = state.lanes.get(nextLane) || [];
    if(!state.lanes.has(nextLane)) state.lanes.set(nextLane, laneList);
    if(!laneList.includes(id)) laneList.push(id);
    sortLane(nextLane);
    state.contactLane.set(id, nextLane);
    return {prevLane, nextLane};
  }

  function setContact(record){
    const hydrated = hydrateContact(record);
    if(!hydrated || !hydrated.id) return null;
    state.contacts.set(hydrated.id, hydrated);
    return placeContactInLane(hydrated);
  }

  function removeContact(id){
    const key = String(id);
    const lane = state.contactLane.get(key);
    if(lane){
      removeFromLane(lane, key);
      renderLane(lane);
    }
    state.contactLane.delete(key);
    state.contacts.delete(key);
    renderLeaderboard();
  }

  function removeLegacyControls(){
    const card = document.getElementById('kanban-card');
    if(!card) return;
    const controls = card.querySelector('.kanban-controls');
    if(controls) controls.remove();
    const refresh = card.querySelector('#kanban-refresh, #kb-reload');
    if(refresh){
      const container = refresh.closest('.kanban-controls');
      refresh.remove();
      if(container && container.childElementCount === 0) container.remove();
    }
    const toggle = card.querySelector('#show-clients-lane, #kb-show-clients');
    if(toggle){
      const wrap = toggle.closest('label, .switch');
      if(wrap){
        const parent = wrap.parentElement;
        wrap.remove();
        if(parent && parent.classList && parent.classList.contains('kanban-controls') && parent.childElementCount === 0){
          parent.remove();
        }
      }else{
        toggle.remove();
      }
    }
  }

  function ensureBoard(){
    const host = document.getElementById('kanban-area');
    if(!host) return null;
    removeLegacyControls();
    host.dataset.phase1 = 'true';
    let columns = host.querySelector('.phase1-columns');
    if(!columns){
      host.innerHTML = '';
      columns = document.createElement('div');
      columns.className = 'kanban-columns phase1-columns';
      host.appendChild(columns);
    }
    const existing = Array.from(columns.querySelectorAll('[data-stage]')).map(node=>node.getAttribute('data-stage'));
    existing.forEach(key=>{ if(!LANE_ORDER.includes(key)) columns.querySelector(`[data-stage="${key}"]`)?.remove(); });
    LANE_ORDER.forEach(key => {
      let lane = columns.querySelector(`section[data-stage="${key}"]`);
      if(!lane){
        lane = document.createElement('section');
        lane.className = 'kanban-column phase1-lane';
        lane.setAttribute('data-stage', key);
        const head = document.createElement('header');
        head.className = 'kanban-column-head';
        const title = document.createElement('div');
        title.className = 'kanban-column-title';
        title.textContent = LANE_LABELS[key] || key;
        const count = document.createElement('div');
        count.className = 'kanban-column-count';
        count.setAttribute('data-role','count');
        count.textContent = '0';
        head.appendChild(title);
        head.appendChild(count);
        const body = document.createElement('div');
        body.className = 'kanban-drop';
        body.setAttribute('data-role','list');
        body.setAttribute('data-stage', key);
        lane.appendChild(head);
        lane.appendChild(body);
        columns.appendChild(lane);
      }else{
        const title = lane.querySelector('.kanban-column-title');
        if(title) title.textContent = LANE_LABELS[key] || key;
        const list = lane.querySelector('[data-role="list"]');
        if(list) list.setAttribute('data-stage', key);
      }
    });
    wireBoard(host);
    return host;
  }

  function renderLane(lane){
    const host = ensureBoard();
    if(!host) return;
    const laneNode = host.querySelector(`section[data-stage="${lane}"]`);
    if(!laneNode) return;
    const list = laneNode.querySelector('[data-role="list"]');
    if(!list) return;
    const ids = state.lanes.get(lane) || [];
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    ids.forEach(id => {
      const contact = state.contacts.get(id);
      if(contact) frag.appendChild(buildCard(contact));
    });
    list.appendChild(frag);
    const countEl = laneNode.querySelector('[data-role="count"]');
    if(countEl) countEl.textContent = String(ids.length);
  }

  function partnerName(id){
    if(!id) return '';
    const partner = state.partners.get(String(id));
    return partner ? (partner.name || partner.company || 'Partner') : '';
  }

  function displayName(contact){
    const first = String(contact.first||'').trim();
    const last = String(contact.last||'').trim();
    if(first || last) return [first,last].filter(Boolean).join(' ');
    return contact.name || contact.company || contact.email || 'Unnamed';
  }

  function initials(contact){
    const name = displayName(contact);
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if(parts.length>=2) return (parts[0][0]||'').toUpperCase() + (parts[1][0]||'').toUpperCase();
    if(parts.length===1) return (parts[0][0]||'').toUpperCase();
    return '—';
  }

  function buildCard(contact){
    const lane = state.contactLane.get(contact.id) || laneKeyFromStage(contact.stage);
    const card = document.createElement('article');
    card.className = 'kanban-card';
    card.setAttribute('data-card-id', contact.id);
    card.setAttribute('draggable','true');
    card.dataset.stage = lane;
    const header = document.createElement('div');
    header.className = 'kanban-card-header';
    const avatar = document.createElement('div');
    avatar.className = 'kanban-card-avatar';
    avatar.textContent = initials(contact);
    const titleWrap = document.createElement('div');
    titleWrap.className = 'kanban-card-title';
    const nameEl = document.createElement('div');
    nameEl.className = 'kanban-card-name';
    nameEl.textContent = displayName(contact);
    const subEl = document.createElement('div');
    subEl.className = 'kanban-card-sub';
    const loanLabel = contact.loanType || contact.loanProgram || 'Loan';
    subEl.textContent = `${loanLabel} • ${currencyFmt.format(Number(contact.loanAmount||0))}`;
    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(subEl);
    header.appendChild(avatar);
    header.appendChild(titleWrap);

    const nowTs = Date.now();
    let stageStart = stageEntryTimestamp(contact, lane);
    if(contact.stageChangedAt != null){
      const raw = contact.stageChangedAt;
      const ts = typeof raw === 'number' ? raw : Date.parse(raw);
      if(!Number.isNaN(ts)) stageStart = ts;
    }
    if(!stageStart){
      const fallback = contact.updatedAt || contact.createdAt || nowTs;
      const ts = typeof fallback === 'number' ? fallback : Date.parse(fallback);
      stageStart = Number.isNaN(ts) ? nowTs : ts;
    }
    const diffDays = Math.max(0, Math.floor((nowTs - stageStart)/DAY_MS));
    if(diffDays>=21) card.classList.add('age-21');
    else if(diffDays>=14) card.classList.add('age-14');
    else if(diffDays>=7) card.classList.add('age-7');
    const badge = document.createElement('span');
    badge.className = 'kanban-age-pill';
    badge.textContent = `${diffDays}d`;
    badge.style.fontSize = '11px';
    badge.title = 'Days in status';
    header.appendChild(badge);
    card.dataset.ageDays = String(diffDays);

    card.appendChild(header);

    const metaRow = document.createElement('div');
    metaRow.className = 'kanban-card-meta';
    const chips = [];
    const buyer = partnerName(contact.buyerPartnerId);
    if(buyer && buyer.toLowerCase()!=='none') chips.push(`Buyer: ${buyer}`);
    const listing = partnerName(contact.listingPartnerId);
    if(listing && listing.toLowerCase()!=='none' && listing!==buyer) chips.push(`Listing: ${listing}`);
    if(contact.leadSource) chips.push(contact.leadSource);
    if(chips.length){
      metaRow.innerHTML = chips.map(text=>`<span class="kanban-chip">${safe(text)}</span>`).join('');
      card.appendChild(metaRow);
    }

    const foot = document.createElement('div');
    foot.className = 'kanban-card-foot';
    const nextTouch = contact.nextFollowUp || contact.nextTouch || '';
    if(nextTouch){
      const span = document.createElement('span');
      span.textContent = `Next: ${nextTouch}`;
      foot.appendChild(span);
    }
    if(contact.lossReason && (contact.stage==='lost' || contact.stage==='denied')){
      const span = document.createElement('span');
      span.textContent = `Reason: ${LOSS_REASON_LABELS[contact.lossReason] || contact.lossReason}`;
      span.dataset.lossReason = contact.lossReason;
      foot.appendChild(span);
      card.dataset.lossReason = contact.lossReason;
    }else{
      delete card.dataset.lossReason;
    }
    if(foot.children.length) card.appendChild(foot);

    const stageLabel = LANE_LABELS[lane] || lane;
    const reasonLabel = contact.lossReason ? ` • Reason: ${LOSS_REASON_LABELS[contact.lossReason] || contact.lossReason}` : '';
    card.title = `${displayName(contact)} • ${stageLabel}${reasonLabel}`;
    return card;
  }

  function emitChange(detail){
    const payload = Object.assign({source:'phase1:pipeline'}, detail||{});
    const stageHint = payload.stage || payload.to || payload.from || payload.lane;
    if(stageHint){
      const laneKey = laneKeyFromStage(stageHint);
      if(laneKey){
        payload.stage = canonicalizeStage(stageHint);
        payload.lane = laneKey;
        const partialSource = payload.partial;
        let partialObject;
        if(partialSource && typeof partialSource === 'object' && !Array.isArray(partialSource)){
          partialObject = Object.assign({}, partialSource);
        }else{
          partialObject = {};
        }
        partialObject.scope = partialObject.scope || 'pipeline';
        partialObject.lane = `${PIPELINE_LANE_PREFIX}${laneKey}`;
        payload.partial = partialObject;
      }else if(payload.partial === true){
        payload.partial = {scope:'pipeline'};
      }
    }
    if(typeof window.dispatchAppDataChanged === 'function') window.dispatchAppDataChanged(payload);
    else document.dispatchEvent(new CustomEvent('app:data:changed',{detail:payload}));
  }

  async function fullRefresh(){
    try{ await ensurePartnerNone(); }
    catch(err){ console && console.warn && console.warn('ensurePartnerNone', err); }
    if(typeof openDB!=='function' || typeof dbGetAll!=='function') return;
    await openDB();
    const [contactsRaw, partnersRaw] = await Promise.all([
      dbGetAll('contacts').catch(()=>[]),
      dbGetAll('partners').catch(()=>[])
    ]);
    state.partners = new Map();
    (partnersRaw||[]).forEach(partner => {
      if(partner && partner.id) state.partners.set(String(partner.id), Object.assign({}, partner));
    });
    if(!state.partners.has(PARTNER_NONE_ID)){
      state.partners.set(PARTNER_NONE_ID, {id:PARTNER_NONE_ID, name:'None'});
    }
    state.contacts = new Map();
    state.lanes = new Map();
    state.contactLane = new Map();
    ensureLaneMaps();
    (contactsRaw||[]).forEach(record => {
      if(!record || !record.id) return;
      setContact(record);
    });
    const host = ensureBoard();
    if(host){
      LANE_ORDER.forEach(renderLane);
    }
    renderLeaderboard();
  }

  async function loadContact(id){
    if(typeof openDB!=='function' || typeof dbGet!=='function') return null;
    await openDB();
    const record = await dbGet('contacts', id);
    return record || null;
  }

  function iterateActions(detail, cb){
    if(!detail || typeof cb !== 'function') return;
    if(detail.action) cb(detail);
    if(Array.isArray(detail.actions)){
      detail.actions.forEach(entry => { if(entry && entry.action) cb(entry); });
    }
  }

  async function handleDetail(detail){
    if(!detail){ await fullRefresh(); return; }
    let handled = false;
    const actions = [];
    iterateActions(detail, action => actions.push(action));
    for(const action of actions){
      const merged = Object.assign({}, detail, action);
      if(merged.action === 'soft-delete' && merged.entity === 'contacts' && merged.id){
        removeContact(String(merged.id));
        handled = true;
        break;
      }
      if(merged.action === 'restore' && merged.entity === 'contacts' && merged.id){
        const record = await loadContact(String(merged.id));
        if(record) integrateContact(record);
        handled = true;
        break;
      }
      if(merged.action === 'soft-delete' && merged.entity === 'partners'){
        await fullRefresh();
        handled = true;
        break;
      }
      if(merged.action === 'stage' && merged.contactId){
        const key = String(merged.contactId);
        const staged = pendingStageRecords.get(key);
        if(staged){
          pendingStageRecords.delete(key);
          integrateContact(staged);
        }else{
          const record = await loadContact(key);
          if(record) integrateContact(record);
        }
        handled = true;
        break;
      }
    }
    if(handled) return;
    if(detail.source && String(detail.source).startsWith('partner:')){ await fullRefresh(); return; }
    await fullRefresh();
  }

  async function processDetail(detail){
    if(refreshBusy){ queuedDetail = detail || queuedDetail; return; }
    refreshBusy = true;
    try{ await handleDetail(detail); }
    finally{
      refreshBusy = false;
      if(queuedDetail!==null){
        const next = queuedDetail;
        queuedDetail = null;
        processDetail(next);
      }
    }
  }

  function extractPartialLaneTokens(partial){
    const tokens = [];
    if(!partial) return tokens;
    if(typeof partial === 'string'){ tokens.push(partial); return tokens; }
    if(Array.isArray(partial)){ partial.forEach(value => { if(typeof value === 'string') tokens.push(value); }); return tokens; }
    if(typeof partial === 'object'){
      if(typeof partial.lane === 'string') tokens.push(partial.lane);
      if(Array.isArray(partial.lanes)) partial.lanes.forEach(value => { if(typeof value === 'string') tokens.push(value); });
    }
    return tokens;
  }

  function laneKeyFromToken(token){
    if(typeof token !== 'string') return null;
    const normalized = token.trim().toLowerCase();
    if(!normalized.startsWith(PIPELINE_LANE_PREFIX)) return null;
    const suffix = normalized.slice(PIPELINE_LANE_PREFIX.length);
    if(!suffix || suffix === '*' || suffix === 'all') return '*';
    return suffix;
  }

  function shouldProcessPipelineDetail(detail){
    if(!detail || !detail.partial) return true;
    const partial = detail.partial;
    const lanes = extractPartialLaneTokens(partial);
    if(lanes.length){
      return lanes.some(token => {
        const laneKey = laneKeyFromToken(token);
        if(laneKey === '*') return true;
        return laneKey ? PIPELINE_LANE_SET.has(laneKey) : false;
      });
    }
    const partialObject = (partial && typeof partial === 'object' && !Array.isArray(partial)) ? partial : null;
    const scopeRaw = typeof detail.scope === 'string' ? detail.scope : (partialObject && typeof partialObject.scope === 'string' ? partialObject.scope : '');
    const scope = String(scopeRaw||'').toLowerCase();
    if(scope && scope !== 'pipeline' && scope !== 'dashboard') return false;
    return true;
  }

  function integrateContact(record){
    if(!record || !record.id) return;
    const id = String(record.id);
    const prevLane = state.contactLane.get(id);
    const lanes = setContact(record) || {};
    const newLane = lanes.nextLane || state.contactLane.get(id);
    const toRender = new Set();
    if(prevLane) toRender.add(prevLane);
    if(newLane) toRender.add(newLane);
    toRender.forEach(renderLane);
    renderLeaderboard();
  }

  function findCardNode(id){
    if(!id) return null;
    return document.querySelector(`#kanban-area [data-card-id="${cssEscape(String(id))}"]`);
  }

  function readLaneOrderFromDom(list){
    if(!list) return [];
    return Array.from(list.querySelectorAll('[data-card-id]'))
      .map(node => node.getAttribute('data-card-id'))
      .filter(Boolean)
      .map(String);
  }

  function ensureCardPlacement(list, id, clientY){
    if(!list || !id) return;
    const card = findCardNode(id);
    if(!card) return;
    if(card.parentNode !== list){
      list.appendChild(card);
    }
    const siblings = Array.from(list.querySelectorAll('[data-card-id]')).filter(node => node !== card);
    if(!siblings.length) return;
    const pointer = typeof clientY === 'number' ? clientY : null;
    let beforeNode = null;
    if(pointer != null){
      beforeNode = siblings.find(node => {
        const rect = node.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        return pointer < mid;
      }) || null;
    }
    if(!beforeNode){
      const last = siblings[siblings.length-1];
      if(last && last !== card.nextSibling){
        list.appendChild(card);
      }
      return;
    }
    if(beforeNode !== card.nextSibling){
      list.insertBefore(card, beforeNode);
    }
  }

  function sameOrder(a, b){
    if(!Array.isArray(a) || !Array.isArray(b)) return false;
    if(a.length !== b.length) return false;
    for(let i=0;i<a.length;i++){
      if(String(a[i]) !== String(b[i])) return false;
    }
    return true;
  }

  function wireBoard(host){
    if(!host || host.__phase1Wired) return;
    host.__phase1Wired = true;
    let dragState = null;
    host.addEventListener('dragstart', evt => {
      const card = evt.target && evt.target.closest('[data-card-id]');
      if(!card) return;
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      dragState = {
        id: card.getAttribute('data-card-id'),
        source: card.closest('[data-stage]')?.getAttribute('data-stage') || state.contactLane.get(card.getAttribute('data-card-id'))
      };
      card.classList.add('dragging');
      if(evt.dataTransfer){
        evt.dataTransfer.effectAllowed = 'move';
        evt.dataTransfer.setData('text/plain', dragState.id||'');
      }
    }, true);
    host.addEventListener('dragend', evt => {
      const card = evt.target && evt.target.closest('[data-card-id]');
      if(card) card.classList.remove('dragging');
      dragState = null;
    }, true);
    host.addEventListener('dragover', evt => {
      const list = evt.target && evt.target.closest('[data-role="list"]');
      if(list){
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        if(evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
        const id = dragState && dragState.id;
        if(id) ensureCardPlacement(list, id, evt.clientY);
      }
    }, true);
    host.addEventListener('drop', async evt => {
      const targetLane = evt.target && evt.target.closest('[data-role="list"]');
      if(!targetLane) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      const laneKey = targetLane.getAttribute('data-stage');
      if(!laneKey) return;
      const id = dragState?.id || (evt.dataTransfer && evt.dataTransfer.getData('text/plain'));
      if(!id) return;
      await handleDrop(id, laneKey, dragState && dragState.source);
    }, true);
    host.addEventListener('click', evt => {
      const card = evt.target && evt.target.closest('[data-card-id]');
      if(!card) return;
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      const id = card.getAttribute('data-card-id');
      if(id && typeof window.renderContactModal === 'function') window.renderContactModal(id);
    }, true);
  }

  function laneOrderSnapshot(lane){
    if(!lane) return [];
    const list = document.querySelector(`#kanban-area [data-role="list"][data-stage="${cssEscape(lane)}"]`);
    return readLaneOrderFromDom(list);
  }

  async function persistKanbanDrop(context){
    const { id, nextLane, prevLane, nextStage, prevStage, targetOrder, sourceOrder, stageChanged, lossReason } = context;
    const safeId = String(id);
    const normalizedTarget = Array.isArray(targetOrder) ? targetOrder.map(String) : [];
    const normalizedSource = Array.isArray(sourceOrder) ? sourceOrder.map(String) : [];
    const laneOrders = new Map();
    if(normalizedTarget.length) laneOrders.set(nextLane, normalizedTarget);
    if(stageChanged && prevLane && prevLane !== nextLane){
      laneOrders.set(prevLane, normalizedSource);
    }
    if(typeof openDB !== 'function' || typeof indexedDB === 'undefined'){
      if(stageChanged && typeof window.updateContactStage === 'function'){
        const updated = await window.updateContactStage(safeId, nextStage, prevStage, { lossReason });
        const stageDetail = updated ? {
          action:'stage',
          id: safeId,
          contactId: safeId,
          from: prevStage!=null ? canonicalizeStage(prevStage) : undefined,
          to: canonicalizeStage(nextStage),
          stage: canonicalizeStage(nextStage)
        } : null;
        const detail = { source:'kanban-dnd', count: updated ? 1 : 0 };
        if(stageDetail) Object.assign(detail, stageDetail);
        return {
          records: updated ? new Map([[safeId, updated]]) : new Map(),
          laneOrders,
          stageChanged,
          stageDetail,
          automations: [],
          dispatchDetail: detail
        };
      }
      return {
        records: new Map(),
        laneOrders,
        stageChanged,
        stageDetail: null,
        automations: [],
        dispatchDetail: { source:'kanban-dnd', count: 0 }
      };
    }
    await openDB();
    const db = window.__APP_DB__ || await openDB();
    const tx = db.transaction(['contacts'], 'readwrite');
    const store = tx.objectStore('contacts');
    const wrap = (req) => new Promise((resolve, reject)=>{
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = (event)=> reject(event && event.target && event.target.error || req.error || event);
    });
    const orderLookup = new Map();
    laneOrders.forEach((ids, lane)=>{
      ids.forEach((cid, index)=>{
        const key = String(cid);
        let entry = orderLookup.get(key);
        if(!entry){ entry = {}; orderLookup.set(key, entry); }
        entry[lane] = index;
      });
    });
    const mutationIds = new Set();
    orderLookup.forEach((_, key)=> mutationIds.add(key));
    if(stageChanged) mutationIds.add(safeId);
    const changedRecords = new Map();
    const now = Date.now();
    for(const cid of mutationIds){
      let record = state.contacts.has(cid) ? Object.assign({}, state.contacts.get(cid)) : await wrap(store.get(cid));
      if(!record) continue;
      let changed = false;
      const positions = orderLookup.get(cid) || {};
      Object.keys(positions).forEach(lane => {
        const orderIndex = positions[lane];
        if(!Number.isFinite(orderIndex)) return;
        if(Number(record.stageOrder) !== orderIndex){
          record.stageOrder = orderIndex;
          record.updatedAt = now;
          changed = true;
        }
      });
      if(stageChanged && cid === safeId){
        const updated = applyStageTransition(record, nextStage, prevStage, { now, lossReason });
        if(updated){
          Object.assign(record, updated);
          changed = true;
        }
      }else if(!stageChanged && cid === safeId && positions[nextLane] != null){
        record.updatedAt = now;
        changed = true;
      }
      if(changed){
        await wrap(store.put(record));
        changedRecords.set(cid, record);
      }
    }
    await new Promise((resolve, reject)=>{
      tx.oncomplete = ()=> resolve();
      tx.onerror = event => reject(event && event.target && event.target.error || event);
      tx.onabort = event => reject(event && event.target && event.target.error || event);
    });
    let automations = [];
    if(stageChanged && typeof window.runStageAutomationsQuiet === 'function'){
      try{
        automations = await window.runStageAutomationsQuiet({ id: safeId, from: prevStage, to: nextStage });
      }catch(err){ console && console.warn && console.warn('stage automation bridge', err); }
    }
    const stageDetail = stageChanged ? {
      action:'stage',
      id: safeId,
      contactId: safeId,
      from: prevStage!=null ? canonicalizeStage(prevStage) : undefined,
      to: canonicalizeStage(nextStage),
      stage: canonicalizeStage(nextStage)
    } : null;
    const detail = { source:'kanban-dnd', count: Math.max(changedRecords.size, stageChanged ? 1 : 0) };
    if(stageDetail) Object.assign(detail, stageDetail);
    if(Array.isArray(automations) && automations.length){
      const extra = automations
        .map(entry => entry ? Object.assign({}, entry) : entry)
        .filter(Boolean);
      if(extra.length) detail.actions = extra;
    }
    return {
      records: changedRecords,
      laneOrders,
      stageChanged,
      stageDetail,
      automations: Array.isArray(automations) ? automations : [],
      dispatchDetail: detail
    };
  }

  function applyDropResult(context, result){
    if(!result) return;
    const { id, prevLane, nextLane, prevStage, nextStage, stageChanged } = context;
    const lanesToRender = new Set();
    if(result.laneOrders && result.laneOrders.size){
      result.laneOrders.forEach((ids, lane)=>{
        const normalized = Array.isArray(ids) ? ids.map(String) : [];
        state.lanes.set(lane, normalized.slice());
        normalized.forEach(cid => state.contactLane.set(cid, lane));
        lanesToRender.add(lane);
      });
    }
    if(stageChanged && prevLane && !lanesToRender.has(prevLane)){
      const existing = state.lanes.get(prevLane) || [];
      existing.forEach(cid => state.contactLane.set(cid, prevLane));
      lanesToRender.add(prevLane);
    }
    if(nextLane) state.contactLane.set(id, nextLane);
    if(result.records && result.records.size){
      result.records.forEach((record, cid)=>{
        const hydrated = hydrateContact(record);
        if(hydrated){
          state.contacts.set(cid, hydrated);
          if(stageChanged && cid === id){
            pendingStageRecords.set(cid, Object.assign({}, record));
          }
        }
      });
    }else if(stageChanged && id){
      const current = state.contacts.get(id);
      if(current) pendingStageRecords.set(id, current);
    }
    if(!lanesToRender.size){
      if(nextLane) lanesToRender.add(nextLane);
      if(stageChanged && prevLane) lanesToRender.add(prevLane);
    }
    lanesToRender.forEach(renderLane);
    renderLeaderboard();
    if(stageChanged){
      const fromStage = prevStage != null ? canonicalizeStage(prevStage) : undefined;
      const toStage = canonicalizeStage(nextStage);
      document.dispatchEvent(new CustomEvent('stage:changed',{detail:{id, from: fromStage, to: toStage, quiet:true}}));
    }
    if(result.dispatchDetail){
      if(typeof window.dispatchAppDataChanged === 'function') window.dispatchAppDataChanged(result.dispatchDetail);
      else document.dispatchEvent(new CustomEvent('app:data:changed',{detail:result.dispatchDetail}));
    }
    if(window.DEBUG){
      const fromStage = prevStage ? canonicalizeStage(prevStage) : '';
      const toStage = canonicalizeStage(nextStage);
      const detailCount = result.dispatchDetail ? Number(result.dispatchDetail.count||0) : 0;
      console.info(`[KANBAN] moved=${id} from=${fromStage} to=${toStage} reorder=${stageChanged?false:true} txMutations=${detailCount}`);
    }
  }

  async function handleDrop(id, laneKey, sourceLane){
    const contactId = String(id||'');
    if(!contactId || !laneKey) return;
    const contact = state.contacts.get(contactId) || null;
    const prevLane = sourceLane || state.contactLane.get(contactId) || (contact ? laneKeyFromStage(contact.stage) : null);
    const nextLane = laneKey;
    const nextStage = stageForLane(nextLane);
    const prevStage = contact ? contact.stage : null;
    const stageChanged = canonicalizeStage(prevStage) !== canonicalizeStage(nextStage);
    const list = document.querySelector(`#kanban-area [data-role="list"][data-stage="${cssEscape(nextLane)}"]`);
    if(!list) return;
    let targetOrder = readLaneOrderFromDom(list);
    const deduped = [];
    const seen = new Set();
    targetOrder.forEach(cid => {
      const key = String(cid);
      if(seen.has(key)) return;
      seen.add(key);
      deduped.push(key);
    });
    if(!seen.has(contactId)) deduped.push(contactId);
    targetOrder = deduped;
    const currentOrder = state.lanes.get(nextLane) || [];
    if(!stageChanged && prevLane === nextLane && sameOrder(currentOrder, targetOrder)) return;
    let sourceOrder = null;
    if(stageChanged && prevLane && prevLane !== nextLane){
      sourceOrder = laneOrderSnapshot(prevLane).filter(cid => String(cid) !== contactId);
    }
    let lossReason = contact && contact.lossReason;
    if(stageChanged && (nextStage === 'lost' || nextStage === 'denied')){
      const reason = await promptLossReason(contact, nextStage);
      if(!reason){
        if(prevLane) renderLane(prevLane);
        renderLane(nextLane);
        return;
      }
      lossReason = reason;
    }
    try{
      const result = await persistKanbanDrop({
        id: contactId,
        nextLane,
        prevLane,
        nextStage,
        prevStage,
        targetOrder,
        sourceOrder,
        stageChanged,
        lossReason
      });
      applyDropResult({ id: contactId, prevLane, nextLane, prevStage, nextStage, stageChanged }, result);
    }catch(err){
      console && console.warn && console.warn('stage update failed', err);
      if(typeof window.toast === 'function') window.toast('Stage update failed');
      if(prevLane) renderLane(prevLane);
      renderLane(nextLane);
    }
  }

  function promptLossReason(contact, stage){
    const dlg = ensureLossModal();
    const select = dlg.querySelector('select');
    const title = dlg.querySelector('[data-role="title"]');
    const error = dlg.querySelector('[data-role="error"]');
    if(title) title.textContent = stage==='denied' ? 'Why was this denied?' : 'Why was this lost?';
    if(select){
      select.innerHTML = '<option value="">Select reason</option>' + LOSS_REASONS.map(key=>`<option value="${key}">${LOSS_REASON_LABELS[key]}</option>`).join('');
      select.value = contact && contact.lossReason || '';
    }
    return new Promise(resolve => {
      function cleanup(value){
        dlg.close();
        dlg.removeEventListener('close', onCancel);
        dlg.querySelector('form').removeEventListener('submit', onSubmit);
        resolve(value);
      }
      function onCancel(){ cleanup(null); }
      function onSubmit(evt){
        evt.preventDefault();
        if(!select || !select.value){
          if(error) error.textContent = 'Select a reason to continue.';
          return;
        }
        cleanup(select.value);
      }
      dlg.addEventListener('close', onCancel, {once:true});
      dlg.querySelector('form').addEventListener('submit', onSubmit);
      const cancelBtn = dlg.querySelector('[data-action="cancel"]');
      if(cancelBtn){
        cancelBtn.onclick = ()=>{ cleanup(null); };
      }
      dlg.showModal();
      if(select) select.focus();
    });
  }

  function ensureLossModal(){
    let dlg = document.getElementById('loss-reason-modal');
    if(dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'loss-reason-modal';
    dlg.innerHTML = `
      <form method="dialog" class="modal-form-shell loss-modal">
        <div class="modal-header"><strong data-role="title">Reason</strong><button type="submit" data-action="cancel" class="btn">Cancel</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;padding-top:12px">
          <label>Loss Reason<select required></select></label>
          <div class="muted" data-role="error"></div>
        </div>
        <div class="modal-footer"><button class="btn brand" type="submit">Save</button></div>
      </form>`;
    document.body.appendChild(dlg);
    return dlg;
  }

  function ensureLeaderboard(){
    const host = document.getElementById('referral-leaderboard');
    if(host && !host.__phase1Leaderboard){
      host.__phase1Leaderboard = true;
      host.addEventListener('click', evt => {
        const row = evt.target && evt.target.closest('[data-partner]');
        if(!row) return;
        evt.preventDefault();
        evt.stopPropagation();
        const id = row.getAttribute('data-partner');
        if(id) openPartnerProfile(id);
      });
    }
    return host;
  }

  function renderLeaderboard(){
    const host = ensureLeaderboard();
    if(!host) return;
    const start = new Date(new Date().getFullYear(),0,1).getTime();
    const totals = new Map();
    state.contacts.forEach(contact => {
      if(!contact) return;
      const funded = contact.fundedDate ? Date.parse(contact.fundedDate) : NaN;
      if(Number.isNaN(funded) || funded < start) return;
      const amount = Number(contact.loanAmount||0);
      const ids = new Set();
      if(contact.buyerPartnerId) ids.add(String(contact.buyerPartnerId));
      if(contact.listingPartnerId) ids.add(String(contact.listingPartnerId));
      ids.forEach(id => {
        if(!id || id===PARTNER_NONE_ID) return;
        const entry = totals.get(id) || {count:0, volume:0};
        entry.count += 1;
        entry.volume += amount;
        totals.set(id, entry);
      });
    });
    const rows = Array.from(totals.entries()).map(([id, stats])=>({id, stats})).sort((a,b)=>{
      if(b.stats.volume !== a.stats.volume) return b.stats.volume - a.stats.volume;
      return b.stats.count - a.stats.count;
    }).slice(0,5);
    if(!rows.length){
      host.innerHTML = '<div class="leaderboard-head"><strong>Referral Leaderboard</strong></div><div class="muted">No funded referrals yet.</div>';
      return;
    }
    host.innerHTML = '<div class="leaderboard-head"><strong>Referral Leaderboard</strong><span class="muted">Top partners by funded volume YTD</span></div>';
    const list = document.createElement('ol');
    list.className = 'leaderboard-list';
    rows.forEach((row, idx) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-item';
      li.setAttribute('data-partner', row.id);
      const partner = state.partners.get(row.id) || {};
      li.innerHTML = `<span class="leaderboard-rank">${idx+1}</span><span class="leaderboard-name">${safe(partner.name || partner.company || 'Partner')}</span><span class="leaderboard-count">${row.stats.count}</span><span class="leaderboard-volume">${currencyFmt.format(row.stats.volume)}</span>`;
      list.appendChild(li);
    });
    host.appendChild(list);
  }

  function ensurePartnerProfileModal(){
    let dlg = document.getElementById('partner-profile-modal');
    if(dlg && dlg.__phase1Ready) return dlg;
    if(!dlg){
      dlg = document.createElement('dialog');
      dlg.id = 'partner-profile-modal';
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = `
      <form method="dialog" class="modal-form-shell profile-shell">
        <div class="profile-header">
          <strong data-role="name">Partner</strong>
          <span class="muted" data-role="tier"></span>
          <span class="grow"></span>
          <button class="btn" data-action="close" type="submit">Close</button>
        </div>
        <div class="profile-meta">
          <div><span>YTD Referrals</span><strong data-role="ytd-referrals">0</strong></div>
          <div><span>YTD Funded Volume</span><strong data-role="ytd-volume">$0</strong></div>
        </div>
        <div class="profile-actions">
          <button class="btn" data-action="reassign" type="button">Reassign all to None</button>
          <button class="btn" data-action="edit" type="button">Edit Partner</button>
          <button class="btn danger" data-action="delete" type="button">Delete Partner</button>
        </div>
        <table>
          <thead><tr><th>Contact</th><th>Stage</th><th>Amount</th><th>Funded</th></tr></thead>
          <tbody data-role="deals"></tbody>
        </table>
      </form>`;
    const form = dlg.querySelector('form');
    form.addEventListener('click', async evt => {
      const btn = evt.target && evt.target.closest('[data-action]');
      if(!btn) return;
      evt.preventDefault();
      const action = btn.getAttribute('data-action');
      const partnerId = dlg.dataset.partnerId;
      if(!partnerId) return;
      if(action==='edit'){
        if(typeof renderPartnerModalOriginal === 'function') renderPartnerModalOriginal(partnerId);
        else if(typeof requestPartnerModalOriginal === 'function') requestPartnerModalOriginal(partnerId);
      }else if(action==='reassign'){
        btn.disabled = true;
        try{
          const changed = await reassignContacts(partnerId, PARTNER_NONE_ID);
          if(typeof window.toast === 'function') window.toast(`Reassigned ${changed} deal${changed===1?'':'s'} to None`);
          await fullRefresh();
          await openPartnerProfile(partnerId);
        }finally{ btn.disabled = false; }
      }else if(action==='delete'){
        if(partnerId===PARTNER_NONE_ID){
          if(typeof window.toast === 'function') window.toast('Cannot delete the system "None" partner');
          return;
        }
        const confirmed = await showPartnerDeleteGuard(partnerId);
        if(!confirmed) return;
        try{
          if(typeof window.softDelete === 'function') await window.softDelete('partners', partnerId, {source:'profile'});
        }catch(err){ console && console.warn && console.warn('delete partner', err); }
      }
    });
    dlg.__phase1Ready = true;
    return dlg;
  }

  async function openPartnerProfile(partnerId){
    const dlg = ensurePartnerProfileModal();
    if(!partnerId){
      if(typeof renderPartnerModalOriginal === 'function') return renderPartnerModalOriginal();
      if(typeof requestPartnerModalOriginal === 'function') return requestPartnerModalOriginal();
      return;
    }
    if(!state.partners.size) await fullRefresh();
    let partner = state.partners.get(String(partnerId));
    if(!partner){
      if(typeof openDB==='function' && typeof dbGet==='function'){
        await openDB();
        partner = await dbGet('partners', partnerId) || null;
        if(partner){ state.partners.set(String(partner.id), partner); }
      }
    }
    if(!partner){
      if(typeof window.toast === 'function') window.toast('Partner not found');
      return;
    }
    dlg.dataset.partnerId = String(partnerId);
    renderPartnerProfile(dlg, partner);
    dlg.showModal();
  }
  window.openPartnerProfile = openPartnerProfile;

  function renderPartnerProfile(dlg, partner){
    if(!dlg) return;
    const nameEl = dlg.querySelector('[data-role="name"]');
    const tierEl = dlg.querySelector('[data-role="tier"]');
    if(nameEl) nameEl.textContent = partner.name || partner.company || 'Partner';
    if(tierEl) tierEl.textContent = partner.tier ? `Tier ${partner.tier}` : 'Tier —';
    const deals = [];
    state.contacts.forEach(contact => {
      if(!contact) return;
      const ids = new Set([contact.buyerPartnerId, contact.listingPartnerId].map(val=>String(val||'')));
      if(ids.has(String(partner.id))){ deals.push(contact); }
    });
    const tbody = dlg.querySelector('[data-role="deals"]');
    if(tbody){
      tbody.innerHTML = deals.length ? deals.map(contact => {
        const stageKey = laneKeyFromStage(contact.stage);
        return `<tr data-id="${safe(contact.id)}"><td>${safe(displayName(contact))}</td><td>${safe(LANE_LABELS[stageKey] || stageKey)}</td><td>${safe(currencyFmt.format(Number(contact.loanAmount||0)))}</td><td>${safe(contact.fundedDate || '—')}</td></tr>`;
      }).join('') : '<tr><td colspan="4" class="muted">No linked deals yet.</td></tr>';
    }
    if(tbody){
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        row.addEventListener('click', evt => {
          evt.preventDefault();
          evt.stopPropagation();
          const id = row.getAttribute('data-id');
          if(id && typeof window.renderContactModal === 'function') window.renderContactModal(id);
        }, {once:true});
      });
    }
    const start = new Date(new Date().getFullYear(),0,1).getTime();
    let count = 0;
    let volume = 0;
    deals.forEach(contact => {
      const funded = contact.fundedDate ? Date.parse(contact.fundedDate) : NaN;
      if(Number.isNaN(funded) || funded < start) return;
      count += 1;
      volume += Number(contact.loanAmount||0);
    });
    const countEl = dlg.querySelector('[data-role="ytd-referrals"]');
    const volumeEl = dlg.querySelector('[data-role="ytd-volume"]');
    if(countEl) countEl.textContent = String(count);
    if(volumeEl) volumeEl.textContent = currencyFmt.format(volume);
    const deleteBtn = dlg.querySelector('[data-action="delete"]');
    if(deleteBtn) deleteBtn.disabled = String(partner.id)===PARTNER_NONE_ID;
  }

  async function reassignContacts(fromId, toId){
    if(typeof openDB!=='function' || typeof dbGetAll!=='function' || typeof dbBulkPut!=='function') return 0;
    await openDB();
    const contacts = await dbGetAll('contacts') || [];
    const updates = [];
    contacts.forEach(contact => {
      if(!contact || !contact.id) return;
      let changed = false;
      if(String(contact.buyerPartnerId||'')===String(fromId)){ contact.buyerPartnerId = toId; changed = true; }
      if(String(contact.listingPartnerId||'')===String(fromId)){ contact.listingPartnerId = toId; changed = true; }
      if(changed){
        contact.updatedAt = Date.now();
        updates.push(contact);
      }
    });
    if(updates.length) await dbBulkPut('contacts', updates);
    if(updates.length) emitChange({source:'partner:reassign', partnerId:String(fromId), count:updates.length});
    return updates.length;
  }

  function ensureDeleteGuard(){
    let dlg = document.getElementById('partner-delete-guard');
    if(dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'partner-delete-guard';
    dlg.innerHTML = `
      <form method="dialog" class="modal-form-shell guard-shell">
        <div class="modal-header"><strong>Partner has linked deals</strong></div>
        <div class="guard-summary" data-role="summary"></div>
        <div class="guard-actions">
          <button class="btn" data-action="cancel" type="submit">Cancel</button>
          <button class="btn" data-action="confirm" type="button">Reassign to None & Delete</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function showPartnerDeleteGuard(partnerId){
    const dlg = ensureDeleteGuard();
    const summary = dlg.querySelector('[data-role="summary"]');
    let linked = 0;
    state.contacts.forEach(contact => {
      if(String(contact.buyerPartnerId||'')===String(partnerId) || String(contact.listingPartnerId||'')===String(partnerId)) linked += 1;
    });
    if(summary) summary.textContent = linked ? `${linked} linked deal${linked===1?'':'s'} will be reassigned to None before deleting.` : 'No linked deals detected.';
    return new Promise(resolve => {
      const confirmBtn = dlg.querySelector('[data-action="confirm"]');
      function cleanup(result){
        dlg.close();
        if(confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
        dlg.removeEventListener('close', onCancel);
        resolve(result);
      }
      async function onConfirm(){
        if(confirmBtn) confirmBtn.disabled = true;
        try{
          await reassignContacts(partnerId, PARTNER_NONE_ID);
          cleanup(true);
        }catch(err){
          console && console.warn && console.warn('reassign before delete', err);
          if(typeof window.toast === 'function') window.toast('Reassign failed');
          cleanup(false);
        }
      }
      function onCancel(){ cleanup(false); }
      if(confirmBtn) confirmBtn.addEventListener('click', onConfirm);
      dlg.addEventListener('close', onCancel, {once:true});
      dlg.showModal();
    });
  }

  async function guardPartnerDelete(targetId){
    const key = String(targetId||'');
    if(!key){ return { allowed:false, blocked:false }; }
    if(key===PARTNER_NONE_ID){
      if(typeof window.toast === 'function') window.toast('Cannot delete the system "None" partner');
      return { allowed:false, blocked:true };
    }
    const hasRefs = Array.from(state.contacts.values()).some(contact => String(contact.buyerPartnerId||'')===key || String(contact.listingPartnerId||'')===key);
    if(hasRefs){
      const confirmed = await showPartnerDeleteGuard(key);
      if(!confirmed) return { allowed:false, blocked:true };
    }
    return { allowed:true, blocked:false };
  }

  const requestPartnerModalOriginal = window.requestPartnerModal;
  const renderPartnerModalOriginal = window.renderPartnerModal;
  window.requestPartnerModal = function(partnerId){
    if(!partnerId){
      if(typeof requestPartnerModalOriginal === 'function') return requestPartnerModalOriginal.apply(this, arguments);
      if(typeof renderPartnerModalOriginal === 'function') return renderPartnerModalOriginal.apply(this, arguments);
      return;
    }
    return openPartnerProfile(partnerId);
  };

  const softDeleteOriginal = window.softDelete;
  const softDeleteManyOriginal = window.softDeleteMany;

  window.softDelete = async function(entity, id, opts){
    if(entity === 'partners'){
      const guard = await guardPartnerDelete(id);
      if(!guard.allowed) return {ok:false, blocked: guard.blocked};
    }
    if(typeof softDeleteOriginal === 'function') return softDeleteOriginal.apply(this, arguments);
    if(entity && typeof window.dbDelete === 'function'){
      try{ await window.dbDelete(entity, id); return {ok:true}; }
      catch(err){ console && console.warn && console.warn('softDelete fallback', err); return {ok:false}; }
    }
    return {ok:false};
  };

  if(typeof softDeleteManyOriginal === 'function'){
    window.softDeleteMany = async function(records, opts){
      const list = Array.isArray(records) ? records : [];
      for(const entry of list){
        if(entry && entry.store === 'partners'){
          const guard = await guardPartnerDelete(entry.id);
          if(!guard.allowed) return { ok:false, blocked: guard.blocked };
        }
      }
      return softDeleteManyOriginal.call(this, list, opts);
    };
  }else{
    window.softDeleteMany = async function(records, opts){
      const list = Array.isArray(records) ? records : [];
      if(!list.length) return { ok:false, count:0 };
      for(const entry of list){
        if(entry && entry.store === 'partners'){
          const guard = await guardPartnerDelete(entry.id);
          if(!guard.allowed) return { ok:false, blocked: guard.blocked };
        }
      }
      let removed = 0;
      for(const entry of list){
        const result = await window.softDelete(entry.store, entry.id, opts);
        if(result && result.ok) removed += 1;
      }
      return { ok: removed>0, count: removed };
    };
  }

  function normalizeContact(record){
    if(!record || typeof record!=='object') return record;
    const copy = Object.assign({}, record);
    copy.stage = canonicalizeStage(copy.stage);
    copy.buyerPartnerId = copy.buyerPartnerId ? String(copy.buyerPartnerId) : PARTNER_NONE_ID;
    copy.listingPartnerId = copy.listingPartnerId ? String(copy.listingPartnerId) : PARTNER_NONE_ID;
    if(copy.lossReason && copy.stage!=='lost' && copy.stage!=='denied') delete copy.lossReason;
    copy.stageEnteredAt = hydrateStageMap(copy.stageEnteredAt, copy.stage, Date.now());
    const order = Number(copy.stageOrder);
    copy.stageOrder = Number.isFinite(order) ? order : null;
    if(copy.stageChangedAt!=null){
      const changed = Number(copy.stageChangedAt);
      copy.stageChangedAt = Number.isFinite(changed) ? changed : undefined;
    }
    return copy;
  }

  const dbPutOriginal = window.dbPut;
  if(typeof dbPutOriginal === 'function'){
    window.dbPut = function(store, value){
      let next = value;
      if(store==='contacts' && next) next = normalizeContact(next);
      if(store==='partners' && next && next.id===PARTNER_NONE_ID){
        next = Object.assign({}, next, {name:'None'});
      }
      return dbPutOriginal.call(this, store, next);
    };
  }
  const dbBulkPutOriginal = window.dbBulkPut;
  if(typeof dbBulkPutOriginal === 'function'){
    window.dbBulkPut = function(store, list){
      if(store==='contacts' && Array.isArray(list)) list = list.map(item => normalizeContact(item));
      if(store==='partners' && Array.isArray(list)) list = list.map(item => (item && item.id===PARTNER_NONE_ID) ? Object.assign({}, item, {name:'None'}) : item);
      return dbBulkPutOriginal.apply(this, [store, list]);
    };
  }

  const updateContactStageOriginal = window.updateContactStage;
  window.updateContactStage = function(target, stage, previous, options){
    const opts = options && typeof options === 'object' ? options : null;
    const canonical = canonicalizeStage(stage);
    const prevStage = previous!=null ? canonicalizeStage(previous) : null;
    const now = Date.now();
    function apply(record){
      if(!record || typeof record!=='object') return record;
      const result = Object.assign({}, record);
      const prior = prevStage!=null ? prevStage : canonicalizeStage(result.stage);
      result.stage = canonical;
      result.stageEnteredAt = hydrateStageMap(result.stageEnteredAt, canonical, now);
      if(prior===canonical && record.stageEnteredAt && record.stageEnteredAt[canonical]){
        const ts = record.stageEnteredAt[canonical];
        result.stageEnteredAt[canonical] = typeof ts === 'number' ? ts : Date.parse(ts) || now;
      }
      if(opts && opts.lossReason && (canonical==='lost' || canonical==='denied')) result.lossReason = opts.lossReason;
      else if(canonical!=='lost' && canonical!=='denied' && result.lossReason) delete result.lossReason;
      result.updatedAt = now;
      return result;
    }
    if(target && typeof target === 'object'){
      const applied = apply(target);
      Object.assign(target, applied);
      return target;
    }
    const id = String(target);
    return (async ()=>{
      if(typeof openDB!=='function' || typeof dbGet!=='function' || typeof dbPut!=='function'){
        if(typeof updateContactStageOriginal === 'function') return updateContactStageOriginal.apply(this, arguments);
        return null;
      }
      await openDB();
      const existing = await dbGet('contacts', id);
      if(!existing) return null;
      const updated = apply(existing);
      await dbPut('contacts', updated);
      pendingStageRecords.set(id, updated);
      emitChange({action:'stage', contactId:id, stage:canonical});
      if(window.Toast && typeof window.Toast.show === 'function'){
        const stageMessage = canonical === 'processing' ? 'Moved to Processing' : 'Updated';
        window.Toast.show(stageMessage);
      }
      return updated;
    })();
  };

  document.addEventListener('app:data:changed', evt => {
    const detail = evt && evt.detail ? Object.assign({}, evt.detail) : null;
    if(detail && !shouldProcessPipelineDetail(detail)) return;
    Promise.resolve().then(()=> processDetail(detail));
  });

  if(typeof window.registerRenderHook === 'function') window.registerRenderHook(()=>{
    ensureBoard();
    LANE_ORDER.forEach(renderLane);
    renderLeaderboard();
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>fullRefresh());
  else fullRefresh();
})();
