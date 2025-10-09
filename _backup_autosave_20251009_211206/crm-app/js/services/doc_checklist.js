const FALLBACK_RULES = {
  FHA: ["1003 Loan Application", "Credit Report", "Photo ID", "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)", "CAIVRS Clear", "Purchase Contract", "Homeowners Insurance", "FHA Case Assignment", "Disclosures Signed"],
  VA: ["1003 Loan Application", "Credit Report", "Photo ID", "COE (Certificate of Eligibility)", "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)", "Purchase Contract", "Homeowners Insurance", "VA Appraisal", "Disclosures Signed"],
  USDA: ["1003 Loan Application", "Credit Report", "Photo ID", "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)", "USDA Eligibility Check", "Purchase Contract", "Homeowners Insurance", "USDA Appraisal", "Disclosures Signed"],
  CONV: ["1003 Loan Application", "Credit Report", "Photo ID", "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)", "Tax Returns (2 yrs if needed)", "Purchase Contract", "Homeowners Insurance", "Appraisal", "Disclosures Signed"],
  REFI: ["1003 Loan Application", "Credit Report", "Photo ID", "Mortgage Statement", "Homeowners Insurance", "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)", "Appraisal (if needed)", "Disclosures Signed"],
  PURCHASE: ["1003 Loan Application", "Credit Report", "Photo ID", "Paystubs (30 days)", "Bank Statements (2 mo.)", "W-2s (2 yrs)", "Purchase Contract", "Homeowners Insurance", "Appraisal", "Disclosures Signed"],
};

const DATE_OPTIONS = { year: 'numeric', month: 'short', day: 'numeric' };

function toId(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str || null;
}

function cloneChecklistItem(item) {
  return {
    label: String(item.label || '').trim(),
    done: Boolean(item.done),
    at: item.done && item.at ? String(item.at) : null,
  };
}

function cloneContact(contact) {
  if (!contact) return null;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(contact); } catch (_) {}
  }
  try { return JSON.parse(JSON.stringify(contact)); } catch (_) {}
  return Object.assign({}, contact);
}

function getFallbackRules(loanType) {
  const key = String(loanType || '').toUpperCase();
  if (key.includes('FHA')) return FALLBACK_RULES.FHA;
  if (key.includes('VA')) return FALLBACK_RULES.VA;
  if (key.includes('USDA')) return FALLBACK_RULES.USDA;
  if (key.includes('REFI')) return FALLBACK_RULES.REFI;
  if (key.includes('PURCHASE')) return FALLBACK_RULES.PURCHASE;
  return FALLBACK_RULES.CONV;
}

function getRulesForLoanType(loanType) {
  try {
    const provider = window.DocCenter?.getSpecFor;
    if (typeof provider === 'function') {
      const spec = provider(loanType);
      if (Array.isArray(spec) && spec.length) {
        return spec.map((item) => String(item || '').trim()).filter(Boolean);
      }
    }
  } catch (_) {}
  return getFallbackRules(loanType);
}

async function getContactFromDb(contactId, db) {
  if (!contactId) return null;
  if (db) {
    try {
      if (typeof db.get === 'function') {
        const record = await db.get('contacts', contactId);
        if (record) return record;
      }
    } catch (_) {}
    try {
      if (typeof db.table === 'function') {
        const table = db.table('contacts');
        if (table && typeof table.get === 'function') {
          const record = await table.get(contactId);
          if (record) return record;
        }
      }
    } catch (_) {}
  }
  if (typeof window.dbGet === 'function') {
    try { return await window.dbGet('contacts', contactId); } catch (_) {}
  }
  if (window.db && typeof window.db.get === 'function') {
    try { return await window.db.get('contacts', contactId); } catch (_) {}
  }
  return null;
}

async function saveContactRecord(record, db) {
  if (!record || !record.id) return;
  if (db) {
    try {
      if (typeof db.put === 'function') {
        await db.put('contacts', record);
        return;
      }
    } catch (_) {}
    try {
      if (typeof db.table === 'function') {
        const table = db.table('contacts');
        if (table && typeof table.put === 'function') {
          await table.put(record);
          return;
        }
      }
    } catch (_) {}
  }
  if (typeof window.dbPut === 'function') {
    await window.dbPut('contacts', record);
    return;
  }
  if (window.db && typeof window.db.put === 'function') {
    await window.db.put('contacts', record);
  }
}

function ensureChecklist(contact, loanType) {
  const rules = getRulesForLoanType(loanType);
  const existing = Array.isArray(contact.docChecklist) ? contact.docChecklist : [];
  const known = new Map();
  existing.forEach((item) => {
    const label = String(item?.label || '').trim();
    if (!label) return;
    known.set(label, cloneChecklistItem(item));
  });

  const merged = [];
  let changed = false;
  rules.forEach((labelRaw) => {
    const label = String(labelRaw || '').trim();
    if (!label) return;
    if (known.has(label)) {
      merged.push(known.get(label));
      known.delete(label);
    } else {
      merged.push({ label, done: false, at: null });
      changed = true;
    }
  });

  known.forEach((item) => {
    merged.push(item);
  });

  if (merged.length !== existing.length) changed = true;
  const serialized = merged.map(cloneChecklistItem);
  contact.docChecklist = serialized;
  return { items: serialized, changed };
}

