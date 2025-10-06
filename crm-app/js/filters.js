// filters.js — Phase 8 query-aware filtering
(function(){
  const DEFAULTS={
    inprog:{loanTypes:[],stages:[],q:'',query:[]},
    active:{loanTypes:[],stages:[],milestone:'',followupFrom:'',followupTo:'',q:'',query:[]},
    clients:{loanTypes:[],stages:[],partner:'',fundedFrom:'',fundedTo:'',q:'',query:[]},
    partners:{tiers:[],q:'',query:[]},
    longshots:{loanTypes:[],referredBy:'',lastFrom:'',lastTo:'',q:'',query:[]},
    statusLongshots:{loanTypes:[],referredBy:'',lastFrom:'',lastTo:'',q:'',query:[]}
  };
  const LOAN_OPTIONS=['Conventional','FHA','VA','Jumbo','USDA','Other'];
  const STAGE_OPTIONS=['Application','Processing','Underwriting','Approved','Cleared to Close','Funded'];
  const CLIENT_STAGE_OPTIONS=['Approved','Cleared to Close','Funded'];
  const TIER_OPTIONS=['Top','Solid Partner','Developing','Keep in Touch'];
  const QUERY_FIELDS={
    inprog:[
      {value:'name',label:'Name',type:'string',attr:'name'},
      {value:'stage',label:'Stage',type:'string',attr:'stage'},
      {value:'loan',label:'Loan Type',type:'string',attr:'loan'},
      {value:'amount',label:'Amount',type:'number',attr:'amount'},
      {value:'rate',label:'Rate (%)',type:'number',attr:'rate'},
      {value:'followup',label:'Next Follow-Up',type:'date',attr:'followup'},
      {value:'milestone',label:'Milestone',type:'string',attr:'milestone'},
      {value:'ref',label:'Referred By',type:'string',attr:'ref'},
      {value:'last',label:'Last Contact',type:'date',attr:'last'}
    ],
    active:[
      {value:'name',label:'Name',type:'string',attr:'name'},
      {value:'stage',label:'Stage',type:'string',attr:'stage'},
      {value:'loan',label:'Loan Type',type:'string',attr:'loan'},
      {value:'amount',label:'Amount',type:'number',attr:'amount'},
      {value:'followup',label:'Next Follow-Up',type:'date',attr:'followup'},
      {value:'milestone',label:'Milestone',type:'string',attr:'milestone'}
    ],
    clients:[
      {value:'name',label:'Name',type:'string',attr:'name'},
      {value:'stage',label:'Stage',type:'string',attr:'stage'},
      {value:'loan',label:'Loan Type',type:'string',attr:'loan'},
      {value:'amount',label:'Amount',type:'number',attr:'amount'},
      {value:'funded',label:'Funded Date',type:'date',attr:'funded'},
      {value:'ref',label:'Partner',type:'string',attr:'ref'}
    ],
    partners:[
      {value:'name',label:'Name',type:'string',attr:'name'},
      {value:'company',label:'Company',type:'string',attr:'company'},
      {value:'email',label:'Email',type:'string',attr:'email'},
      {value:'phone',label:'Phone',type:'string',attr:'phone'},
      {value:'tier',label:'Tier',type:'string',attr:'tier'}
    ],
    longshots:[
      {value:'name',label:'Name',type:'string',attr:'name'},
      {value:'loan',label:'Loan Type',type:'string',attr:'loan'},
      {value:'amount',label:'Amount',type:'number',attr:'amount'},
      {value:'ref',label:'Referred By',type:'string',attr:'ref'},
      {value:'last',label:'Last Activity',type:'date',attr:'last'}
    ],
    statusLongshots:[
      {value:'name',label:'Name',type:'string',attr:'name'},
      {value:'loan',label:'Loan Type',type:'string',attr:'loan'},
      {value:'amount',label:'Amount',type:'number',attr:'amount'},
      {value:'ref',label:'Referred By',type:'string',attr:'ref'},
      {value:'last',label:'Last Activity',type:'date',attr:'last'}
    ]
  };
  const SCOPE_LABELS={
    inprog:'In Progress',
    active:'Active Pipeline',
    clients:'Client Stages',
    partners:'Partners',
    longshots:'Long Shots',
    statusLongshots:'Long Shots & Nurture'
  };
  const OPS={
    string:[
      {value:'=',label:'Equals'},
      {value:'contains',label:'Contains'},
      {value:'>',label:'>'},
      {value:'<',label:'<'},
      {value:'>=',label:'>='},
      {value:'<=',label:'<='}
    ],
    number:[
      {value:'=',label:'='},
      {value:'>',label:'>'},
      {value:'<',label:'<'},
      {value:'>=',label:'>='},
      {value:'<=',label:'<='}
    ],
    date:[
      {value:'=',label:'='},
      {value:'>',label:'>'},
      {value:'<',label:'<'},
      {value:'>=',label:'>='},
      {value:'<=',label:'<='}
    ]
  };
  const SCOPES=Object.keys(DEFAULTS);
  const rawState=JSON.parse(sessionStorage.getItem('filterState')||'{}');
  const state={};
  SCOPES.forEach(scope=>{ state[scope]=sanitize(scope, rawState[scope]); });

  const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'};
  function escapeAttr(value){ return String(value==null?'':value).replace(/[&<>"']/g,ch=>ESC[ch]); }
  function lc(value){ return String(value==null?'':value).trim().toLowerCase(); }
  function normalizeDate(value){
    const raw=String(value==null?'':value).trim();
    if(!raw) return '';
    const stamp=Date.parse(raw);
    if(Number.isNaN(stamp)) return '';
    return new Date(stamp).toISOString().slice(0,10);
  }
  function withinRange(value, from, to){
    if(from && (!value || value<from)) return false;
    if(to && (!value || value>to)) return false;
    return true;
  }

  function renderOptionChips(options, selected, dataKey){
    const chosen=new Set((selected||[]).map(String));
    return options.map(opt=>{
      const value=String(opt);
      const isChecked=chosen.has(value);
      return `<label><input type="checkbox" data-filter="${dataKey}" value="${escapeAttr(value)}"${isChecked?' checked':''}> ${escapeAttr(value)}</label>`;
    }).join('');
  }

  function renderDateRange(idBase, fromValue, toValue){
    return `<div class="filter-range"><label>From<input type="date" id="${escapeAttr(idBase)}-from" value="${escapeAttr(fromValue||'')}"></label><label>To<input type="date" id="${escapeAttr(idBase)}-to" value="${escapeAttr(toValue||'')}"></label></div>`;
  }

  function formatList(values){
    return (values||[]).map(val=>escapeAttr(val)).join(', ');
  }

  function formatRangeLabel(from, to){
    const start = from ? escapeAttr(from) : '';
    const end = to ? escapeAttr(to) : '';
    if(start && end) return `${start} → ${end}`;
    if(start) return `≥ ${start}`;
    if(end) return `≤ ${end}`;
    return '';
  }

  function opsForField(field){
    if(!field) return OPS.string;
    return OPS[field.type] || OPS.string;
  }

  function fieldFor(scope,key){
    return (QUERY_FIELDS[scope]||[]).find(f=>f.value===key) || null;
  }

  function normalizeCondition(scope,cond){
    if(!cond || !cond.field) return null;
    const field=fieldFor(scope, cond.field);
    if(!field) return null;
    const ops=opsForField(field);
    const op = ops.some(o=>o.value===cond.op) ? cond.op : (ops[0]?.value || '=');
    const value = cond.value!=null ? String(cond.value) : '';
    return {field:field.value, op, value};
  }

  function sanitize(scope, source){
    const base = JSON.parse(JSON.stringify(DEFAULTS[scope]));
    const src = source || {};
    const dest = Object.assign({}, base);
    if(Array.isArray(src.loanTypes)) dest.loanTypes = src.loanTypes.map(String);
    if(Array.isArray(src.stages)) dest.stages = src.stages.map(String);
    if(Array.isArray(src.tiers)) dest.tiers = src.tiers.map(String);
    if(typeof src.q==='string') dest.q = src.q;
    if(typeof src.referredBy==='string') dest.referredBy = src.referredBy;
    if(typeof src.milestone==='string') dest.milestone = src.milestone;
    if(typeof src.partner==='string') dest.partner = src.partner;
    if(typeof src.followupFrom==='string') dest.followupFrom = src.followupFrom;
    if(typeof src.followupTo==='string') dest.followupTo = src.followupTo;
    if(typeof src.fundedFrom==='string') dest.fundedFrom = src.fundedFrom;
    if(typeof src.fundedTo==='string') dest.fundedTo = src.fundedTo;
    if(typeof src.lastFrom==='string') dest.lastFrom = src.lastFrom;
    if(typeof src.lastTo==='string') dest.lastTo = src.lastTo;
    dest.query = Array.isArray(src.query) ? src.query.map(c=>normalizeCondition(scope,c)).filter(Boolean) : [];
    return dest;
  }

  function saveSession(){
    const payload={};
    SCOPES.forEach(scope=> payload[scope]=state[scope]);
    sessionStorage.setItem('filterState', JSON.stringify(payload));
  }

  function getState(scope){
    return sanitize(scope, state[scope]);
  }

  function writeState(scope,next){
    state[scope]=sanitize(scope,next);
    saveSession();
    renderQueryUI(scope, state[scope]);
  }

  function setState(scope, patch){
    const merged = Object.assign({}, state[scope] || DEFAULTS[scope], patch||{});
    writeState(scope, merged);
  }

  function resetState(scope){
    writeState(scope, DEFAULTS[scope]);
  }

  function rowValue(scope, field, row){
    if(!field) return '';
    if(typeof field.get==='function') return field.get(row);
    const key = field.attr || field.value;
    if(row && row.dataset && key in row.dataset) return row.dataset[key];
    if(field.selector){
      const node = row.querySelector(field.selector);
      return node ? node.textContent : '';
    }
    return '';
  }

  function compareValues(field, op, rawRow, rawNeedle){
    if(field.type==='number'){
      const rowNum = Number(rawRow);
      const needle = Number(rawNeedle);
      if(!Number.isFinite(needle)) return true;
      if(!Number.isFinite(rowNum)) return false;
      switch(op){
        case '=': return rowNum===needle;
        case '>': return rowNum>needle;
        case '<': return rowNum<needle;
        case '>=': return rowNum>=needle;
        case '<=': return rowNum<=needle;
        default: return false;
      }
    }
    if(field.type==='date'){
      if(!rawNeedle) return true;
      const rowStamp = Date.parse(rawRow);
      const needleStamp = Date.parse(rawNeedle);
      if(Number.isNaN(needleStamp)) return true;
      if(Number.isNaN(rowStamp)) return false;
      const rowKey = new Date(rowStamp).toISOString().slice(0,10);
      const needleKey = new Date(needleStamp).toISOString().slice(0,10);
      switch(op){
        case '=': return rowKey===needleKey;
        case '>': return rowStamp>needleStamp;
        case '<': return rowStamp<needleStamp;
        case '>=': return rowStamp>=needleStamp;
        case '<=': return rowStamp<=needleStamp;
        default: return false;
      }
    }
    const rowTxt = String(rawRow||'').toLowerCase();
    const needle = String(rawNeedle||'').toLowerCase();
    if(!needle) return true;
    switch(op){
      case '=': return rowTxt===needle;
      case '>': return rowTxt>needle;
      case '<': return rowTxt<needle;
      case '>=': return rowTxt>=needle;
      case '<=': return rowTxt<=needle;
      case 'contains': return rowTxt.includes(needle);
      default: return false;
    }
  }

  function matchesQuery(scope, row, query){
    if(!Array.isArray(query) || !query.length) return true;
    return query.every(cond=>{
      if(!cond || !cond.field) return true;
      const field = fieldFor(scope, cond.field);
      if(!field) return true;
      return compareValues(field, cond.op||'=', rowValue(scope, field, row), cond.value||'');
    });
  }

  function predicate(scope){
    const s = getState(scope);
    const keyword = lc(s.q||'');
    const loanSet = new Set((s.loanTypes||[]).map(lc));
    const stageSet = new Set((s.stages||[]).map(lc));
    const tierSet = new Set((s.tiers||[]).map(lc));
    const milestoneNeedle = lc(s.milestone||'');
    const partnerNeedle = lc(s.partner||'');
    const refNeedle = lc(s.referredBy||'');
    const followFrom = normalizeDate(s.followupFrom);
    const followTo = normalizeDate(s.followupTo);
    const fundedFrom = normalizeDate(s.fundedFrom);
    const fundedTo = normalizeDate(s.fundedTo);
    const lastFrom = normalizeDate(s.lastFrom);
    const lastTo = normalizeDate(s.lastTo);
    return tr=>{
      if(!matchesQuery(scope, tr, s.query)) return false;
      if(keyword){
        const text = lc(tr.textContent||'');
        if(!text.includes(keyword)) return false;
      }
      switch(scope){
        case 'partners':{
          const tier = lc(tr.dataset?.tier||'');
          if(tierSet.size && !tierSet.has(tier)) return false;
          return true;
        }
        case 'longshots':
        case 'statusLongshots':{
          const loan = lc(tr.dataset?.loan||'');
          if(loanSet.size && !loanSet.has(loan)) return false;
          if(refNeedle && !lc(tr.dataset?.ref||'').includes(refNeedle)) return false;
          const last = tr.dataset?.last || '';
          if(!withinRange(last, lastFrom, lastTo)) return false;
          return true;
        }
        case 'active':{
          const stage = lc(tr.dataset?.stage||'');
          if(stageSet.size && !stageSet.has(stage)) return false;
          const loan = lc(tr.dataset?.loan||'');
          if(loanSet.size && !loanSet.has(loan)) return false;
          if(milestoneNeedle && !lc(tr.dataset?.milestone||'').includes(milestoneNeedle)) return false;
          const follow = tr.dataset?.followup || '';
          if(!withinRange(follow, followFrom, followTo)) return false;
          return true;
        }
        case 'clients':{
          const stage = lc(tr.dataset?.stage||'');
          if(stageSet.size && !stageSet.has(stage)) return false;
          const loan = lc(tr.dataset?.loan||'');
          if(loanSet.size && !loanSet.has(loan)) return false;
          if(partnerNeedle && !lc(tr.dataset?.ref||'').includes(partnerNeedle)) return false;
          const funded = tr.dataset?.funded || '';
          if(!withinRange(funded, fundedFrom, fundedTo)) return false;
          return true;
        }
        case 'inprog':
        default:{
          const stage = lc(tr.dataset?.stage||'');
          if(stageSet.size && !stageSet.has(stage)) return false;
          const loan = lc(tr.dataset?.loan||'');
          if(loanSet.size && !loanSet.has(loan)) return false;
          return true;
        }
      }
    };
  }

  function applyFilters(){
    [
      {scope:'inprog',sel:'#tbl-inprog tbody tr'},
      {scope:'active',sel:'#tbl-status-active tbody tr'},
      {scope:'clients',sel:'#tbl-status-clients tbody tr'},
      {scope:'statusLongshots',sel:'#tbl-status-longshots tbody tr'},
      {scope:'partners',sel:'#tbl-partners tbody tr'},
      {scope:'longshots',sel:'#tbl-longshots tbody tr'}
    ].forEach(({scope,sel})=>{
      const rows = $all(sel);
      if(!rows.length) return;
      const pred = predicate(scope);
      rows.forEach(r=>{ r.style.display = pred(r) ? '' : 'none'; });
    });
  }

  function renderFilterInputs(scope){
    const container=$('#filters-content'); if(!container) return;
    const state=getState(scope);
    const sections=[];
    const scopeLabel=SCOPE_LABELS[scope]||'Records';
    const keywordPlaceholder=scope==='partners' ? 'Search partners' : `Search ${scopeLabel.toLowerCase()}`;
    sections.push(`<div class="filter-section"><h4>Keyword Search</h4><input type="search" id="f-q" placeholder="${escapeAttr(keywordPlaceholder)}" value="${escapeAttr(state.q||'')}"></div>`);
    if(scope==='partners'){
      sections.push(`<div class="filter-section"><h4>Partner Tier</h4><div class="filter-options">${renderOptionChips(TIER_OPTIONS, state.tiers,'tier')}</div></div>`);
    } else {
      sections.push(`<div class="filter-section"><h4>Loan Programs</h4><div class="filter-options">${renderOptionChips(LOAN_OPTIONS, state.loanTypes,'loan')}</div></div>`);
      if(['inprog','active','clients'].includes(scope)){
        const stageOpts = scope==='clients' ? CLIENT_STAGE_OPTIONS : STAGE_OPTIONS;
        sections.push(`<div class="filter-section"><h4>Pipeline Stages</h4><div class="filter-options">${renderOptionChips(stageOpts, state.stages,'stage')}</div></div>`);
      }
      if(scope==='active'){
        sections.push(`<div class="filter-section"><h4>Milestone Contains</h4><input id="f-milestone" placeholder="Search milestone" value="${escapeAttr(state.milestone||'')}"></div>`);
        sections.push(`<div class="filter-section"><h4>Follow-Up Window</h4>${renderDateRange('f-followup', state.followupFrom, state.followupTo)}</div>`);
      }
      if(scope==='clients'){
        sections.push(`<div class="filter-section"><h4>Partner Contains</h4><input id="f-partner" placeholder="Search by partner" value="${escapeAttr(state.partner||'')}"></div>`);
        sections.push(`<div class="filter-section"><h4>Funded Window</h4>${renderDateRange('f-funded', state.fundedFrom, state.fundedTo)}</div>`);
      }
      if(scope==='longshots' || scope==='statusLongshots'){
        sections.push(`<div class="filter-section"><h4>Referred By</h4><input id="f-ref" placeholder="Search by referral source" value="${escapeAttr(state.referredBy||'')}"></div>`);
        sections.push(`<div class="filter-section"><h4>Last Activity</h4>${renderDateRange('f-last', state.lastFrom, state.lastTo)}</div>`);
      }
    }
    container.innerHTML=`<div class="filters-grid">${sections.join('')}</div>`;
    renderFilterSummary(scope);
    queueMicrotask(()=>{
      const search=container.querySelector('#f-q');
      if(search){
        try{ search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
        catch(_err){}
      }
    });
  }

  function renderFilterSummary(scope){
    const box=$('#filters-summary'); if(!box) return;
    const state=getState(scope);
    const chips=[];
    const label=SCOPE_LABELS[scope]||'Records';
    const addChip=(title,value)=>{ if(!value) return; chips.push(`<li class="filter-chip"><strong>${escapeAttr(title)}</strong><span>${value}</span></li>`); };
    if(state.q) addChip('Keyword', `“${escapeAttr(state.q)}”`);
    if((state.loanTypes||[]).length) addChip('Loan', formatList(state.loanTypes));
    if((state.stages||[]).length) addChip('Stage', formatList(state.stages));
    if((state.tiers||[]).length) addChip('Tier', formatList(state.tiers));
    if(state.milestone) addChip('Milestone', escapeAttr(state.milestone));
    if(state.partner) addChip('Partner', escapeAttr(state.partner));
    if(state.referredBy) addChip('Referred By', escapeAttr(state.referredBy));
    const followRange=formatRangeLabel(state.followupFrom, state.followupTo);
    if(followRange) addChip('Follow-Up', followRange);
    const fundedRange=formatRangeLabel(state.fundedFrom, state.fundedTo);
    if(fundedRange) addChip('Funded', fundedRange);
    const lastRange=formatRangeLabel(state.lastFrom, state.lastTo);
    if(lastRange) addChip('Last Activity', lastRange);
    if(Array.isArray(state.query) && state.query.length){
      addChip('Advanced Query', `${state.query.length} condition${state.query.length===1?'':'s'}`);
    }
    const header=`<h4>Active Filters — ${escapeAttr(label)}</h4>`;
    if(chips.length){
      box.innerHTML=`${header}<ul class="filter-chip-list">${chips.join('')}</ul>`;
    }else{
      box.innerHTML=`${header}<div class="filters-summary-empty">No filters applied.</div>`;
    }
  }

  async function loadSavedViews(){ await openDB(); const rec=await dbGet('settings','savedViews'); return rec&&Array.isArray(rec.views)? rec.views:[]; }
  async function persistSavedViews(v){ await openDB(); await dbPut('settings',{id:'savedViews',views:v,updatedAt:Date.now()}); toast('Saved queries updated'); }

  async function saveView(scope){ const name=prompt('Name this query'); if(!name) return; const views=await loadSavedViews(); const ex=views.find(v=>v.name===name&&v.scope===scope); const payload={name,scope,state:getState(scope),updatedAt:Date.now()}; if(ex){Object.assign(ex,payload);} else {views.push(payload);} await persistSavedViews(views); await refreshViewsUI(scope); }
  async function deleteView(scope){
    const sel=$('#views-'+scope);
    const name=sel?.value;
    if(!name) return;
    let confirmed = true;
    if(typeof window.confirmAction === 'function'){
      confirmed = await window.confirmAction({
        title:'Delete saved query',
        message:`Delete query "${name}"?`,
        confirmLabel:'Delete',
        cancelLabel:'Keep',
        destructive:true
      });
    }else if(typeof window.confirm === 'function'){
      confirmed = window.confirm('Delete query "'+name+'"?');
    }
    if(!confirmed) return;
    const views=await loadSavedViews();
    const next=views.filter(v=>!(v.scope===scope&&v.name===name));
    await persistSavedViews(next);
    await refreshViewsUI(scope);
  }
  async function applyView(scope,name){ const views=await loadSavedViews(); const v=views.find(v=>v.scope===scope&&v.name===name); if(!v) return toast('Saved query not found'); writeState(scope, v.state||{}); applyFilters(); }
  async function refreshViewsUI(scope){ const sel=$('#views-'+scope); if(!sel) return; const views=await loadSavedViews(); const names=views.filter(v=>v.scope===scope).map(v=>v.name).sort((a,b)=>a.localeCompare(b)); sel.innerHTML='<option value="">— saved queries —</option>'+names.map(n=>`<option>${n}</option>`).join(''); }

  function openFilters(scope){
    renderFilterInputs(scope);
    const d=$('#filters-modal'); if(!d) return;
    d.dataset.scope=scope;
    const labelNode=$('#filters-scope-label');
    if(labelNode) labelNode.textContent = SCOPE_LABELS[scope] || '';
    d.showModal();
  }
  function clearFilters(scope){ resetState(scope); renderFilterInputs(scope); }
  function applyFromModal(){
    const d=$('#filters-modal');
    const scope=d.dataset.scope;
    const s=getState(scope);
    const search=d.querySelector('#f-q');
    s.q = search ? search.value||'' : '';
    if(scope==='partners'){
      s.tiers = Array.from(d.querySelectorAll('input[data-filter="tier"]:checked')).map(cb=>cb.value);
    } else {
      s.loanTypes = Array.from(d.querySelectorAll('input[data-filter="loan"]:checked')).map(cb=>cb.value);
      if(['inprog','active','clients'].includes(scope)){
        s.stages = Array.from(d.querySelectorAll('input[data-filter="stage"]:checked')).map(cb=>cb.value);
      } else if('stages' in s){
        s.stages = [];
      }
      if(scope==='active'){
        s.milestone = d.querySelector('#f-milestone')?.value||'';
        s.followupFrom = d.querySelector('#f-followup-from')?.value||'';
        s.followupTo = d.querySelector('#f-followup-to')?.value||'';
      }else{
        if('milestone' in s) s.milestone='';
        if('followupFrom' in s) s.followupFrom='';
        if('followupTo' in s) s.followupTo='';
      }
      if(scope==='clients'){
        s.partner = d.querySelector('#f-partner')?.value||'';
        s.fundedFrom = d.querySelector('#f-funded-from')?.value||'';
        s.fundedTo = d.querySelector('#f-funded-to')?.value||'';
      }else{
        if('partner' in s) s.partner='';
        if('fundedFrom' in s) s.fundedFrom='';
        if('fundedTo' in s) s.fundedTo='';
      }
      if(scope==='longshots' || scope==='statusLongshots'){
        s.referredBy = d.querySelector('#f-ref')?.value||'';
        s.lastFrom = d.querySelector('#f-last-from')?.value||'';
        s.lastTo = d.querySelector('#f-last-to')?.value||'';
      }else{
        if('referredBy' in s) s.referredBy='';
        if('lastFrom' in s) s.lastFrom='';
        if('lastTo' in s) s.lastTo='';
      }
    }
    writeState(scope,s);
    applyFilters();
  }

  function ensureQueryHandlers(scope, host){
    if(!host || host.__wired) return;
    host.__wired=true;
    host.addEventListener('click',evt=>{
      if(evt.target?.hasAttribute('data-remove')){
        const row=evt.target.closest('.query-condition');
        if(!row) return;
        const idx=Number(row.dataset.index);
        const current=getState(scope);
        if(Array.isArray(current.query)){
          current.query.splice(idx,1);
          writeState(scope,current);
        }
        return;
      }
      const action=evt.target?.dataset?.action;
      if(!action) return;
      evt.preventDefault();
      if(action==='add') addCondition(scope);
      else if(action==='apply') applyFilters();
      else if(action==='clear'){
        const current=getState(scope); current.query=[]; writeState(scope,current); applyFilters();
      }
    });
    host.addEventListener('change',evt=>{
      const row=evt.target.closest('.query-condition'); if(!row) return;
      const idx=Number(row.dataset.index);
      const current=getState(scope);
      if(!Array.isArray(current.query) || !current.query[idx]) return;
      const cond=current.query[idx];
      if(evt.target.matches('[data-field]')){
        const field=fieldFor(scope, evt.target.value) || fieldFor(scope, cond.field) || (QUERY_FIELDS[scope]||[])[0];
        if(field){
          cond.field=field.value;
          const ops=opsForField(field);
          if(!ops.some(o=>o.value===cond.op)) cond.op=ops[0]?.value||'=';
        }
      } else if(evt.target.matches('[data-op]')){
        cond.op=evt.target.value;
      }
      current.query[idx]=cond;
      writeState(scope,current);
    });
    host.addEventListener('input',evt=>{
      if(!evt.target.matches('[data-value]')) return;
      const row=evt.target.closest('.query-condition'); if(!row) return;
      const idx=Number(row.dataset.index);
      const current=getState(scope);
      if(!Array.isArray(current.query) || !current.query[idx]) return;
      current.query[idx].value=evt.target.value;
      writeState(scope,current);
    });
  }

  function renderConditionRow(scope, cond, index){
    const fields=QUERY_FIELDS[scope]||[];
    const active=fieldFor(scope, cond.field)||fields[0];
    const ops=opsForField(active);
    const fieldOptions=fields.map(f=>`<option value="${f.value}"${f.value===(active?.value||'')?' selected':''}>${f.label}</option>`).join('');
    const opOptions=ops.map(o=>`<option value="${o.value}"${o.value===cond.op?' selected':''}>${o.label}</option>`).join('');
    const inputType=active?.type==='number'?'number':(active?.type==='date'?'date':'text');
    return `<div class="query-condition" data-index="${index}"><label>Field<select data-field>${fieldOptions}</select></label><label>Operator<select data-op>${opOptions}</select></label><label>Value<input type="${inputType}" data-value value="${escapeAttr(cond.value||'')}"></label><button type="button" class="query-remove-btn" data-remove aria-label="Remove condition">×</button></div>`;
  }

  function renderQueryUI(scope, currentState){
    const host=document.querySelector(`[data-query-scope="${scope}"]`);
    if(!host) return;
    ensureQueryHandlers(scope, host);
    const s=currentState || getState(scope);
    const conds=Array.isArray(s.query)? s.query:[];
    const rows=conds.length? conds.map((cond,idx)=>renderConditionRow(scope,cond,idx)).join('') : '<div class="query-empty muted">No query conditions. Add one to refine this list.</div>';
    host.innerHTML=`<div class="query-rows">${rows}</div><div class="query-toolbar"><button type="button" class="btn" data-action="add">Add Condition</button><span class="grow"></span><button type="button" class="btn good" data-action="apply">Apply</button><button type="button" class="btn" data-action="clear">Clear</button></div>`;
  }

  function addCondition(scope){
    const fields=QUERY_FIELDS[scope]||[];
    if(!fields.length) return;
    const base=fields[0];
    const ops=opsForField(base);
    const current=getState(scope);
    const next=Array.isArray(current.query)? current.query.slice():[];
    next.push({field:base.value, op:ops[0]?.value||'=', value:''});
    current.query=next;
    writeState(scope,current);
  }

  function wireControls(){
    [
      ['inprog','#btn-filters-inprog'],
      ['active','#btn-filters-active'],
      ['clients','#btn-filters-clients'],
      ['statusLongshots','#btn-filters-statusLongshots'],
      ['partners','#btn-filters-partners'],
      ['longshots','#btn-filters-longshots']
    ].forEach(([sc,sel])=>{
      const b=$(sel); if(b&&!b.__wired){ b.__wired=true; b.addEventListener('click', ()=> openFilters(sc)); }
    });
    [
      ['inprog','#btn-saveview-inprog'],
      ['active','#btn-saveview-active'],
      ['clients','#btn-saveview-clients'],
      ['statusLongshots','#btn-saveview-statusLongshots'],
      ['longshots','#btn-saveview-longshots']
    ].forEach(([sc,sel])=>{
      const b=$(sel); if(b&&!b.__wired){ b.__wired=true; b.addEventListener('click', ()=> saveView(sc)); }
    });
    [
      ['inprog','#btn-delview-inprog'],
      ['active','#btn-delview-active'],
      ['clients','#btn-delview-clients'],
      ['statusLongshots','#btn-delview-statusLongshots'],
      ['longshots','#btn-delview-longshots']
    ].forEach(([sc,sel])=>{
      const b=$(sel); if(b&&!b.__wired){ b.__wired=true; b.addEventListener('click', ()=> deleteView(sc)); }
    });
    [
      ['inprog','#views-inprog'],
      ['active','#views-active'],
      ['clients','#views-clients'],
      ['statusLongshots','#views-statusLongshots'],
      ['longshots','#views-longshots']
    ].forEach(([sc,sel])=>{
      const dd=$(sel); if(dd&&!dd.__wired){ dd.__wired=true; dd.addEventListener('change', e=>{ const name=e.target.value; if(name) applyView(sc,name); }); refreshViewsUI(sc); }
    });
  }

  function wireModal(){
    const dlg=$('#filters-modal'); if(!dlg||dlg.__wired) return; dlg.__wired=true;
    $('#btn-filters-apply').addEventListener('click', async ()=>{ applyFromModal(); dlg.close(); await renderAll(); });
    $('#btn-filters-clear').addEventListener('click', async ()=>{ const scope=dlg.dataset.scope; if(scope) clearFilters(scope); dlg.close(); await renderAll(); });
    $('#btn-filters-close').addEventListener('click', ()=> dlg.close());
  }

  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(()=>{
    wireControls();
    wireModal();
    SCOPES.forEach(scope=> renderQueryUI(scope, state[scope]));
    if(typeof window.registerRenderHook==='function'){
      window.registerRenderHook(()=>{ applyFilters(); });
    } else {
      const orig=window.renderAll; if(typeof orig==='function' && !orig.__filtersWrapped){ const wrap=async function(){ const res=await orig.apply(this,arguments); applyFilters(); return res; }; wrap.__filtersWrapped=true; window.renderAll=wrap; }
    }
    applyFilters();
  });

  window.applyFilters = applyFilters;
})();
