import { STR, text } from './ui/strings.js';
import { safeMax, normalizePhone, normalizeEmail } from './util/strings.js';
import { stageKeyFromLabel } from './pipeline/stages.js';
import './importer_helpers.js';
import './importer_partners.js';
import './importer_contacts.js';

const CLAMP_LIMITS = Object.freeze({ name: 120, company: 120, address: 200, notes: 10000 });

const canon = (value) => String(value ?? '').trim();
const lc = (value) => canon(value).toLowerCase();

export const REQ_PARTNER = Object.freeze([
  'partnerId','name','company','email','phone'
]);

export const REQ_CONTACT = Object.freeze([
  'first','last','email','phone','address','city','state','zip','referredBy','loanType','stage','loanAmount','rate','fundedDate','status','notes',
  'contactId',
  'buyerPartnerId','buyerPartnerName','buyerPartnerCompany','buyerPartnerEmail','buyerPartnerPhone',
  'listingPartnerId','listingPartnerName','listingPartnerCompany','listingPartnerEmail','listingPartnerPhone',
  'partnerLinkStatus'
]);

export const CONTACT_TEMPLATE_FIELDS = Object.freeze(Array.from(new Set([
  ...REQ_CONTACT,
  'nextFollowUp','expectedClosing','pipelineMilestone','leadSource','loanProgram','preApprovalExpires','birthday','anniversary','createdAt','updatedAt'
])));

export const PARTNER_TEMPLATE_FIELDS = Object.freeze(Array.from(new Set([
  ...REQ_PARTNER,
  'partnerType','tier','focus','priority','preferredContact','cadence','address','city','state','zip','referralVolume','lastTouch','nextTouch','relationshipOwner','collaborationFocus','notes'
])));