function formatReceivedDate(iso) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, DATE_OPTIONS);
  } catch (_) {
    return '';
  }
}

function renderChecklist(host, state) {
  if (!host) return;
  host.innerHTML = '';
  const list = state.items || [];
  if (!list.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No required documents.';
    empty.className = 'ce-empty';
    host.appendChild(empty);
    host.__DOC_STATE__ = state;
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach((item) => {
    const li = document.createElement('li');
    li.setAttribute('data-doc-item', item.label);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'ce-check';
    checkbox.checked = !!item.done;
    checkbox.setAttribute('data-doc-toggle', item.label);

    const label = document.createElement('span');
    const dateText = item.done && item.at ? formatReceivedDate(item.at) : '';
    label.textContent = dateText ? `${item.label} — ${dateText}` : item.label;

    li.appendChild(checkbox);
    li.appendChild(label);
    frag.appendChild(li);
  });
  host.appendChild(frag);
  host.__DOC_STATE__ = state;
}

function ensureHostListener(host, contactId) {
  if (!host) return;
  if (typeof window !== 'undefined') {
    if (window.__WIRED_DOCS_FOR === contactId && host.__DOC_TOGGLE_WIRED__) return;
    window.__WIRED_DOCS_FOR = contactId;
  }
  if (host.__DOC_TOGGLE_WIRED__) return;
  host.__DOC_TOGGLE_WIRED__ = true;
  host.addEventListener('change', async (event) => {
    const checkbox = event.target?.closest?.('[data-doc-toggle]');
    if (!checkbox) return;
    const wrapper = checkbox.closest('[data-doc-checklist-host]') || host;
    const state = wrapper.__DOC_STATE__;
    if (!state) return;
    const label = checkbox.getAttribute('data-doc-toggle');
    if (!label) return;
    const entry = state.items.find((item) => item.label === label);
    if (!entry) return;

    const nextDone = !!checkbox.checked;
    checkbox.disabled = true;
    try {
      entry.done = nextDone;
      entry.at = nextDone ? new Date().toISOString() : null;
      state.contact.docChecklist = state.items.map(cloneChecklistItem);
      await saveContactRecord(state.contact, state.db);
      renderChecklist(wrapper, state);
      window.dispatchAppDataChanged?.({ source: 'docs:update', contactId: state.contactId });
    } catch (err) {
      console.error('[docs] toggle failed', err);
      checkbox.checked = !nextDone;
    } finally {
      checkbox.disabled = false;
    }
  }, true);
}

async function prepareChecklist(contactInput, loanType, options = {}) {
  const provided = typeof contactInput === 'object' && contactInput !== null ? cloneContact(contactInput) : null;
  const contactId = provided ? toId(provided.id ?? provided.contactId ?? provided.contactID ?? provided.contact_id) : toId(contactInput);
  if (!contactId && !provided) return null;
  let contact = provided;
  if (!contact) {
    contact = await getContactFromDb(contactId, options.db);
    if (!contact) return null;
  }
  if (!contact.id) contact.id = contactId;
  const resolvedLoanType = loanType || contact.loanType || 'Generic';
  const { items, changed } = ensureChecklist(contact, resolvedLoanType);
  if (changed) {
    await saveContactRecord(contact, options.db);
    window.dispatchAppDataChanged?.({ source: 'docs:update', contactId: contact.id });
  }
  return {
    contact,
    items,
    loanType: resolvedLoanType,
    contactId: contact.id,
    db: options.db || null,
  };
}

async function mountDocChecklist(contactInput, loanType, options = {}) {
  const host = options.host
    || document.querySelector('[data-doc-checklist]')
    || document.querySelector('[data-ce="checklist"]');
  if (!host) return null;

  const prepared = await prepareChecklist(contactInput, loanType, options);
  if (!prepared) return null;

  const state = {
    contactId: prepared.contactId,
    contact: prepared.contact,
    items: prepared.items.map(cloneChecklistItem),
    loanType: prepared.loanType,
    db: prepared.db,
  };

  host.setAttribute('data-doc-checklist-host', '');
  renderChecklist(host, state);
  ensureHostListener(host, state.contactId);
  return state;
}

async function loadDocChecklist(contactInput, loanType, options = {}) {
  const prepared = await prepareChecklist(contactInput, loanType, options);
  if (!prepared) return { items: [], contact: null };
  return {
    contact: prepared.contact,
    items: prepared.items.map(cloneChecklistItem),
  };
}

const service = {
  mountDocChecklist,
  loadDocChecklist,
};

if (typeof window !== 'undefined') {
  window.docChecklistService = service;
}

export { mountDocChecklist, loadDocChecklist };
