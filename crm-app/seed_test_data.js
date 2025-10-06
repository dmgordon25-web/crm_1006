/**
 * seed_test_data.js — deterministic, idempotent seeding for local IndexedDB.
 * Generates a configurable data set that covers the pipeline, loan types, and
 * partner scenarios without relying on non-deterministic clocks.
 */
(function(root){
  const globalScope = root || (typeof window !== 'undefined' ? window : globalThis);
  const NONE_PARTNER_ID = globalScope.NONE_PARTNER_ID || '00000000-0000-none-partner-000000000000';

  const RNG_NAMESPACE = 'crmtool:seed:v2';
  const BASE_TIMESTAMP = Date.UTC(2024, 7, 1); // 2024-08-01
  const DAY = 86400000;
  const HOUR = 3600000;

  const STAGE_DEFS = [
    { key: 'application', label: 'Application' },
    { key: 'preapproved', label: 'Pre-Approved' },
    { key: 'processing', label: 'Processing' },
    { key: 'underwriting', label: 'Underwriting' },
    { key: 'approved', label: 'Approved' },
    { key: 'cleared-to-close', label: 'CTC' },
    { key: 'funded', label: 'Funded' }
  ];

  const STAGE_ALIAS = {
    application: 'application',
    app: 'application',
    'new application': 'application',
    preapproved: 'preapproved',
    'pre approved': 'preapproved',
    'pre-approved': 'preapproved',
    'pre approval': 'preapproved',
    'pre-app': 'preapproved',
    'pre app': 'preapproved',
    processing: 'processing',
    process: 'processing',
    'in processing': 'processing',
    underwriting: 'underwriting',
    uw: 'underwriting',
    approved: 'approved',
    approval: 'approved',
    'ctc': 'cleared-to-close',
    'cleared to close': 'cleared-to-close',
    'cleared-to-close': 'cleared-to-close',
    'clear to close': 'cleared-to-close',
    'clear-to-close': 'cleared-to-close',
    funded: 'funded',
    funding: 'funded',
    'funded/closed': 'funded'
  };

  const LOAN_TYPES = ['Conventional', 'FHA', 'VA', 'Jumbo'];

  const FIRST_NAMES = ['Avery','Charlie','Dakota','Elliot','Finley','Harper','Jordan','Kai','Logan','Morgan','Peyton','Reese','Rowan','Sawyer','Skyler'];
  const LAST_NAMES = ['Adler','Bennett','Cameron','Dalton','Ellis','Finch','Grayson','Hayes','Iverson','Jensen','Kensington','Lang','Monroe','Prescott','Quinn'];
  const SOURCES = ['Referral','Website','Open House','Walk-In','Past Client','Agent Referral'];
  const DOC_TEMPLATES = ['1003','Credit Report','VOE','Appraisal'];

  const PARTNERS = [
    { id: 'partner-001', name: 'Alpine Realty', company: 'Alpine Realty', email: 'alpine@partners.test', phone: '555-201-0001', tier: 'Core' },
    { id: 'partner-002', name: 'Summit Escrow', company: 'Summit Escrow', email: 'summit@partners.test', phone: '555-201-0002', tier: 'Preferred' },
    { id: 'partner-003', name: 'Blue Sky Insurance', company: 'Blue Sky Insurance', email: 'bluesky@partners.test', phone: '555-201-0003', tier: 'Strategic' },
    { id: 'partner-004', name: 'Evergreen Title', company: 'Evergreen Title', email: 'evergreen@partners.test', phone: '555-201-0004', tier: 'Core' },
    { id: 'partner-005', name: 'Metro Inspectors', company: 'Metro Inspectors', email: 'metro@partners.test', phone: '555-201-0005', tier: 'Developing' },
    { id: 'partner-006', name: 'Lakeside Appraisals', company: 'Lakeside Appraisals', email: 'lakeside@partners.test', phone: '555-201-0006', tier: 'Preferred' }
  ];

  const DEFAULT_OPTIONS = {
    count: 60,
    includeCelebrations: true,
    stages: STAGE_DEFS.map(def => def.key),
    loanTypes: LOAN_TYPES.slice(),
    partners: { buyer: true, listing: true },
    seed: null
  };

  function hashString(input){
    const text = String(input == null ? '' : input);
    let hash = 0x811c9dc5;
    for(let i = 0; i < text.length; i++){
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
      hash >>>= 0;
    }
    return hash >>> 0;
  }

  function mulberry32(seed){
    let state = seed >>> 0;
    return function(){
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function createRng(seedInput){
    if(seedInput == null) return mulberry32(hashString(RNG_NAMESPACE));
    if(typeof seedInput === 'number' && Number.isFinite(seedInput)){
      return mulberry32(seedInput >>> 0);
    }
    return mulberry32(hashString(seedInput));
  }

  function pad(number, size){
    const str = String(number);
    if(str.length >= size) return str;
    return '0'.repeat(size - str.length) + str;
  }

  function toYMD(timestamp){
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function stageLabelFromKey(key){
    const match = STAGE_DEFS.find(def => def.key === key);
    if(match) return match.label;
    if(typeof globalScope.stageLabelFromKey === 'function'){
      return globalScope.stageLabelFromKey(key);
    }
    return key;
  }

  function normalizeStage(value){
    if(value == null) return 'processing';
    if(typeof globalScope.stageKeyFromLabel === 'function'){
      const resolved = globalScope.stageKeyFromLabel(value);
      if(resolved) return resolved;
    }
    const raw = String(value).trim();
    if(!raw) return 'processing';
    const lowered = raw.toLowerCase();
    if(STAGE_ALIAS[lowered]) return STAGE_ALIAS[lowered];
    const direct = STAGE_DEFS.find(def => def.label.toLowerCase() === lowered);
    if(direct) return direct.key;
    return STAGE_ALIAS[lowered.replace(/[^a-z0-9]+/g, ' ')] || 'processing';
  }

  function normalizeLoanType(value){
    if(value == null) return null;
    const raw = String(value).trim();
    if(!raw) return null;
    const upper = raw.toUpperCase();
    if(upper === 'FHA' || upper === 'VA') return upper;
    if(upper === 'JUMBO') return 'Jumbo';
    if(raw.toLowerCase() === 'conventional') return 'Conventional';
    const match = LOAN_TYPES.find(type => type.toLowerCase() === raw.toLowerCase());
    return match || null;
  }

  function normalizePartners(input){
    const defaults = { buyer: true, listing: true };
    if(!input || typeof input !== 'object') return defaults;
    return {
      buyer: input.buyer === undefined ? defaults.buyer : !!input.buyer,
      listing: input.listing === undefined ? defaults.listing : !!input.listing
    };
  }

  function uniqueOrdered(values){
    const seen = new Set();
    const result = [];
    values.forEach(value => {
      if(!seen.has(value)){
        seen.add(value);
        result.push(value);
      }
    });
    return result;
  }

  function normalizeStageList(list){
    const requested = Array.isArray(list) ? list : DEFAULT_OPTIONS.stages;
    const normalized = uniqueOrdered(requested.map(normalizeStage).filter(Boolean));
    if(normalized.length) return normalized;
    return DEFAULT_OPTIONS.stages.slice();
  }

  function normalizeLoanList(list){
    const requested = Array.isArray(list) ? list : DEFAULT_OPTIONS.loanTypes;
    const normalized = uniqueOrdered(requested.map(normalizeLoanType).filter(Boolean));
    if(normalized.length) return normalized;
    return DEFAULT_OPTIONS.loanTypes.slice();
  }

  function normalizeOptions(options){
    const input = options && typeof options === 'object' ? options : {};
    let count = Number(input.count);
    if(!Number.isFinite(count) || count <= 0) count = DEFAULT_OPTIONS.count;
    count = Math.max(1, Math.round(count));

    const includeCelebrations = input.includeCelebrations === undefined
      ? DEFAULT_OPTIONS.includeCelebrations
      : !!input.includeCelebrations;

    const stages = normalizeStageList(input.stages);
    const loanTypes = normalizeLoanList(input.loanTypes);
    const partners = normalizePartners(input.partners || input);

    let seed = input.seed;
    if(seed != null && seed !== '') seed = String(seed);
    else seed = null;

    return {
      count,
      includeCelebrations,
      stages,
      loanTypes,
      partners,
      seed
    };
  }

  function computeSeed(normalized){
    if(normalized.seed != null) return normalized.seed;
    const payload = JSON.stringify({
      namespace: RNG_NAMESPACE,
      count: normalized.count,
      includeCelebrations: normalized.includeCelebrations,
      stages: normalized.stages,
      loanTypes: normalized.loanTypes,
      partners: normalized.partners
    });
    return hashString(payload);
  }

  function pick(list, rng){
    if(!list.length) return null;
    const index = Math.floor(rng() * list.length);
    return list[index];
  }

  function statusForStage(stageKey){
    if(stageKey === 'funded') return 'client';
    return 'inprogress';
  }

  function partnerFor(index, rng){
    if(!PARTNERS.length) return null;
    return PARTNERS[(index + Math.floor(rng() * PARTNERS.length)) % PARTNERS.length];
  }

  function buildDataset(options){
    const normalized = normalizeOptions(options);
    const rng = createRng(computeSeed(normalized));
    const dataset = {
      contacts: [],
      tasks: [],
      documents: [],
      deals: [],
      commissions: []
    };

    for(let i = 0; i < normalized.count; i++){
      const seq = i + 1;
      const contactId = `seed-contact-${pad(seq, 4)}`;
      const stageKey = normalized.stages[i % normalized.stages.length];
      const loanType = normalized.loanTypes[i % normalized.loanTypes.length];
      const stageLabel = stageLabelFromKey(stageKey);
      const first = pick(FIRST_NAMES, rng) || 'Taylor';
      const last = pick(LAST_NAMES, rng) || 'Reed';
      const name = `${first} ${last}`;
      const loanAmount = 225000 + Math.round(rng() * 275000 / 1000) * 1000;
      const createdAt = BASE_TIMESTAMP - (seq * DAY);
      const stageAnchor = BASE_TIMESTAMP - (seq * (DAY / 2));
      const updatedAt = BASE_TIMESTAMP + (seq * HOUR);
      const buyerPartner = partnerFor(i, rng);
      const listingPartner = partnerFor(i + 7, rng);
      const source = pick(SOURCES, rng) || 'Referral';

      const contact = {
        id: contactId,
        first,
        last,
        name,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${pad(seq, 3)}@demo.crm.test`,
        phone: `555-01${pad((seq * 7) % 100, 2)}-${pad((seq * 37) % 10000, 4)}`,
        createdAt,
        updatedAt,
        stage: stageKey,
        stageEnteredAt: new Date(stageAnchor).toISOString(),
        stageUpdatedAt: new Date(stageAnchor + (HOUR * 6)).toISOString(),
        status: statusForStage(stageKey),
        loanType,
        loanAmount,
        amount: loanAmount,
        rate: Number((2.75 + rng() * 2).toFixed(3)),
        source,
        buyerPartnerId: normalized.partners.buyer && buyerPartner ? buyerPartner.id : NONE_PARTNER_ID,
        listingPartnerId: normalized.partners.listing && listingPartner ? listingPartner.id : NONE_PARTNER_ID,
        referredBy: normalized.partners.buyer && buyerPartner ? buyerPartner.name : 'Self-Generated'
      };

      if(normalized.includeCelebrations){
        contact.birthday = toYMD(BASE_TIMESTAMP - ((seq * 3) + 120) * DAY);
        contact.anniversary = toYMD(BASE_TIMESTAMP - ((seq * 2) + 90) * DAY);
      }

      if(stageKey === 'funded'){
        const fundedDate = toYMD(stageAnchor - DAY);
        contact.fundedDate = fundedDate;
        contact.closingDate = fundedDate;
        contact.commissionReceived = Math.round(loanAmount * 0.008);
      }else if(stageKey === 'cleared-to-close'){
        contact.expectedClosing = toYMD(stageAnchor + (7 * DAY));
      }else if(stageKey === 'approved'){
        contact.approvalDate = toYMD(stageAnchor - (2 * DAY));
      }

      dataset.contacts.push(contact);

      const dealId = `seed-deal-${pad(seq, 4)}`;
      dataset.deals.push({
        id: dealId,
        contactId,
        name: `${stageLabel} - ${name}`,
        loanType,
        closingDate: toYMD(stageAnchor + (14 * DAY)),
        updatedAt
      });

      dataset.commissions.push({
        id: `seed-commission-${pad(seq, 4)}`,
        contactId,
        amount: loanAmount,
        bps: 175,
        gross: Math.round(loanAmount * 0.0175),
        loPay: Math.round(loanAmount * 0.009),
        house: Math.round(loanAmount * 0.0085),
        updatedAt
      });

      const baseDue = stageAnchor + (3 * DAY);
      const followUpTitle = `Pipeline touch (${stageLabel})`;
      dataset.tasks.push({
        id: `seed-task-${pad(seq, 4)}-a`,
        contactId,
        title: followUpTitle,
        due: toYMD(baseDue),
        done: stageKey === 'funded' && (seq % 2 === 0),
        updatedAt
      });
      dataset.tasks.push({
        id: `seed-task-${pad(seq, 4)}-b`,
        contactId,
        title: `Document chase ${pad(seq, 2)}`,
        due: toYMD(baseDue + DAY),
        done: stageKey === 'funded' && (seq % 3 === 0),
        updatedAt
      });

      DOC_TEMPLATES.forEach((template, idx) => {
        const status = stageKey === 'funded'
          ? 'Received'
          : (idx % 3 === 0 ? 'Received' : idx % 3 === 1 ? 'Requested' : 'In Review');
        dataset.documents.push({
          id: `seed-doc-${pad(seq, 4)}-${idx + 1}`,
          contactId,
          name: template,
          status,
          updatedAt
        });
      });
    }

    return { dataset, normalized };
  }

  async function clearStores(stores){
    for(const store of stores){
      if(typeof globalScope.dbClear === 'function'){
        await globalScope.dbClear(store);
      }
    }
  }

  async function bulkPut(store, rows){
    if(!rows.length) return;
    if(typeof globalScope.dbBulkPut === 'function'){
      await globalScope.dbBulkPut(store, rows);
      return;
    }
    if(typeof globalScope.dbPut === 'function'){
      for(const row of rows){
        await globalScope.dbPut(store, row);
      }
    }
  }

  async function ensureNonePartner(){
    if(typeof globalScope.openDB === 'function'){
      await globalScope.openDB();
    }
    try{
      const existing = typeof globalScope.dbGet === 'function'
        ? await globalScope.dbGet('partners', NONE_PARTNER_ID)
        : null;
      if(existing) return existing;
    }catch(_err){ /* ignore */ }
    const record = {
      id: NONE_PARTNER_ID,
      name: 'None',
      company: '',
      email: '',
      phone: '',
      tier: 'Keep in Touch',
      updatedAt: BASE_TIMESTAMP - (10 * DAY)
    };
    if(typeof globalScope.dbPut === 'function'){
      await globalScope.dbPut('partners', record);
    }
    return record;
  }

  function emitChange(){
    const detail = { source: 'seed' };
    if(typeof globalScope.dispatchAppDataChanged === 'function'){
      globalScope.dispatchAppDataChanged(detail);
    }else if(typeof console !== 'undefined' && console && typeof console.error === 'function'){
      console.error('seedTestData: dispatchAppDataChanged missing; data change event not emitted.', detail);
    }
  }

  function looksLikeDb(candidate){
    return candidate && typeof candidate === 'object' && typeof candidate.transaction === 'function';
  }

  function parseArgs(first, second){
    let options = {};
    let db = null;
    if(looksLikeDb(first)){
      db = first;
    }else if(first && typeof first === 'object'){
      options = first;
      if(looksLikeDb(second)) db = second;
    }
    return { options, db };
  }

  async function runSeed(rawOptions, providedDb){
    let db = providedDb;
    if(!db && typeof globalScope.openDB === 'function'){
      db = await globalScope.openDB();
    }
    if(!db) throw new Error('DB not ready');

    const stores = (globalScope.DB_META && Array.isArray(globalScope.DB_META.STORES))
      ? globalScope.DB_META.STORES
      : ['partners','contacts','tasks','documents','deals','commissions'];
    const targetStores = stores.filter(store => ['partners','contacts','tasks','documents','deals','commissions'].includes(store));
    await clearStores(targetStores);

    const { dataset, normalized } = buildDataset(rawOptions);
    const nonePartner = await ensureNonePartner();
    const partnerTimestamp = BASE_TIMESTAMP - (5 * DAY);
    const partnerRows = [nonePartner].concat(PARTNERS.map(partner => Object.assign({ updatedAt: partnerTimestamp }, partner)));

    await bulkPut('partners', partnerRows);
    await bulkPut('contacts', dataset.contacts);
    await bulkPut('tasks', dataset.tasks);
    await bulkPut('documents', dataset.documents);
    await bulkPut('deals', dataset.deals);
    await bulkPut('commissions', dataset.commissions);

    emitChange();

    if(typeof globalScope.toast === 'function'){
      globalScope.toast(`Seeded ${normalized.count} demo contact${normalized.count === 1 ? '' : 's'}.`);
    }else if(typeof alert === 'function'){
      try{ alert('Seed complete'); }catch(_err){ /* noop */ }
    }

    return normalized;
  }

  const SeedDemoData = {
    DEFAULT_OPTIONS: Object.freeze(JSON.parse(JSON.stringify(DEFAULT_OPTIONS))),
    normalizeOptions,
    normalizeStage,
    buildDataset(options){
      return buildDataset(options).dataset;
    }
  };

  globalScope.seedTestData = async function(){
    const parsed = parseArgs(arguments[0], arguments[1]);
    try{
      return await runSeed(parsed.options, parsed.db);
    }catch(error){
      if(typeof console !== 'undefined' && console && typeof console.error === 'function'){
        console.error('seedTestData', error);
      }
      if(typeof alert === 'function'){
        try{ alert('Seeding failed: ' + (error && error.message ? error.message : error)); }catch(_err){ /* noop */ }
      }
      throw error;
    }
  };

  globalScope.SeedDemoData = SeedDemoData;

  if(typeof module !== 'undefined' && module && module.exports){
    module.exports = { seedTestData: globalScope.seedTestData, SeedDemoData };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