function hasNonEmpty(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function clampValue(value, limit, stats) {
  const trimmed = safeMax(String(value ?? ''), limit);
  if (trimmed.length < String(value ?? '').length && stats) {
    stats.count += 1;
  }
  return trimmed;
}

function combineNotes(base, incoming) {
  const a = canon(base);
  const b = canon(incoming);
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  return `${a}\n\n--- merged ${stamp} ---\n${b}`;
}

function cloneRecord(record) {
  if (!record || typeof structuredClone === 'function') {
    try { return structuredClone(record); }
    catch (_err) {}
  }
  return JSON.parse(JSON.stringify(record ?? null));
}

function createIndex(records, keyBuilder) {
  const byId = new Map();
  const byKey = new Map();
  (records || []).forEach((record) => {
    if (!record || record.id == null) return;
    const id = String(record.id);
    byId.set(id, record);
    keyBuilder(record).forEach((key) => {
      if (!byKey.has(key)) byKey.set(key, record);
    });
  });
  return { byId, byKey };
}

function registerRecord(record, index, keyBuilder) {
  if (!record || record.id == null) return;
  const id = String(record.id);
  index.byId.set(id, record);
  keyBuilder(record).forEach((key) => {
    index.byKey.set(key, record);
  });
}

function findTruncatedHeaders(headers) {
  return (headers || [])
    .map((header) => String(header ?? ''))
    .filter((header) => header.includes('...'));
}

function ensureNoTruncatedCommit(headers) {
  const truncated = findTruncatedHeaders(headers);
  if (!truncated.length) return null;
  const message = text('importer.error.truncated-header', { headers: truncated.join(', ') });
  const error = new Error(message);
  error.code = 'IMPORT_TRUNCATED_HEADERS';
  error.truncatedHeaders = truncated.slice();
  throw error;
}

function pickExisting(candidate, index) {
  if (!candidate) return null;
  const id = candidate.id == null ? null : String(candidate.id);
  if (id && index.byId.has(id)) return index.byId.get(id);
  for (const key of candidate._dedupeKeys || []) {
    if (index.byKey.has(key)) return index.byKey.get(key);
  }
  return null;
}

function buildContactKeys(record) {
  const keys = [];
  const contactId = canon(record.contactId || record.id);
  if (contactId) keys.push(`id:${contactId}`);
  const email = normalizeEmail(record.email);
  if (email) keys.push(`em:${email}`);
  const phone = normalizePhone(record.phone);
  if (phone) keys.push(`ph:${phone}`);
  const fallback = `${lc(record.first)}|${lc(record.last)}|${lc(record.city)}`;
  if (fallback.replace(/\|/g, '').trim()) keys.push(`fb:${fallback}`);
  return keys;
}

function buildPartnerKeys(record) {
  const keys = [];
  const partnerId = canon(record.partnerId || record.id);
  if (partnerId) keys.push(`id:${partnerId}`);
  const email = normalizeEmail(record.email);
  if (email) keys.push(`em:${email}`);
  const phone = normalizePhone(record.phone);
  if (phone) keys.push(`ph:${phone}`);
  const fallback = `${lc(record.name)}|${lc(record.company)}|${lc(record.city)}`;
  if (fallback.replace(/\|/g, '').trim()) keys.push(`fb:${fallback}`);
  return keys;
}

function clampContact(record, stats) {
  const next = Object.assign({}, record);
  next.first = clampValue(next.first, CLAMP_LIMITS.name, stats);
  next.last = clampValue(next.last, CLAMP_LIMITS.name, stats);
  next.address = clampValue(next.address, CLAMP_LIMITS.address, stats);
  next.notes = clampValue(next.notes, CLAMP_LIMITS.notes, stats);
  return next;
}

function clampPartner(record, stats) {
  const next = Object.assign({}, record);
  next.name = clampValue(next.name, CLAMP_LIMITS.name, stats);
  next.company = clampValue(next.company, CLAMP_LIMITS.company, stats);
  next.address = clampValue(next.address, CLAMP_LIMITS.address, stats);
  next.notes = clampValue(next.notes, CLAMP_LIMITS.notes, stats);
  return next;
}

function normalizeStageValue(value) {
  return stageKeyFromLabel(value);
}

function mergeContactRecord(existing, incoming) {
  const base = cloneRecord(existing) || {};
  const payload = cloneRecord(incoming) || {};
  const result = Object.assign({}, base);
  const scalarFields = [
    'first','last','email','phone','address','city','state','zip','referredBy','loanType','stage','loanAmount','rate','fundedDate','status','preferredName','nextFollowUp','expectedClosing','pipelineMilestone','leadSource','loanProgram','preApprovalExpires','birthday','anniversary','priority','communicationPreference','contactType','loanPurpose','closingTimeline','docStage','lastContact','tags'
  ];
  scalarFields.forEach((field) => {
    if (hasNonEmpty(payload[field])) {
      result[field] = payload[field];
    }
  });
  if (hasNonEmpty(result.stage)) {
    result.stage = normalizeStageValue(result.stage);
  }
  if (hasNonEmpty(payload.notes)) {
    result.notes = combineNotes(base.notes, payload.notes);
  }
  if (Array.isArray(base.tags) || Array.isArray(payload.tags)) {
    const set = new Map();
    (Array.isArray(base.tags) ? base.tags : []).forEach((tag) => {
      const key = String(tag).toLowerCase();
      if (!set.has(key)) set.set(key, tag);
    });
    (Array.isArray(payload.tags) ? payload.tags : []).forEach((tag) => {
      const key = String(tag).toLowerCase();
      if (!set.has(key)) set.set(key, tag);
    });
    result.tags = Array.from(set.values());
  }
  result.buyerPartnerId = hasNonEmpty(payload.buyerPartnerId) ? payload.buyerPartnerId : result.buyerPartnerId;
  result.listingPartnerId = hasNonEmpty(payload.listingPartnerId) ? payload.listingPartnerId : result.listingPartnerId;
  if (payload.extras || base.extras) {
    result.extras = Object.assign({}, base.extras || {}, payload.extras || {});
  }
  result.updatedAt = Date.now();
  if (!result.id && payload.id) result.id = payload.id;
  if (!result.contactId && payload.contactId) result.contactId = payload.contactId;
  return result;
}

function mergePartnerRecord(existing, incoming) {
  const base = cloneRecord(existing) || {};
  const payload = cloneRecord(incoming) || {};
  const result = Object.assign({}, base);
  const scalarFields = [
    'name','company','email','phone','tier','partnerType','focus','priority','preferredContact','cadence','address','city','state','zip','referralVolume','lastTouch','nextTouch','relationshipOwner','collaborationFocus'
  ];
  scalarFields.forEach((field) => {
    if (hasNonEmpty(payload[field])) {
      result[field] = payload[field];
    }
  });
  if (hasNonEmpty(payload.notes)) {
    result.notes = combineNotes(base.notes, payload.notes);
  }
  if (payload.extras || base.extras) {
    result.extras = Object.assign({}, base.extras || {}, payload.extras || {});
  }
  result.updatedAt = Date.now();
  if (!result.id && payload.id) result.id = payload.id;
  if (!result.partnerId && payload.partnerId) result.partnerId = payload.partnerId;
  return result;
}

function emitImportChanged(scope) {
  try {
    const detail = { scope: 'import', entity: scope, partial: true };
    if (typeof window !== 'undefined' && typeof window.dispatchAppDataChanged === 'function') {
      window.dispatchAppDataChanged(detail);
    } else if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error('[importer] dispatchAppDataChanged unavailable; import change not broadcast.', detail);
    }
  } catch (_err) {}
}

