// render.js — clean
import { STR, text as translate } from './ui/strings.js';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_KEYS,
  NORMALIZE_STAGE,
  stageKeyFromLabel,
  stageLabelFromKey,
} from './pipeline/stages.js';

(function(){
  const NONE_PARTNER_ID = '00000000-0000-none-partner-000000000000';
  const STAGES_PIPE = ['application','processing','underwriting'];
  const STAGES_CLIENT = ['approved','cleared-to-close','funded','post-close'];

  function asEl(ref){
    if(!ref) return null;
    if(typeof ref === 'string') return document.getElementById(ref) || null;
    return (ref instanceof Element) ? ref : null;
  }

  function setText(target, value){
    const el = asEl(target);
    if(!el){
      if(target) console.warn('render: missing node for', target);
      return;
    }
    el.textContent = value ?? '';
  }
  function html(el, v){ if(el) el.innerHTML = v; }
  function money(n){ try{ return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0)); }catch(_){ return '$'+(Number(n||0).toFixed(0)); } }
  function fullName(c){ return [c.first,c.last].filter(Boolean).join(' ') || c.name || '—'; }
  function safe(v){ return String(v==null?'':v).replace(/[&<>]/g, (ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch])); }
  function attr(v){ return String(v==null?'':v).replace(/[&<>"']/g, (ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
  function initials(name){
    const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '—';
    const first = parts[0][0] || '';
    const last = parts.length>1 ? parts[parts.length-1][0] || '' : '';
    return (first+last).toUpperCase() || first.toUpperCase() || '—';
  }
  function toDate(value){
    if(!value) return null;
    const d = new Date(value);
    if(!Number.isNaN(d.getTime())) return d;
    if(typeof value==='string' && value.length===10){
      const alt = new Date(value+'T00:00:00');
      if(!Number.isNaN(alt.getTime())) return alt;
    }
    return null;
  }
  function daysAgo(date, ref){ if(!date) return null; const diff = Math.floor((ref.getTime()-date.getTime())/86400000); return diff; }
  const stageLabels = {
    'long shot':translate('stage.long-shot'),
    application:translate('stage.application'),
    processing:translate('stage.processing'),
    underwriting:translate('stage.underwriting'),
    approved:translate('stage.approved'),
    'cleared-to-close':translate('stage.cleared-to-close'),
    funded:translate('stage.funded'),
    'post-close':translate('stage.post-close'),
    nurture:translate('stage.nurture'),
    lost:translate('stage.lost'),
    denied:translate('stage.denied')
  };
  const stageColors = {
    application:'#6366f1',
    processing:'#f97316',
    underwriting:'#f59e0b',
    approved:'#10b981',
    'cleared-to-close':'#0ea5e9',
    funded:'#0f172a',
    'post-close':'#0284c7',
    nurture:'#0ea5e9',
    lost:'#ef4444',
    denied:'#ef4444',
    'long shot':'#94a3b8'
  };
  const tierColors = {
    core:'#0f766e',
    preferred:'#047857',
    strategic:'#5b21b6',
    developing:'#92400e',
    partner:'#4f46e5'
  };
  const $ = (sel, root=document) => root.querySelector(sel);
  const $all = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  window.__OLD_KANBAN_OFF__ = true;

  const KANBAN_STAGE_LABELS = PIPELINE_STAGES.slice();
  const KANBAN_STAGE_KEYS = PIPELINE_STAGE_KEYS.slice();
  const KANBAN_STAGE_LABEL_SET = new Set(KANBAN_STAGE_LABELS.map(label => label.toLowerCase()));
  const KANBAN_STAGE_KEY_SET = new Set(KANBAN_STAGE_KEYS);
  const KANBAN_STAGE_KEY_TO_LABEL = new Map(
    KANBAN_STAGE_KEYS.map((key, index) => [key, KANBAN_STAGE_LABELS[index]])
  );

  function canonicalKanbanStage(value){
    if(value == null) return null;
    const raw = String(value).trim();
    if(!raw) return null;
    const lowered = raw.toLowerCase();
    if(KANBAN_STAGE_KEY_SET.has(lowered)){
      return stageLabelFromKey(lowered);
    }
    const direct = KANBAN_STAGE_LABELS.find(label => label.toLowerCase() === lowered);
    if(direct) return direct;
    const normalized = NORMALIZE_STAGE(raw);
    if(normalized && KANBAN_STAGE_LABEL_SET.has(normalized.toLowerCase())){
      return normalized;
    }
    const key = stageKeyFromLabel(raw);
    if(KANBAN_STAGE_KEY_SET.has(key)){
      return KANBAN_STAGE_KEY_TO_LABEL.get(key) || stageLabelFromKey(key);
    }
    return null;
  }

  function deriveLaneStage(node){
    if(!node) return null;
    const cues = [];
    if(node.dataset && node.dataset.stage) cues.push(node.dataset.stage);
    cues.push(node.getAttribute && node.getAttribute('data-stage'));
    cues.push(node.getAttribute && node.getAttribute('data-stage-label'));
    cues.push(node.dataset && node.dataset.stageLabel);
    cues.push(node.getAttribute && node.getAttribute('aria-label'));
    const header = node.querySelector ? node.querySelector('[data-role="title"], [data-role="header"], [data-role="stage"], .kanban-column-title, header h3, header h4, header strong, h3, h4, legend, summary') : null;
    if(header && typeof header.textContent === 'string') cues.push(header.textContent);
    if(typeof node.textContent === 'string' && node.classList && node.classList.contains('kanban-column-title')){
      cues.push(node.textContent);
    }
    for(const cue of cues){
      const stage = canonicalKanbanStage(cue);
      if(stage) return stage;
    }
    return null;
  }

  function ensureKanbanStageAttributes(){
    const root = document.querySelector('[data-kanban], #kanban-area, #kanban, .kanban-board');
    if(!root) return;
    const laneSelectors = '[data-stage],[data-lane],[data-column],.kanban-column,.kanban-lane';
    const laneNodes = Array.from(root.querySelectorAll(laneSelectors)).filter(node => {
      if(!(node instanceof Element)) return false;
      return !!node.querySelector('[data-role="list"],[data-list],.kanban-drop,.kanban-list,.lane-list,.cards');
    });
    laneNodes.forEach(lane => {
      let stage = canonicalKanbanStage(lane.dataset.stage);
      if(!stage) stage = deriveLaneStage(lane);
      if(!stage) return;
      const stageKey = stageKeyFromLabel(stage);
      if(lane.dataset.stage !== stage) lane.dataset.stage = stage;
      if(lane.dataset.stageKey !== stageKey) lane.dataset.stageKey = stageKey;
      if(lane.dataset.stageLabel !== stage) lane.dataset.stageLabel = stage;
      if(!lane.hasAttribute('data-stage')) lane.setAttribute('data-stage', stage);
      if(!lane.hasAttribute('data-stage-key')) lane.setAttribute('data-stage-key', stageKey);
      if(!lane.hasAttribute('data-stage-label')) lane.setAttribute('data-stage-label', stage);
      const list = lane.querySelector('[data-role="list"],[data-list],.kanban-drop,.kanban-list,.lane-list,.cards');
      if(list){
        if(list.dataset.stage !== stage) list.dataset.stage = stage;
        if(list.dataset.stageKey !== stageKey) list.dataset.stageKey = stageKey;
        if(list.dataset.stageLabel !== stage) list.dataset.stageLabel = stage;
        if(!list.hasAttribute('data-stage')) list.setAttribute('data-stage', stage);
        if(!list.hasAttribute('data-stage-key')) list.setAttribute('data-stage-key', stageKey);
        if(!list.hasAttribute('data-stage-label')) list.setAttribute('data-stage-label', stage);
      }
    });
    const cards = Array.from(root.querySelectorAll('[data-card-id],[data-id]'));
    cards.forEach(card => {
      if(!(card instanceof Element)) return;
      const id = card.getAttribute('data-id') || card.getAttribute('data-card-id');
      if(id && card.dataset.id !== String(id)) card.dataset.id = String(id);
    });
  }

  function colorForStage(key){
    const norm = String(key||'').toLowerCase();
    return stageColors[norm] || '#6366f1';
  }
  function colorForTier(label){
    const norm = String(label||'').toLowerCase();
    if(norm.includes('core')) return tierColors.core;
    if(norm.includes('preferred')) return tierColors.preferred;
    if(norm.includes('strategic')) return tierColors.strategic;
    if(norm.includes('develop')) return tierColors.developing;
    return tierColors.partner;
  }
  function shortDate(d){
    if(!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }

  function withLayoutGuard(moduleName, work){
    const debug = typeof window !== 'undefined' && window.__ENV__ && window.__ENV__.DEBUG === true;
    if(!debug) return work();
    let hadRead = false;
    let lastOp = null;
    let violations = 0;
    const markRead = () => {
      if(lastOp === 'write' && hadRead) violations += 1;
      lastOp = 'read';
      hadRead = true;
    };
    const markWrite = () => {
      lastOp = 'write';
    };
    const restorers = [];
    const wrapMethod = (obj, key, marker) => {
      if(!obj || typeof obj[key] !== 'function') return;
      const original = obj[key];
      obj[key] = function(){
        marker();
        return original.apply(this, arguments);
      };
      restorers.push(()=>{ obj[key] = original; });
    };
    const wrapDescriptor = (proto, key, onGet, onSet) => {
      if(!proto) return;
      let desc;
      try{ desc = Object.getOwnPropertyDescriptor(proto, key); }
      catch(_err){ return; }
      if(!desc || desc.configurable === false) return;
      const next = {
        configurable: true,
        enumerable: desc.enumerable
      };
      if(typeof desc.get === 'function'){
        next.get = function(){ if(onGet) onGet(); return desc.get.call(this); };
      }
      if(typeof desc.set === 'function'){
        next.set = function(value){ if(onSet) onSet(); return desc.set.call(this, value); };
      }
      try{
        Object.defineProperty(proto, key, next);
        restorers.push(()=>{ Object.defineProperty(proto, key, desc); });
      }catch(_err){}
    };
    wrapMethod(Element.prototype, 'getBoundingClientRect', markRead);
    if(typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'){
      const original = window.getComputedStyle;
      window.getComputedStyle = function(){
        markRead();
        return original.apply(window, arguments);
      };
      restorers.push(()=>{ window.getComputedStyle = original; });
    }
    ['appendChild','insertBefore','removeChild','replaceChild'].forEach(key => wrapMethod(Node.prototype, key, markWrite));
    if(typeof DOMTokenList !== 'undefined' && DOMTokenList.prototype){
      ['add','remove','toggle','replace'].forEach(key => wrapMethod(DOMTokenList.prototype, key, markWrite));
    }
    if(typeof CSSStyleDeclaration !== 'undefined' && CSSStyleDeclaration.prototype){
      ['setProperty','removeProperty'].forEach(key => wrapMethod(CSSStyleDeclaration.prototype, key, markWrite));
    }
    wrapDescriptor(Element.prototype, 'innerHTML', null, markWrite);
    wrapDescriptor(Element.prototype, 'outerHTML', null, markWrite);
    wrapDescriptor(Node.prototype, 'textContent', null, markWrite);
    if(typeof HTMLElement !== 'undefined' && HTMLElement.prototype){
      ['innerText','outerText','offsetWidth','offsetHeight','clientWidth','clientHeight','scrollTop','scrollLeft','scrollHeight','scrollWidth'].forEach(prop => {
        const onSet = (prop === 'scrollTop' || prop === 'scrollLeft') ? markWrite : null;
        wrapDescriptor(HTMLElement.prototype, prop, markRead, onSet);
      });
    }
    let finalized = false;
    const finalize = () => {
      if(finalized) return;
      finalized = true;
      while(restorers.length){
        const restore = restorers.pop();
        try{ restore(); }
        catch(_err){}
      }
      if(violations >= 5 && console && typeof console.info === 'function'){
        console.info(`[LAYOUT] possible thrash at ${moduleName} (x${violations})`);
      }
    };
    try{
      const result = work();
      if(result && typeof result.then === 'function'){
        return result.finally(finalize);
      }
      finalize();
      return result;
    }catch(err){
      finalize();
      throw err;
    }
  }

  function notify(message){
    if(typeof window.toast === 'function') window.toast(message);
    else console.log(message);
  }

  function normalizeKey(value){
    if(value == null) return '';
    const str = String(value).trim().toLowerCase();
    if(!str || str === '—' || str === '-') return '';
    return str.replace(/\s+/g, ' ');
  }

  function normalizeEmail(value){
    if(value == null) return '';
    const str = String(value).trim().toLowerCase();
    if(!str || str === '—') return '';
    return str;
  }

  function normalizePhone(value){
    if(value == null) return '';
    const digits = String(value).replace(/\D+/g, '');
    return digits.length ? digits : '';
  }

  function parseAmountNumber(value){
    if(value == null) return null;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    if(!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  const DEFAULT_STAGE_KEY = stageKeyFromLabel('Application');

  function normalizeStageKey(value){
    const raw = value == null ? '' : value;
    const stringValue = String(raw);
    try{
      if(typeof window.canonicalizeStage === 'function'){
        const canonical = window.canonicalizeStage(raw);
        if(canonical) return String(canonical);
      }
    }catch(_err){}
    if(!stringValue.trim()) return DEFAULT_STAGE_KEY;
    return stageKeyFromLabel(stringValue);
  }

  function uniqueAdd(map, key, id){
    if(!key) return;
    if(!map.has(key)){ map.set(key, id); return; }
    const existing = map.get(key);
    if(existing === id || existing === null) return;
    map.set(key, null);
  }

  function addToGroup(groups, key, meta){
    if(!key) return;
    const bucket = groups.get(key) || [];
    bucket.push(meta);
    groups.set(key, bucket);
  }

  function gatherEmails(record){
    const fields = ['email','workEmail','personalEmail','primaryEmail','secondaryEmail'];
    const list = [];
    const seen = new Set();
    fields.forEach(field => {
      const key = normalizeEmail(record && record[field]);
      if(key && !seen.has(key)){ seen.add(key); list.push(key); }
    });
    return list;
  }

  function gatherPhones(record){
    const fields = ['phone','mobile','cell','secondaryPhone','workPhone','homePhone','primaryPhone'];
    const list = [];
    const seen = new Set();
    fields.forEach(field => {
      const key = normalizePhone(record && record[field]);
      if(key && !seen.has(key)){ seen.add(key); list.push(key); }
    });
    return list;
  }

  function buildPartnerIndex(list){
    const index = {
      type:'partners',
      byId:new Map(),
      byEmail:new Map(),
      byPhone:new Map(),
      byName:new Map(),
      groupsByName:new Map(),
      byCompany:new Map(),
      groupsByCompany:new Map(),
      ordered:[],
      nameById:new Map()
    };
    (list||[]).forEach(partner => {
      if(!partner || partner.id == null) return;
      const id = String(partner.id);
      index.ordered.push(id);
      const meta = {
        id,
        record: partner,
        nameKey: normalizeKey(partner.name),
        companyKey: normalizeKey(partner.company),
        tier: normalizeKey(partner.tier),
        emails: gatherEmails(partner),
        phones: gatherPhones(partner)
      };
      index.byId.set(id, meta);
      index.nameById.set(id, partner.name || partner.company || '');
      meta.emails.forEach(key => uniqueAdd(index.byEmail, key, id));
      meta.phones.forEach(key => uniqueAdd(index.byPhone, key, id));

      [meta.nameKey, meta.companyKey].forEach(name => {
        if(!name) return;
        const existing = index.byName.get(name);
        if(existing === undefined) index.byName.set(name, id);
        else if(existing !== id) index.byName.set(name, null);
        addToGroup(index.groupsByName, name, meta);
      });

      if(meta.companyKey){
        uniqueAdd(index.byCompany, meta.companyKey, id);
        addToGroup(index.groupsByCompany, meta.companyKey, meta);
      }
    });
    index.ordered.sort((a,b)=> a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
    return index;
  }

  function buildContactIndex(list, partnerNameMap){
    const index = {
      type:'contacts',
      byId:new Map(),
      byEmail:new Map(),
      byPhone:new Map(),
      byName:new Map(),
      groupsByName:new Map(),
      ordered:[]
    };
    (list||[]).forEach(contact => {
      if(!contact || contact.id == null) return;
      const id = String(contact.id);
      index.ordered.push(id);
      const nameParts = [normalizeKey(contact.name), normalizeKey([contact.first, contact.last].filter(Boolean).join(' '))];
      const meta = {
        id,
        record: contact,
        stage: normalizeStageKey(contact.stage || 'application'),
        loan: normalizeKey(contact.loanType || contact.loanProgram),
        amount: Number(contact.loanAmount || 0) || 0,
        referredBy: normalizeKey(contact.referredBy),
        partnerNames: new Set(),
        emails: gatherEmails(contact),
        phones: gatherPhones(contact)
      };
      [contact.buyerPartnerId, contact.listingPartnerId, contact.partnerId].forEach(pid => {
        if(pid == null) return;
        const label = partnerNameMap.get(String(pid)) || '';
        const key = normalizeKey(label);
        if(key) meta.partnerNames.add(key);
      });
      const referralKey = normalizeKey(contact.referredBy);
      if(referralKey) meta.partnerNames.add(referralKey);
      index.byId.set(id, meta);
      meta.emails.forEach(key => uniqueAdd(index.byEmail, key, id));
      meta.phones.forEach(key => uniqueAdd(index.byPhone, key, id));
      const seenNames = new Set();
      nameParts.concat([normalizeKey(contact.company)]).forEach(name => {
        if(!name || seenNames.has(name)) return;
        seenNames.add(name);
        const existing = index.byName.get(name);
        if(existing === undefined) index.byName.set(name, id);
        else if(existing !== id) index.byName.set(name, null);
        addToGroup(index.groupsByName, name, meta);
      });
    });
    index.ordered.sort((a,b)=> a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
    return index;
  }

  function widgetEventsForSource(source){
    const store = window.__WIDGET_DATA__ || {};
    const mapTaskEvent = (task, label)=>{
      if(!task) return null;
      const date = task.dueDate instanceof Date ? task.dueDate : toDate(task.dueDate);
      if(!date) return null;
      const title = task.title || task.raw?.title || task.raw?.text || 'Task';
      const contactName = task.name && task.name !== 'General Task' ? task.name : '';
      const summary = contactName ? `${contactName} — ${title}` : title;
      const descParts = [];
      if(label) descParts.push(label);
      if(task.stage) descParts.push(task.stage);
      if(task.dueLabel) descParts.push(`Due ${task.dueLabel}`);
      return { date, summary, description: descParts.filter(Boolean).join(' • ') };
    };
    switch(source){
      case 'rel-opps':
        return (store.relOpportunities||[]).map(({contact})=>{
          if(!contact) return null;
          const date = toDate(contact.nextFollowUp || contact.lastContact);
          if(!date) return null;
          const stage = stageLabels[String(contact.stage||'').toLowerCase()] || (contact.stage||STR['stage.pipeline']);
          const parts = [stage];
          if(contact.loanType) parts.push(contact.loanType);
          if(contact.loanAmount) parts.push(`Amount: ${money(contact.loanAmount)}`);
          return { date, summary: `Follow up — ${fullName(contact)}`, description: parts.filter(Boolean).join(' • ') };
        }).filter(Boolean);
      case 'nurture':
        return (store.nurtureCandidates||[]).map(({contact})=>{
          if(!contact) return null;
          const date = toDate(contact.nextFollowUp || contact.anniversary || contact.fundedDate);
          if(!date) return null;
          const parts = [];
          const stage = stageLabels[String(contact.stage||'').toLowerCase()] || (contact.stage||STR['kanban.placeholder.client']);
          parts.push(stage);
          if(contact.fundedDate) parts.push(`Funded: ${contact.fundedDate}`);
          return { date, summary: `Nurture — ${fullName(contact)}`, description: parts.filter(Boolean).join(' • ') };
        }).filter(Boolean);
      case 'closing-watch':
        return (store.closingCandidates||[]).map(item=>{
          if(!item || !item.contact) return null;
          const date = item.date instanceof Date ? item.date : toDate(item.date);
          if(!date) return null;
          const contact = item.contact;
          const stage = stageLabels[String(contact.stage||'').toLowerCase()] || (contact.stage||'');
          const parts = [stage];
          if(contact.loanAmount) parts.push(`Amount: ${money(contact.loanAmount)}`);
          return { date, summary: `Closing — ${fullName(contact)}`, description: parts.filter(Boolean).join(' • ') };
        }).filter(Boolean);
      case 'pipeline-calendar':
        return (store.pipelineEvents||[]).map(ev=>{
          if(!ev) return null;
          const date = ev.date instanceof Date ? ev.date : toDate(ev.date);
          if(!date) return null;
          const descParts = [];
          if(ev.meta) descParts.push(ev.meta);
          if(ev.typeLabel) descParts.push(ev.typeLabel);
          return { date, summary: ev.label || 'Pipeline Event', description: descParts.filter(Boolean).join(' • ') };
        }).filter(Boolean);
      case 'priority-actions':
        return (store.attention||[]).map(task=> mapTaskEvent(task, 'Priority Task')).filter(Boolean);
      case 'milestones':
        return (store.timeline||[]).map(task=> mapTaskEvent(task, 'Upcoming Milestone')).filter(Boolean);
      default:
        return [];
    }
  }

  async function exportWidgetIcs(source){
    try{
      const events = widgetEventsForSource(source);
      if(!events.length){ notify('No dated records to export'); return; }
      if(typeof window.exportCustomEventsToIcs !== 'function'){ notify('ICS export unavailable'); return; }
      await window.exportCustomEventsToIcs(events, `crm-${source}.ics`);
      notify('ICS file generated');
    }catch(err){
      console.warn('widget ics', err);
      notify('ICS export failed');
    }
  }

  function ensureWidgetClickHandlers(){
    ['rel-opps','nurture','closing-watch','needs-attn','upcoming'].forEach(id=>{
      const list = asEl(id);
      if(list && !list.__wired){
        list.__wired = true;
        list.addEventListener('click', evt=>{
          if(evt.target.closest('[data-ics-source]')) return;
          const item = evt.target.closest('li[data-id]');
          if(!item) return;
          evt.preventDefault();
          const id = item.dataset.id;
          if(id && typeof window.renderContactModal === 'function') window.renderContactModal(id);
        });
      }
    });
  }

  document.addEventListener('click', evt=>{
    const btn = evt.target.closest('[data-ics-source]');
    if(!btn) return;
    const source = btn.dataset.icsSource;
    if(!source) return;
    evt.preventDefault();
    exportWidgetIcs(source);
  });

  function renderPartnersTable(partners){
    const tbPartners = $('#tbl-partners tbody');
    if(!tbPartners) return;
    tbPartners.innerHTML = (partners||[]).map(p => {
      const pid = attr(p.id||'');
      const name = p.name || '—';
      const company = p.company || '';
      const email = p.email || '';
      const phone = p.phone || '';
      const tier = p.tier || 'Developing';
      const emailKey = attr(String(email||'').toLowerCase());
      const nameKey = attr(String(name||'').toLowerCase());
      const companyKey = attr(String(company||'').toLowerCase());
      const phoneKey = attr(String(phone||'').toLowerCase());
      const tierKey = attr(String(tier||'').toLowerCase());
      return `<tr data-id="${pid}" data-partner-id="${pid}" data-email="${emailKey}" data-name="${nameKey}" data-company="${companyKey}" data-phone="${phoneKey}" data-tier="${tierKey}">
        <td><input data-role="select" type="checkbox" data-id="${pid}" data-partner-id="${pid}"></td>
        <td class="cell-edit" data-partner-id="${pid}"><a href="#" class="link partner-name" data-partner-id="${pid}">${safe(name)}</a></td>
        <td>${safe(company)}</td><td>${safe(email)}</td><td>${safe(phone)}</td><td>${safe(tier)}</td></tr>`;
    }).join('');
    $all('#tbl-partners tbody tr').forEach(tr => {
      const name = tr.children[1]?.textContent?.trim().toLowerCase();
      if(name === 'none') tr.style.display = 'none';
    });
  }

  async function renderAll(){
    return withLayoutGuard('render.js', async () => {
    await openDB();
    const settingsPromise = (window.Settings && typeof window.Settings.get === 'function')
      ? window.Settings.get()
      : dbGetAll('settings');
    const [contacts, partners, tasks, rawSettings, documents] = await Promise.all([
      dbGetAll('contacts'),
      dbGetAll('partners'),
      dbGetAll('tasks'),
      settingsPromise,
      dbGetAll('documents')
    ]);
    const partnerNameMap = new Map((partners||[]).map(p=>[String(p.id), p.name || p.company || '']));
    const partnerIndex = buildPartnerIndex(partners||[]);
    const contactIndex = buildContactIndex(contacts||[], partnerNameMap);
    window.__RECORD_INDEX__ = { contacts: contactIndex, partners: partnerIndex };
    const nameLookup = {};
    contactIndex.byName.forEach((val, key)=>{ if(typeof val === 'string' && val) nameLookup[key] = val; });
    partnerIndex.byName.forEach((val, key)=>{ if(typeof val === 'string' && val) nameLookup[key] = val; });
    window.__NAME_ID_MAP__ = nameLookup;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const contactById = new Map((contacts||[]).map(c=>[String(c.id), c]));

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth()+1, 1);
    const fundedThisMonth = (contacts||[]).filter(c=>{
      const fundedDate = toDate(c.fundedDate);
      return fundedDate && fundedDate >= startOfMonth && fundedDate < nextMonth;
    });
    const fundedCount = fundedThisMonth.length;
    const fundedVolume = fundedThisMonth.reduce((sum,c)=> sum + (Number(c.loanAmount||0)||0), 0);
    let goalRec = {};
    if(rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)){
      goalRec = rawSettings.goals || {};
    }else{
      const records = Array.isArray(rawSettings) ? rawSettings : [];
      goalRec = records.find(s => s && s.id === 'goals') || {};
    }
    const fundedGoal = Number(goalRec.monthlyFundedGoal||0);
    const volumeGoal = Number(goalRec.monthlyVolumeGoal||0);
    const hasFundedGoal = fundedGoal>0;
    const hasVolumeGoal = volumeGoal>0;
    const hasGoal = hasFundedGoal || hasVolumeGoal;
    const fundedPct = hasFundedGoal ? Math.min(100, Math.round((fundedCount/Math.max(fundedGoal,1))*100)) : (fundedCount>0 ? 100 : 0);
    const volumePct = hasVolumeGoal ? Math.min(100, Math.round((fundedVolume/Math.max(volumeGoal,1))*100)) : (fundedVolume>0 ? 100 : 0);
    const fundedLabel = asEl('goal-funded-label');
    if(fundedLabel){
      fundedLabel.textContent = hasFundedGoal ? `${fundedCount} of ${fundedGoal}` : `${fundedCount} funded this month`;
    }
    const volumeLabel = asEl('goal-volume-label');
    if(volumeLabel){
      volumeLabel.textContent = hasVolumeGoal ? `${money(fundedVolume)} of ${money(volumeGoal)}` : `${money(fundedVolume)} this month`;
    }
    const fundedBar = asEl('goal-funded-bar');
    if(fundedBar){
      const pct = hasFundedGoal ? fundedPct : (fundedCount>0 ? 100 : 0);
      fundedBar.style.width = `${pct}%`;
      fundedBar.style.opacity = pct>0 ? '1' : '0.2';
    }
    const volumeBar = asEl('goal-volume-bar');
    if(volumeBar){
      const pct = hasVolumeGoal ? volumePct : (fundedVolume>0 ? 100 : 0);
      volumeBar.style.width = `${pct}%`;
      volumeBar.style.opacity = pct>0 ? '1' : '0.2';
    }
    const metricsWrap = asEl('goal-progress-metrics');
    const emptyState = asEl('goal-empty-state');
    if(metricsWrap && emptyState){
      metricsWrap.style.visibility = hasGoal ? 'visible' : 'hidden';
      emptyState.style.visibility = hasGoal ? 'hidden' : 'visible';
    }
    const footnote = asEl('goal-progress-footnote');
    if(footnote){
      if(hasGoal){
        let note = 'Targets reset each calendar month.';
        if(goalRec.updatedAt){
          const updated = new Date(goalRec.updatedAt);
          if(!Number.isNaN(updated.getTime())){
            note = `Last updated ${updated.toLocaleDateString()} • Targets reset each calendar month.`;
          }
        }
        footnote.textContent = note;
      }else{
        footnote.textContent = 'Set a funded loan or volume goal to unlock progress tracking.';
      }
    }

    const total = contacts.length;
    const funded = contacts.filter(c=> String(c.stage).toLowerCase()==='funded').length;
    const loanVol = contacts.reduce((s,c)=> s + (Number(c.loanAmount||0)||0), 0);
    setText($('#kpi-total'), total);
    setText($('#kpi-funded'), funded);
    setText($('#kpi-loanvol'), money(loanVol));
    setText($('#kpi-conv'), total ? Math.round((funded/total)*100)+'%' : '0%');
    setText($('#kpi-comm-pipeline'), money(loanVol * 0.01));
    setText($('#kpi-comm-earned'), money(loanVol * 0.008));
    setText($('#kpi-comm-received'), money(loanVol * 0.005));
    setText($('#kpi-comm-proj'), money(loanVol * 0.012));

    const tiers = partners.reduce((m,p)=>{ const t = p.tier||'Developing'; m[t]=(m[t]||0)+1; return m; }, {});
    const tierEntries = Object.entries(tiers).sort((a,b)=>b[1]-a[1]);
    const tierTotal = tierEntries.reduce((sum, [,count])=>sum+count, 0);
    const tierHost = $('#partner-tier-breakdown');
    if(tierHost){
      if(!tierEntries.length){
        tierHost.innerHTML = '<div class="mini-bar-chart portfolio-chart"><div class="mini-bar-row empty">Add partners to see portfolio mix.</div></div>';
      }else{
        const rows = tierEntries.map(([tier,count])=>{
          const pct = tierTotal ? Math.round((count/tierTotal)*100) : 0;
          const color = colorForTier(tier);
          return `<div class="mini-bar-row"><div class="mini-bar-label"><span class="mini-bar-dot" style="background:${color}"></span>${safe(tier)}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.max(pct,3)}%"></div></div><div class="mini-bar-value">${count} • ${pct}%</div></div>`;
        }).join('');
        tierHost.innerHTML = `<div class="mini-bar-chart portfolio-chart">${rows}</div>`;
      }
    }
    const portfolioCountEl = asEl('partner-portfolio-count');
    if(portfolioCountEl){
      portfolioCountEl.textContent = tierTotal || 0;
    }

    const referralStats = new Map();
    contacts.forEach(c => {
      const pid = c.buyerPartnerId || c.listingPartnerId;
      if(!pid || pid===NONE_PARTNER_ID) return;
      const entry = referralStats.get(pid) || {count:0, volume:0, contacts:[]};
      entry.count += 1;
      entry.volume += Number(c.loanAmount||0)||0;
      entry.contacts.push(c);
      referralStats.set(pid, entry);
    });
    const top3 = Array.from(referralStats.entries()).sort((a,b)=> (b[1]?.count||0) - (a[1]?.count||0)).slice(0,3);
    const totalRef = Array.from(referralStats.values()).reduce((s,v)=>s+(v.count||0),0) || 0;
    html($('#top3'), top3.length ? top3.map(([pid,stat])=>{
      const p = partners.find(x=> String(x.id)===String(pid)) || {name:'—'};
      const share = totalRef ? Math.round((stat.count/totalRef)*100) : 0;
      const tier = p.tier ? `<span class="insight-tag light">${safe(p.tier)}</span>` : '';
      const details = [p.company, p.phone, p.email].filter(Boolean).map(val=>safe(val)).join(' • ');
      const stageCounts = stat.contacts.reduce((acc,contact)=>{
        const key = String(contact.stage||'').toLowerCase();
        acc[key] = (acc[key]||0)+1;
        return acc;
      },{});
      const topStage = Object.entries(stageCounts).sort((a,b)=>b[1]-a[1])[0];
      const focus = topStage ? `${stageLabels[topStage[0]] || topStage[0]} (${topStage[1]})` : '';
      const focusLine = focus ? `<div class="insight-sub">Focus: ${safe(focus)}</div>` : '';
      const detailLine = details ? `<div class="insight-sub">${details}</div>` : '';
      const volumeLine = stat.volume ? `<div class="insight-sub">Loan Volume: ${money(stat.volume)}</div>` : '';
      return `<li>
        <div class="list-main">
          <span class="insight-avatar">${initials(p.name||'')}</span>
          <div>
            <div class="insight-title">${safe(p.name||'—')}</div>
            <div class="insight-sub">${stat.count} referrals • ${share}% share</div>
            ${focusLine}
            ${volumeLine}
            ${detailLine}
          </div>
        </div>
        <div class="insight-meta">${tier || ''}</div>
      </li>`;
    }).join('') : '<li class="empty">Recruit or tag partners to surface leaders.</li>');

    const openTasks = (tasks||[]).filter(t=> t && t.due && !t.done).map(t=>{
      const dueDate = toDate(t.due);
      const contact = contactById.get(String(t.contactId||''));
      const stage = contact ? String(contact.stage||'').replace(/-/g,' ') : '';
      const diffFromToday = dueDate ? Math.floor((dueDate.getTime()-today.getTime())/86400000) : null;
      let status = 'ready';
      if(diffFromToday!=null){
        if(diffFromToday < 0) status = 'overdue';
        else if(diffFromToday <= 3) status = 'soon';
      }
      const dueLabel = dueDate ? dueDate.toISOString().slice(0,10) : 'No date';
      return {
        raw: t,
        title: t.title || t.text || 'Follow up',
        dueDate,
        dueLabel,
        status,
        diffFromToday,
        contact,
        name: contact ? fullName(contact) : 'General Task',
        stage
      };
    }).sort((a,b)=>{
      const ad = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      return ad-bd;
    });

    const attention = openTasks.filter(t=> t.status==='overdue' || t.status==='soon').slice(0,6);
    html($('#needs-attn'), attention.length ? attention.map(task=>{
      const cls = task.status==='overdue' ? 'bad' : (task.status==='soon' ? 'warn' : 'good');
      const phr = task.status==='overdue' ? `${Math.abs(task.diffFromToday||0)}d overdue` : (task.status==='soon' ? `Due in ${task.diffFromToday}d` : 'Scheduled');
      const idAttr = task.contact ? attr(task.contact.id||'') : '';
      const widgetAttrs = idAttr ? ` data-id="${idAttr}" data-widget="needs-attn"` : '';
      return `<li class="${task.status}"${widgetAttrs}>
        <div class="list-main">
          <span class="status-dot ${task.status}"></span>
          <div>
            <div class="insight-title">${safe(task.title)}</div>
            <div class="insight-sub">${safe(task.name)}${task.stage?` • ${safe(task.stage)}`:''}</div>
          </div>
        </div>
        <div class="insight-meta ${cls}">${phr} · ${task.dueLabel}</div>
      </li>`;
    }).join('') : '<li class="empty">No urgent follow-ups — nice work!</li>');

    const timeline = openTasks.filter(t=> t.status!=='overdue').slice(0,6);
    html($('#upcoming'), timeline.length ? timeline.map(task=>{
      const cls = task.status==='soon' ? 'warn' : 'good';
      const phr = task.status==='soon' ? `Due in ${task.diffFromToday}d` : 'Scheduled';
      const idAttr = task.contact ? attr(task.contact.id||'') : '';
      const widgetAttrs = idAttr ? ` data-id="${idAttr}" data-widget="upcoming"` : '';
      return `<li${widgetAttrs}>
        <div class="list-main">
          <span class="status-dot ${task.status}"></span>
          <div>
            <div class="insight-title">${safe(task.title)}</div>
            <div class="insight-sub">${safe(task.name)}${task.stage?` • ${safe(task.stage)}`:''}</div>
          </div>
        </div>
        <div class="insight-meta ${cls}">${phr} · ${task.dueLabel}</div>
      </li>`;
    }).join('') : '<li class="empty">No events scheduled. Add tasks to stay proactive.</li>');

    const stageCounts = contacts.reduce((m,c)=>{ const s = String(c.stage||'').toLowerCase(); m[s]=(m[s]||0)+1; return m; },{});
    const orderedStages = ['application','processing','underwriting','approved','cleared-to-close','funded','post-close','nurture','lost','denied','long shot'];
    const stageTotal = Object.values(stageCounts).reduce((sum,val)=>sum+val,0);
    const orderedSet = new Set(orderedStages);
    const additionalStages = Object.keys(stageCounts).filter(key=> !orderedSet.has(key) && stageCounts[key]);
    const stageOrder = orderedStages.filter(key=> stageCounts[key]).concat(additionalStages);
    const momentumHost = $('#pipeline-breakdown');
    if(momentumHost){
      if(!stageTotal){
        momentumHost.innerHTML = '<div class="mini-bar-chart momentum-chart"><div class="mini-bar-row empty">Add contacts to chart pipeline momentum.</div></div>';
      }else{
        const rows = stageOrder.map(key=>{
          const count = stageCounts[key]||0;
          const pct = stageTotal ? Math.round((count/stageTotal)*100) : 0;
          const label = stageLabels[key] || (key ? key.replace(/-/g,' ') : 'Stage');
          const color = colorForStage(key);
          return `<div class="mini-bar-row"><div class="mini-bar-label"><span class="mini-bar-dot" style="background:${color}"></span>${safe(label)}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.max(pct,3)}%"></div></div><div class="mini-bar-value">${count} • ${pct}%</div></div>`;
        }).join('');
        momentumHost.innerHTML = `<div class="mini-bar-chart momentum-chart">${rows}</div>`;
      }
    }
    const momentumCountEl = asEl('pipeline-momentum-count');
    if(momentumCountEl){
      momentumCountEl.textContent = stageTotal || 0;
    }

    const docs = documents || [];
    const docHost = $('#doc-status-summary');
    if(docHost){
      if(!docs.length){
        docHost.innerHTML = '<div class="empty muted">Add documents to begin tracking checklist progress.</div>';
      }else{
        const normalizeStatus = (value)=>{
          const raw = String(value||'').trim().toLowerCase();
          if(!raw) return 'requested';
          if(raw==='followup' || raw==='follow-up') return 'follow up';
          if(raw.includes('follow')) return 'follow up';
          if(raw.includes('receive')) return 'received';
          if(raw.includes('waive')) return 'waived';
          if(raw.includes('request')) return 'requested';
          return raw;
        };
        const counts = docs.reduce((acc, doc)=>{
          const key = normalizeStatus(doc.status);
          acc[key] = (acc[key]||0)+1;
          return acc;
        },{});
        const totalDocs = docs.length;
        const updatedAt = docs.reduce((max, doc)=> Math.max(max, Number(doc.updatedAt||0)||0), 0);
        const lastUpdated = updatedAt ? new Date(updatedAt) : null;
        const statusOrder = [
          {key:'requested', label:'Requested', tone:'pending', color:'#f97316', helper:'Awaiting borrower upload'},
          {key:'follow up', label:'Follow Up', tone:'follow', color:'#ef4444', helper:'Needs outreach'},
          {key:'received', label:'Received', tone:'ok', color:'#10b981', helper:'Filed and ready'},
          {key:'waived', label:'Waived', tone:'waived', color:'#64748b', helper:'No longer required'}
        ];
        const outstanding = statusOrder
          .filter(s=> s.key==='requested' || s.key==='follow up')
          .reduce((sum, s)=> sum + (counts[s.key]||0), 0);
        const pendingLabel = outstanding===1 ? '1 item pending' : `${outstanding} items pending`;
        const overviewMetaParts = [`${totalDocs} total docs`];
        if(lastUpdated && !Number.isNaN(lastUpdated.getTime())){
          overviewMetaParts.push(`Updated ${lastUpdated.toLocaleDateString()}`);
        }
        const rows = statusOrder.map(entry=>{
          const count = counts[entry.key]||0;
          const pct = totalDocs ? Math.round((count/totalDocs)*100) : 0;
          const barWidth = count ? Math.max(pct, 6) : 0;
          return `<div class="doc-status-row">
            <span class="status-pill" data-tone="${entry.tone}">${safe(entry.label)}</span>
            <div class="bar" style="--bar-color:${entry.color}"><span style="width:${barWidth}%"></span></div>
            <div class="count">${count}</div>
            <div class="meta">${pct}% • ${safe(entry.helper)}</div>
          </div>`;
        }).join('');
        docHost.innerHTML = `<div class="doc-status-overview"><strong>${pendingLabel}</strong><span>${safe(overviewMetaParts.join(' • '))}</span></div>${rows}`;
      }
    }

    const inpr = contacts.filter(c => STAGES_PIPE.includes(String(c.stage||'').toLowerCase()) || String(c.status||'').toLowerCase()==='inprogress');
    const lshot = contacts.filter(c => {
      const status = String(c.status||'').toLowerCase();
      const stage = String(c.stage||'').toLowerCase();
      return status==='prospect' || status==='longshot' || status==='nurture' || status==='paused' || stage.includes('long') || stage.includes('nurture');
    });
    const pipe = contacts.filter(c => STAGES_PIPE.includes(String(c.stage||'').toLowerCase()));
    const clientsTbl = contacts.filter(c => STAGES_CLIENT.includes(String(c.stage||'').toLowerCase()));

    setText($('#count-inprog'), inpr.length);
    setText($('#count-active'), pipe.length);
    setText($('#count-clients'), clientsTbl.length);
    setText($('#count-longshots'), lshot.length);

    const partnerMap = new Map(partners.map(p=>[String(p.id), p]));
    const isoDate = (value)=>{ const d = toDate(value); return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0,10) : ''; };
    const displayDate = (value)=>{ const d = toDate(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : '—'; };
    const contactLink = (c)=> `<a href="#" class="status-name-link contact-name" data-role="contact-name" data-id="${attr(c.id||'')}">${safe(fullName(c))}</a>`;

    const relOpportunities = inpr.map(c=>{
      const lastTouch = toDate(c.lastContact || c.nextFollowUp);
      const days = lastTouch ? daysAgo(lastTouch, now) : null;
      return {contact:c, lastTouch, days};
    }).filter(row=> row.days==null || row.days>=5).sort((a,b)=>{
      const ad = a.days==null ? Number.MAX_SAFE_INTEGER : a.days;
      const bd = b.days==null ? Number.MAX_SAFE_INTEGER : b.days;
      if(ad===bd){
        const aAmt = Number(a.contact.loanAmount||0);
        const bAmt = Number(b.contact.loanAmount||0);
        return bAmt-aAmt;
      }
      return bd-ad;
    }).slice(0,5);

    html($('#rel-opps'), relOpportunities.length ? relOpportunities.map(item=>{
      const c = item.contact;
      const name = fullName(c);
      const last = item.days==null ? 'No touches yet' : (item.days<=0 ? 'Touched today' : `${item.days}d since touch`);
      const urgencyClass = item.days==null || item.days>14 ? 'bad' : 'warn';
      const stage = stageLabels[String(c.stage||'').toLowerCase()] || (c.stage||'');
      const amount = Number(c.loanAmount||0) ? ` • ${money(c.loanAmount)}` : '';
      return `<li data-id="${attr(c.id||'')}" data-widget="rel-opps">
        <div class="list-main">
          <span class="insight-avatar">${initials(name)}</span>
          <div>
            <div class="insight-title">${safe(name)}</div>
            <div class="insight-sub">${safe(stage)}${amount}</div>
          </div>
        </div>
        <div class="insight-meta ${urgencyClass}">${last}</div>
      </li>`;
    }).join('') : '<li class="empty">Pipeline borrowers are up to date.</li>');

    const nurtureCandidates = clientsTbl.map(c=>{
      const last = toDate(c.lastContact || c.fundedDate || c.anniversary);
      const days = last ? daysAgo(last, now) : null;
      return {contact:c, lastTouch:last, days};
    }).filter(row=> row.days==null || row.days>=21).sort((a,b)=>{
      const ad = a.days==null ? Number.MAX_SAFE_INTEGER : a.days;
      const bd = b.days==null ? Number.MAX_SAFE_INTEGER : b.days;
      return bd-ad;
    }).slice(0,5);

    html($('#nurture'), nurtureCandidates.length ? nurtureCandidates.map(item=>{
      const c = item.contact;
      const name = fullName(c);
      const last = item.days==null ? 'Never nurtured' : `${item.days}d since touch`;
      const stage = stageLabels[String(c.stage||'').toLowerCase()] || (c.stage||STR['kanban.placeholder.client']);
      const funded = c.fundedDate ? `${translate('calendar.event.funded')} ${safe(c.fundedDate)}` : STR['kanban.placeholder.client'];
      return `<li data-id="${attr(c.id||'')}" data-widget="nurture">
        <div class="list-main">
          <span class="insight-avatar">${initials(name)}</span>
          <div>
            <div class="insight-title">${safe(name)}</div>
            <div class="insight-sub">${safe(stage)} • ${safe(funded)}</div>
          </div>
        </div>
        <div class="insight-meta warn">${last}</div>
      </li>`;
    }).join('') : '<li class="empty">All clients recently nurtured. Schedule your next campaign!</li>');

    const closingCandidates = contacts.map(c=>{
      const stage = String(c.stage||'').toLowerCase();
      const dateValue = c.expectedClosing || c.closingDate || c.fundedDate;
      const date = toDate(dateValue);
      return {contact:c, date, stage};
    }).filter(row=> row.date).sort((a,b)=> a.date.getTime()-b.date.getTime()).slice(0,5);

    html($('#closing-watch'), closingCandidates.length ? closingCandidates.map(item=>{
      const c = item.contact;
      const name = fullName(c);
      const stage = stageLabels[item.stage] || (c.stage||'');
      const when = item.date.toISOString().slice(0,10);
      const amount = Number(c.loanAmount||0) ? money(c.loanAmount) : 'TBD';
      const statusClass = item.stage==='funded' ? 'good' : 'warn';
      return `<li data-id="${attr(c.id||'')}" data-widget="closing-watch" data-date="${attr(when)}">
        <div class="list-main">
          <span class="insight-avatar">${initials(name)}</span>
          <div>
            <div class="insight-title">${safe(name)}</div>
            <div class="insight-sub">${safe(stage)} • ${amount}</div>
          </div>
        </div>
        <div class="insight-meta ${statusClass}">${when}</div>
      </li>`;
    }).join('') : '<li class="empty">No scheduled closings yet — load deals to track them here.</li>');

    const horizon = new Date(today);
    horizon.setDate(horizon.getDate()+30);
    const rangeStart = today.getTime();
    const rangeEnd = horizon.getTime();
    const pipelineEvents = [];
    const pipelineTypeLabels = {task:'Task', deal:'Closing', followup:'Follow-Up', expiring:'Expiring'};
    const addEvent = (rawDate, label, meta, type)=>{
      const when = rawDate instanceof Date ? rawDate : toDate(rawDate);
      if(!when) return;
      const stamp = when.getTime();
      if(Number.isNaN(stamp) || stamp < rangeStart || stamp > rangeEnd) return;
      const typeKey = pipelineTypeLabels[type] ? type : 'task';
      const typeLabel = pipelineTypeLabels[typeKey] || pipelineTypeLabels.task;
      pipelineEvents.push({date: when, label, meta, type: typeKey, typeLabel});
    };
    openTasks.forEach(task=>{
      if(task.dueDate){
        const metaParts = [task.name];
        if(task.stage) metaParts.push(task.stage);
        addEvent(task.dueDate, task.title, metaParts.filter(Boolean).join(' • '), 'task');
      }
    });
    contacts.forEach(c=>{
      if(c.nextFollowUp){
        const stage = stageLabels[String(c.stage||'').toLowerCase()] || c.stage || STR['stage.pipeline'];
        addEvent(c.nextFollowUp, `${fullName(c)} — Next Touch`, stage, 'followup');
      }
      if(c.preApprovalExpires){
        addEvent(c.preApprovalExpires, `${fullName(c)} — Pre-Approval`, 'Expires', 'expiring');
      }
    });
    closingCandidates.forEach(item=>{
      const c = item.contact;
      const stage = stageLabels[item.stage] || (c.stage||'');
      const metaParts = [stage];
      if(Number(c.loanAmount||0)) metaParts.push(money(c.loanAmount));
      addEvent(item.date, `${fullName(c)} — Closing`, metaParts.filter(Boolean).join(' • '), 'deal');
    });
    pipelineEvents.sort((a,b)=> a.date.getTime() - b.date.getTime());
    const pipelineCal = $('#pipeline-calendar');
    if(pipelineCal){
      if(!pipelineEvents.length){
        pipelineCal.innerHTML = '<div class="empty">No upcoming milestones in the next 30 days.</div>';
      }else{
        const items = pipelineEvents.slice(0,8).map(ev=>{
          const typeClass = `pipeline-type ${safe(ev.type.toLowerCase())}`;
          const badge = pipelineTypeLabels[ev.type.toLowerCase()] || ev.type;
          const metaLine = ev.meta ? `<div class="pipeline-meta">${safe(ev.meta)}</div>` : '';
          return `<li><div class="pipeline-date">${safe(shortDate(ev.date))}</div><div class="pipeline-detail"><div class="pipeline-label">${safe(ev.label)}</div>${metaLine}</div><span class="${typeClass}">${safe(badge)}</span></li>`;
        }).join('');
        pipelineCal.innerHTML = `<ul class="pipeline-timeline">${items}</ul>`;
      }
    }

    window.__WIDGET_DATA__ = { relOpportunities, nurtureCandidates, closingCandidates, pipelineEvents, attention, timeline };
    ensureWidgetClickHandlers();

    const tablesHost = document.querySelector('.status-stack');
    if(tablesHost){
      tablesHost.innerHTML = `
        <div class="wb-pointer" role="note">
          <div>Detailed tables moved to <a href="#workbench" data-nav="workbench">Workbench</a> for speed and clarity.</div>
        </div>
      `;
    }

    const tbPipe = $('#tbl-pipeline tbody'); if(tbPipe){
      tbPipe.innerHTML = pipe.map(c => {
        const nameAttr = attr(fullName(c).toLowerCase());
        const stageAttr = attr(String(c.stage||'').toLowerCase());
        const loanLabel = c.loanType || c.loanProgram || '';
        const loanAttr = attr(String(loanLabel).toLowerCase());
        const amountVal = Number(c.loanAmount||0) || 0;
        const amountAttr = attr(amountVal);
        const emailAttr = attr((c.email||'').trim().toLowerCase());
        const phoneAttr = attr(normalizePhone(c.phone||''));
        const refTokens = [];
        if(c.referredBy) refTokens.push(String(c.referredBy));
        [c.buyerPartnerId, c.listingPartnerId, c.partnerId].forEach(pid => {
          if(!pid && pid!==0) return;
          const partner = partnerMap.get(String(pid));
          if(partner && partner.name) refTokens.push(partner.name);
          if(partner && partner.company) refTokens.push(partner.company);
        });
        const refAttr = attr(refTokens.map(val => String(val||'').toLowerCase()).filter(Boolean).join('|'));
        return `<tr data-id="${attr(c.id||'')}" data-name="${nameAttr}" data-stage="${stageAttr}" data-loan="${loanAttr}" data-amount="${amountAttr}" data-email="${emailAttr}" data-phone="${phoneAttr}" data-ref="${refAttr}">
        <td><input data-role="select" type="checkbox" data-id="${attr(c.id||'')}"></td>
        <td class="contact-name" data-role="contact-name">${contactLink(c)}</td>
        <td>${safe(c.stage||'')}</td><td>${safe(loanLabel||'')}</td>
        <td>${amountVal ? money(amountVal) : '—'}</td><td>${safe(c.referredBy||'')}</td></tr>`;
      }).join('');
    }
    const tbClients = $('#tbl-clients tbody'); if(tbClients){
      tbClients.innerHTML = clientsTbl.map(c => {
        const nameAttr = attr(fullName(c).toLowerCase());
        const stageAttr = attr(String(c.stage||'').toLowerCase());
        const loanLabel = c.loanType || c.loanProgram || '';
        const loanAttr = attr(String(loanLabel).toLowerCase());
        const amountVal = Number(c.loanAmount||0) || 0;
        const amountAttr = attr(amountVal);
        const emailAttr = attr((c.email||'').trim().toLowerCase());
        const phoneAttr = attr(normalizePhone(c.phone||''));
        const fundedIso = attr(isoDate(c.fundedDate) || '');
        const refTokens = [];
        if(c.referredBy) refTokens.push(String(c.referredBy));
        [c.buyerPartnerId, c.listingPartnerId, c.partnerId].forEach(pid => {
          if(!pid && pid!==0) return;
          const partner = partnerMap.get(String(pid));
          if(partner && partner.name) refTokens.push(partner.name);
          if(partner && partner.company) refTokens.push(partner.company);
        });
        const refAttr = attr(refTokens.map(val => String(val||'').toLowerCase()).filter(Boolean).join('|'));
        return `<tr data-id="${attr(c.id||'')}" data-name="${nameAttr}" data-stage="${stageAttr}" data-loan="${loanAttr}" data-amount="${amountAttr}" data-email="${emailAttr}" data-phone="${phoneAttr}" data-funded="${fundedIso}" data-ref="${refAttr}">
        <td><input data-role="select" type="checkbox" data-id="${attr(c.id||'')}"></td>
        <td class="contact-name" data-role="contact-name">${contactLink(c)}</td>
        <td>${safe(c.stage||'')}</td><td>${safe(loanLabel||'')}</td>
        <td>${amountVal ? money(amountVal) : '—'}</td><td>${safe(c.fundedDate||'')}</td></tr>`;
      }).join('');
    }
    const tbLs = $('#tbl-longshots tbody'); if(tbLs){
      tbLs.innerHTML = lshot.map(c => {
        const nameAttr = attr(fullName(c).toLowerCase());
        const loanLabel = c.loanType || c.loanProgram || '';
        const loanAttr = attr(String(loanLabel).toLowerCase());
        const amountVal = Number(c.loanAmount||0) || 0;
        const amountAttr = attr(amountVal);
        const emailAttr = attr((c.email||'').trim().toLowerCase());
        const phoneAttr = attr(normalizePhone(c.phone||''));
        const lastIso = attr(isoDate(c.lastContact || c.nextFollowUp) || '');
        const refTokens = [];
        if(c.referredBy) refTokens.push(String(c.referredBy));
        [c.buyerPartnerId, c.listingPartnerId, c.partnerId].forEach(pid => {
          if(!pid && pid!==0) return;
          const partner = partnerMap.get(String(pid));
          if(partner && partner.name) refTokens.push(partner.name);
          if(partner && partner.company) refTokens.push(partner.company);
        });
        const refAttr = attr(refTokens.map(val => String(val||'').toLowerCase()).filter(Boolean).join('|'));
        return `<tr data-id="${attr(c.id||'')}" data-name="${nameAttr}" data-loan="${loanAttr}" data-amount="${amountAttr}" data-email="${emailAttr}" data-phone="${phoneAttr}" data-ref="${refAttr}" data-last="${lastIso}">
        <td><input data-role="select" type="checkbox" data-id="${attr(c.id||'')}"></td>
        <td class="contact-name" data-role="contact-name">${contactLink(c)}</td>
        <td>${safe(loanLabel||'')}</td><td>${amountVal ? money(amountVal) : '—'}</td>
        <td>${safe(c.referredBy||'')}</td><td>${safe(c.lastContact||'')}</td></tr>`;
      }).join('');
    }

    ensureKanbanStageAttributes();
    renderPartnersTable(partners);

    if(typeof window.applyFilters==='function'){
      try{ window.applyFilters(); }
      catch(err){ console && console.warn && console.warn('applyFilters', err); }
    }

    });
  }

  window.renderAll = renderAll;
  window.renderPartners = async function(){
    await openDB();
    const partners = await dbGetAll('partners');
    renderPartnersTable(partners);
    if(typeof window.applyFilters==='function'){
      try{ window.applyFilters(); }
      catch(err){ console && console.warn && console.warn('applyFilters', err); }
    }
  };
})();

(function applyDashOrderPostPaint(){
  function run(){
    try {
      if (window.DashLayout && typeof window.DashLayout.apply === 'function') {
        window.DashLayout.apply();
      }
    } catch {}
  }
  if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function') {
    try { window.RenderGuard.registerHook(run); } catch {}
  } else {
    setTimeout(run, 0);
  }
})();

import { wireQuickAddUnified } from '/js/ui/quick_add_unified.js';
wireQuickAddUnified();