export const IMPORTER_INTERNALS = {
  buildContactKeys,
  buildPartnerKeys,
  clampContact,
  clampPartner,
  mergeContactRecord,
  mergePartnerRecord,
  createIndex,
  registerRecord,
  pickExisting,
  findTruncatedHeaders,
  ensureNoTruncatedCommit
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
(function(){
  const NONE_PARTNER_ID = (window.IMPORT_HELPERS && window.IMPORT_HELPERS.NONE_PARTNER_ID) || window.NONE_PARTNER_ID || '00000000-0000-none-partner-000000000000';

  async function loadDefaultMapping(kind){
    const settings = await dbGetAll('settings');
    const rec = settings.find(s => s.id==='csvMappings');
    if(rec && rec[kind]) return rec[kind];
    if(window.CSV_PRESETS){
      return (kind==='partners') ? window.CSV_PRESETS.partnersDefault : window.CSV_PRESETS.contactsDefault;
    }
    return {};
  }
  async function saveDefaultMapping(kind, mapping){
    const settings = await dbGetAll('settings');
    let rec = settings.find(s => s.id==='csvMappings');
    if(!rec){ rec = { id:'csvMappings', partners:{}, contacts:{} }; }
    rec[kind] = mapping; await dbPut('settings', rec);
    toast('Saved default mapping for ' + kind);
  }

  function mapIndex(headers){ const m={}; headers.forEach((h,i)=>{ m[h]=i; m[h.trim()]=i; m[lc(h)]=i; }); return m; }
  function lcMapHeaders(headers){ const map = {}; headers.forEach(h => map[String(h||'').toLowerCase()] = h); return map; }
  function resolveAutoMapping(headers, required, kind, initMap){
    const hmap = lcMapHeaders(headers);
    const aliases = (window.CSV_PRESETS && window.CSV_PRESETS.headerAliases && window.CSV_PRESETS.headerAliases[kind]) || {};
    const m = {};
    const used = new Set();

    function pick(headerGuess){
      if(!headerGuess) return null;
      const real = hmap[String(headerGuess).toLowerCase()] || null;
      if(real && !used.has(real)){ used.add(real); return real; }
      return null;
    }

    for(const key of required){
      const guess = initMap && initMap[key];
      const chosen = pick(guess);
      if(chosen) m[key] = chosen;
    }
    for(const key of required){
      if(m[key]) continue;
      const chosen = pick(key);
      if(chosen) m[key] = chosen;
    }
    for(const key of required){
      if(m[key]) continue;
      const arr = aliases[key] || [];
      for(const alias of arr){
        const chosen = pick(alias);
        if(chosen){ m[key] = chosen; break; }
      }
    }

    const missing = required.filter(k => !m[k]);
    return { mapping: m, missing };
  }

  async function ensureNonePartner(){
    if (window.IMPORT_HELPERS && typeof window.IMPORT_HELPERS.ensureNonePartner === 'function') {
      await window.IMPORT_HELPERS.ensureNonePartner();
      return;
    }
    const partners = await dbGetAll('partners');
    if(!partners.find(p => p.id === NONE_PARTNER_ID || lc(p.name)==='none')){
      await dbPut('partners', { id: NONE_PARTNER_ID, name:'None', company:'', email:'', phone:'', tier:'Keep in Touch' });
    }
  }

  async function readCSV(file){
    const txt = await file.text();
    const rows = []; let cur=""; let q=false; const row=[];
    const push=()=>{ row.push(cur); cur=""; };
    const finish=()=>{ rows.push(row.slice()); row.length=0; };
    for(let i=0;i<txt.length;i++){
      const ch = txt[i];
      if(q){
        if(ch === '"' && txt[i+1] === '"'){ cur+='"'; i++; }
        else if(ch === '"'){ q=false; }
        else { cur += ch; }
      } else {
        if(ch === '"'){ q=true; }
        else if(ch === ','){ push(); }
        else if(ch === '\n'){ push(); finish(); }
        else if(ch === '\r'){ /*ignore*/ }
        else { cur += ch; }
      }
    }
    if(cur.length || row.length){ push(); finish(); }
    const headers = rows.shift() || [];
    return { headers, rows };
  }

  function stablePartnerId(name, company, email){
    const s = [name,company,email].map(x=>lc(x)).join('|');
    let h = 0; for(let i=0;i<s.length;i++){ h = (h*33 + s.charCodeAt(i))>>>0; }
    return 'pid_' + h.toString(16).padStart(8,'0') + '_auto';
  }

  async function importPartners(rows, headers, mode, mapping){
    ensureNoTruncatedCommit(headers);
    const idx = mapIndex(headers);
    const req = new Set(REQ_PARTNER);
    const col = (key) => mapping[key] && (idx[mapping[key]]!==undefined) ? idx[mapping[key]] : idx[key];
    const clampStats = { count: 0 };

    if(mode==='replace'){ await dbClear('partners'); }
    await ensureNonePartner();

    const existing = mode==='replace' ? [] : await dbGetAll('partners');
    const index = createIndex(existing, buildPartnerKeys);
    const upserts = [];

    for(const r of rows){
      const idRaw = canon(r[col('partnerId')]||'');
      const baseRecord = {
        id: idRaw || undefined,
        partnerId: idRaw || undefined,
        name: canon(r[col('name')]||''),
        company: canon(r[col('company')]||''),
        email: canon(r[col('email')]||''),
        phone: canon(r[col('phone')]||''),
        tier: canon(r[col('tier')]||'') || 'Developing',
        partnerType: canon(r[col('partnerType')]||''),
        focus: canon(r[col('focus')]||''),
        priority: canon(r[col('priority')]||''),
        preferredContact: canon(r[col('preferredContact')]||''),
        cadence: canon(r[col('cadence')]||''),
        address: canon(r[col('address')]||''),
        city: canon(r[col('city')]||''),
        state: canon(r[col('state')]||''),
        zip: canon(r[col('zip')]||''),
        referralVolume: canon(r[col('referralVolume')]||''),
        lastTouch: canon(r[col('lastTouch')]||''),
        nextTouch: canon(r[col('nextTouch')]||''),
        relationshipOwner: canon(r[col('relationshipOwner')]||''),
        collaborationFocus: canon(r[col('collaborationFocus')]||''),
        notes: canon(r[col('notes')]||''),
        extras: {}
      };
      headers.forEach(h => {
        if(!req.has(h)){
          const v = canon(r[idx[h]]||'');
          if(v) baseRecord.extras[h] = v;
        }
      });
      const incoming = clampPartner(baseRecord, clampStats);
      incoming._dedupeKeys = buildPartnerKeys(incoming);

      if(mode==='replace'){
        upserts.push(incoming);
        registerRecord(incoming, index, buildPartnerKeys);
        continue;
      }

      const existingMatch = pickExisting(incoming, index);
      if(existingMatch){
        const merged = mergePartnerRecord(existingMatch, incoming);
        merged._dedupeKeys = buildPartnerKeys(merged);
        upserts.push(merged);
        registerRecord(merged, index, buildPartnerKeys);
      }else{
        const id = incoming.id || incoming.partnerId || stablePartnerId(incoming.name, incoming.company, incoming.email);
        incoming.id = incoming.partnerId = id;
        incoming.updatedAt = Date.now();
        incoming._dedupeKeys = buildPartnerKeys(incoming);
        upserts.push(incoming);
        registerRecord(incoming, index, buildPartnerKeys);
      }
    }

    if(upserts.length) await dbBulkPut('partners', upserts);
    if(upserts.length) emitImportChanged('partners');
    return { partners: upserts.length, clamped: clampStats.count };
  }

  async function importContacts(rows, headers, mode, mapping){
    ensureNoTruncatedCommit(headers);
    const idx = mapIndex(headers);
    const req = new Set(REQ_CONTACT);
    const col = (key) => mapping[key] && (idx[mapping[key]]!==undefined) ? idx[mapping[key]] : idx[key];
    const clampStats = { count: 0 };

    if(mode==='replace'){ await dbClear('contacts'); }

    const partners = await dbGetAll('partners');
    const pmap = new Map(partners.map(p=>[p.id, p]));

    const existing = mode==='replace' ? [] : await dbGetAll('contacts');
    const index = createIndex(existing, buildContactKeys);
    const upserts = [];
    const toCreatePartners = [];

    for(const r of rows){
      const id = canon(r[col('contactId')]||'');
      if(!id && mode==='merge') continue;
      const base = {
        id: id || undefined,
        contactId: id || undefined,
        first: canon(r[col('first')]||''), last: canon(r[col('last')]||''),
        preferredName: canon(r[col('preferredName')]||''),
        email: canon(r[col('email')]||''), phone: canon(r[col('phone')]||''),
        address: canon(r[col('address')]||''), city: canon(r[col('city')]||''), state: canon(r[col('state')]||''), zip: canon(r[col('zip')]||''),
        referredBy: canon(r[col('referredBy')]||''), loanType: canon(r[col('loanType')]||''), stage: normalizeStageValue(r[col('stage')]||''),
        loanAmount: Number(canon(r[col('loanAmount')]||'0').replace(/[^0-9.-]/g,''))||0, rate: Number(canon(r[col('rate')]||'0'))||0,
        fundedDate: canon(r[col('fundedDate')]||''), status: canon(r[col('status')]||''),
        notes: canon(r[col('notes')]||''),
        nextFollowUp: canon(r[col('nextFollowUp')]||''),
        expectedClosing: canon(r[col('expectedClosing')]||''),
        pipelineMilestone: canon(r[col('pipelineMilestone')]||''),
        leadSource: canon(r[col('leadSource')]||''),
        loanProgram: canon(r[col('loanProgram')]||''),
        preApprovalExpires: canon(r[col('preApprovalExpires')]||''),
        birthday: canon(r[col('birthday')]||''),
        anniversary: canon(r[col('anniversary')]||''),
        extras: {}
      };

      function resolve(idKey, nameKey, compKey, emailKey, phoneKey){
        const pid = canon(r[col(idKey)]||'');
        if(pid && pmap.has(pid)) return pid;
        const nm = canon(r[col(nameKey)]||''); const co = canon(r[col(compKey)]||''); const em = canon(r[col(emailKey)]||''); const ph = canon(r[col(phoneKey)]||'');
        if(!nm) return NONE_PARTNER_ID;
        const gen = stablePartnerId(nm, co, em);
        if(!pmap.has(gen)){
          const rec = { id: gen, name:nm, company:co, email:em, phone:ph, tier:'Developing' };
          pmap.set(gen, rec); toCreatePartners.push(rec);
        }
        return gen;
      }
      base.buyerPartnerId   = resolve('buyerPartnerId','buyerPartnerName','buyerPartnerCompany','buyerPartnerEmail','buyerPartnerPhone');
      base.listingPartnerId = resolve('listingPartnerId','listingPartnerName','listingPartnerCompany','listingPartnerEmail','listingPartnerPhone');

      headers.forEach(h => {
        if(!req.has(h)){
          const v = canon(r[idx[h]]||'');
          if(v) base.extras[h] = v;
        }
      });

      const incoming = clampContact(base, clampStats);
      incoming._dedupeKeys = buildContactKeys(incoming);

      if(mode==='replace'){
        incoming.updatedAt = Date.now();
        upserts.push(incoming);
        registerRecord(incoming, index, buildContactKeys);
        continue;
      }

      const existingMatch = pickExisting(incoming, index);
      if(existingMatch){
        const merged = mergeContactRecord(existingMatch, incoming);
        merged._dedupeKeys = buildContactKeys(merged);
        upserts.push(merged);
        registerRecord(merged, index, buildContactKeys);
      }else{
        const idFinal = incoming.id || incoming.contactId || String(Date.now()+Math.random());
        incoming.id = incoming.contactId = idFinal;
        incoming.updatedAt = Date.now();
        incoming._dedupeKeys = buildContactKeys(incoming);
        upserts.push(incoming);
        registerRecord(incoming, index, buildContactKeys);
      }
    }

    if(toCreatePartners.length) await dbBulkPut('partners', toCreatePartners);
    if(upserts.length) await dbBulkPut('contacts', upserts);
    if(upserts.length || toCreatePartners.length) emitImportChanged('contacts');
    return { contacts: upserts.length, partnersAutocreated: toCreatePartners.length, clamped: clampStats.count };
  }

  function makeMappingUI(headers, required, initialMapping, resolved){
    const opts = headers.map(h => `<option value="${h}">${h}</option>`).join('');
    return required.filter(key => !(resolved && resolved[key])).map(key => {
      const preferred = (initialMapping&&initialMapping[key]) || '';
      const sel = headers.includes(preferred) ? preferred : (headers.find(h => h.toLowerCase()===key.toLowerCase()) || "");
      return `<label style="display:block;margin:6px 0">
        <div class="muted" style="font-size:12px">${key}</div>
        <select data-map="${key}">
          <option value="">${STR['importer.placeholder.choose-column']}</option>
          ${opts}
        </select>
      </label>
      <script>document.currentScript.previousElementSibling.querySelector('select').value=${JSON.stringify(sel)};</script>`;
    }).join('');
  }

  function collectMapping(container){
    const map = {};
    container.querySelectorAll('select[data-map]').forEach(sel => {
      const key = sel.getAttribute('data-map');
      const val = sel.value;
      if(val) map[key] = val;
    });
    return map;
  }

  function renderClampNote(count){
    if(!count) return '';
    return `<div class="muted" style="margin-top:4px">clamped fields: ${count}</div>`;
  }

  function openImporterDialog(){
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <div class="dlg">
        <div class="row" style="align-items:center">
          <h3 class="grow">${text('importer.title')}</h3>
          <button class="btn" id="imp-close">${STR['general.close']}</button>
        </div>
        <div class="card" style="margin-top:8px">
          <strong title="${text('tooltip.pipeline')}">${text('importer.mode.label')}</strong>
          <label class="switch"><input type="radio" name="imp-mode" value="merge" checked> <span title="${text('importer.mode.merge-tooltip')}">${text('importer.mode.merge')}</span></label>
          <label class="switch"><input type="radio" name="imp-mode" value="replace"> <span title="${text('importer.mode.replace-tooltip')}">${text('importer.mode.replace')}</span></label>
        </div>

        <div class="card" style="margin-top:8px">
          <strong title="${text('importer.tooltip.partners')}">${text('importer.step.partners')}</strong>
          <div class="muted">${text('importer.step.description')}</div>
          <input id="csv-partners" type="file" accept=".csv,text/csv" style="margin-top:8px">
          <div id="map-partners" style="margin-top:8px"></div>
          <div id="imp-p-status" class="muted" style="margin-top:6px"></div>
          <div class="row" style="justify-content:flex-end;margin-top:8px">
            <button class="btn brand" id="imp-partners" disabled>${text('importer.button.import-partners')}</button>
          </div>
        </div>

        <div class="card" style="margin-top:8px">
          <strong title="${text('importer.tooltip.contacts')}">${text('importer.step.contacts')}</strong>
          <div class="muted">${text('importer.step.description')}</div>
          <input id="csv-contacts" type="file" accept=".csv,text/csv" style="margin-top:8px">
          <div id="map-contacts" style="margin-top:8px"></div>
          <div id="imp-c-status" class="muted" style="margin-top:6px"></div>
          <div class="row" style="justify-content:flex-end;margin-top:8px">
            <button class="btn brand" id="imp-contacts" disabled>${text('importer.button.import-contacts')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#imp-close').onclick = ()=> dlg.close();
    dlg.showModal();

    function onFileChange(kind){
      return async (e)=>{
        const file = e.target.files?.[0]; if(!file) return;
        const mode = dlg.querySelector('input[name="imp-mode"]:checked').value;
        const {headers, rows} = await readCSV(file);
        const container = dlg.querySelector(kind==='partners' ? '#map-partners' : '#map-contacts');
        const statusEl = kind==='partners' ? dlg.querySelector('#imp-p-status') : dlg.querySelector('#imp-c-status');
        const actionButton = dlg.querySelector(kind==='partners' ? '#imp-partners' : '#imp-contacts');
        const truncated = findTruncatedHeaders(headers);
        if(truncated.length){
          const msg = text('importer.error.truncated-header', { headers: truncated.join(', ') });
          if(statusEl) statusEl.innerHTML = `<span style="color:#b91c1c">${msg}</span>`;
          if(container) container.innerHTML = '';
          if(actionButton){ actionButton.disabled = true; actionButton.onclick = null; }
          return;
        }
        const required = (kind==='partners') ? REQ_PARTNER : REQ_CONTACT;
        const initMap = await loadDefaultMapping(kind);
        const { mapping: autoMap, missing } = resolveAutoMapping(headers, required, kind, initMap);
        const detected = text('importer.status.mapping-help', { count: headers.length });
        const autoMapped = missing.length===0 ? `<div class="badge-pill" style="margin-top:6px">${text('importer.status.auto-map-note')}</div>` : '';
        container.innerHTML = `
          <div class="muted" style="margin-bottom:6px">${detected}</div>
          <div class="grid cols-2">${makeMappingUI(headers, required, initMap, autoMap)}</div>
          ${autoMapped}
          <div class="row" style="justify-content:space-between;margin-top:8px">
            <div class="muted">${text('importer.status.defaults-preselected')}</div>
            <div><button class="btn" id="save-map-${kind}">${text('importer.button.save-default')}</button></div>
          </div>`;
        if(actionButton) actionButton.disabled = false;
        if(statusEl) statusEl.innerHTML = '';

        const saveBtn = dlg.querySelector('#save-map-' + kind);
        if(saveBtn){ saveBtn.onclick = async ()=>{ const m = collectMapping(container); await saveDefaultMapping(kind, { autoMap, m }); }; }

        if(actionButton) actionButton.onclick = async ()=>{
          try{
            const userMap = collectMapping(container);
            const mapping = Object.assign({}, autoMap, userMap);
            const missing = required.filter(k => !mapping[k]);
            if(missing.length){
              const msg = text('importer.error.missing-mapping', { fields: missing.join(', ') });
              if(statusEl) statusEl.innerHTML = `<span style="color:#b91c1c">${msg}</span>`;
              return;
            }
            const res = (kind==='partners')
              ? await importPartners(rows, headers, mode, mapping)
              : await importContacts(rows, headers, mode, mapping);
            const count = res.partners || res.contacts || 0;
            const extra = res.partnersAutocreated ? text('general.auto-created-partners', { count: res.partnersAutocreated }) : '';
            const summary = extra
              ? text('importer.status.imported-with-auto', { count, extra })
              : text('importer.status.imported', { count });
            const clampNote = renderClampNote(res.clamped || 0);
            if(statusEl) statusEl.innerHTML = `${summary}${clampNote}`;
            if(kind==='contacts') dlg.close();
          }catch(err){
            if(err && err.code === 'IMPORT_TRUNCATED_HEADERS'){
              const msg = err.message || text('importer.error.truncated-header', { headers: (err.truncatedHeaders||[]).join(', ') });
              if(statusEl) statusEl.innerHTML = `<span style="color:#b91c1c">${msg}</span>`;
              return;
            }
            const msg = text('importer.status.error', { message: String(err.message||err) });
            if(statusEl) statusEl.innerHTML = `<span style="color:#b91c1c">${msg}</span>`;
          }
        };
      };
    }

    dlg.querySelector('#csv-partners').addEventListener('change', onFileChange('partners'));
    dlg.querySelector('#csv-contacts').addEventListener('change', onFileChange('contacts'));
  }

  function downloadBlankTemplate(kind){
    const headers = kind==='partners' ? PARTNER_TEMPLATE_FIELDS : CONTACT_TEMPLATE_FIELDS;
    const csv = headers.join(',') + '\n';
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm_${kind}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-csv-import').addEventListener('click', openImporterDialog);
  const templateBtn = document.getElementById('btn-download-csv-template');
  if(templateBtn){
    templateBtn.addEventListener('click', ()=>{
      const select = document.getElementById('csv-template-kind');
      const kind = (select && select.value === 'partners') ? 'partners' : 'contacts';
      downloadBlankTemplate(kind);
    });
  }
})();
}

/* P6d: import orchestrator v5 */
(function(){
  if (window.__IMPORT_ORCH_V5__) return; window.__IMPORT_ORCH_V5__ = true;

  async function runImportV5({ partnersRows = [], contactsRows = [] }){
    const audit = { orphans: [] };
    const partnersApi = window.ImportPartnersV5;
    const contactsApi = window.ImportContactsV5;
    if (!partnersApi?.upsertPartner || !contactsApi?.upsertContact) {
      throw new Error('Import V5 dependencies unavailable');
    }
    // Partners first
    for (const r of partnersRows) await partnersApi.upsertPartner(r, audit);

    // Contacts second
    for (const r of contactsRows){
      // if explicit partnerId fields refer to unknown ids, log orphan
      if (r.buyerPartnerId){
        const buyer = typeof window.dbGet === 'function'
          ? await window.dbGet('partners', r.buyerPartnerId)
          : await window.db?.get?.('partners', r.buyerPartnerId);
        if (!buyer) audit.orphans.push({ type:'buyerPartnerId', contact:r });
      }
      if (r.listingPartnerId){
        const listing = typeof window.dbGet === 'function'
          ? await window.dbGet('partners', r.listingPartnerId)
          : await window.db?.get?.('partners', r.listingPartnerId);
        if (!listing) audit.orphans.push({ type:'listingPartnerId', contact:r });
      }
      await contactsApi.upsertContact(r, audit);
    }

    window.dispatchAppDataChanged?.("import:v5:complete");
    return audit;
  }

  function downloadAudit(audit){
    if (!audit || !audit.orphans?.length) return;
    const blob = new Blob([JSON.stringify(audit,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`import_audit_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  window.ImportV5 = { runImportV5, downloadAudit };
})();
