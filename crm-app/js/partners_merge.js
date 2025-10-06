import { ensurePartnersMergeButton, setPartnersMergeState, onPartnersMerge } from './ui/action_bar.js';

const SCORE_FIELDS = [
  'name','company','email','phone','tier','partnerType','focus','priority','preferredContact','cadence','address','city','state','zip','referralVolume','lastTouch','nextTouch','relationshipOwner','collaborationFocus','notes'
];

function cloneDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); }
    catch (_err) {}
  }
  return JSON.parse(JSON.stringify(value));
}

function canon(value) {
  return String(value ?? '').trim();
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function scorePartner(partner) {
  if (!partner) return 0;
  let score = 0;
  SCORE_FIELDS.forEach((field) => {
    if (hasValue(partner[field])) score += 1;
  });
  if (partner.extras && typeof partner.extras === 'object') {
    score += Object.keys(partner.extras).length;
  }
  return score;
}

function chooseKeep(a, b) {
  const scoreA = scorePartner(a);
  const scoreB = scorePartner(b);
  if (scoreA > scoreB) return { keep: a, drop: b };
  if (scoreB > scoreA) return { keep: b, drop: a };
  const createdA = Number(a && a.createdAt) || Number.MAX_SAFE_INTEGER;
  const createdB = Number(b && b.createdAt) || Number.MAX_SAFE_INTEGER;
  if (createdA <= createdB) return { keep: a, drop: b };
  return { keep: b, drop: a };
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

function mergePartnerRecord(existing, incoming) {
  const base = cloneDeep(existing) || {};
  const payload = cloneDeep(incoming) || {};
  const result = Object.assign({}, base);
  SCORE_FIELDS.forEach((field) => {
    if (hasValue(payload[field])) result[field] = payload[field];
  });
  if (payload.extras || base.extras) {
    result.extras = Object.assign({}, base.extras || {}, payload.extras || {});
  }
  if (hasValue(payload.notes)) {
    result.notes = combineNotes(base.notes, payload.notes);
  }
  result.updatedAt = Date.now();
  result.id = base.id || payload.id;
  result.partnerId = base.partnerId || payload.partnerId || result.id;
  return result;
}

function diffPartnerFields(before, after) {
  const changed = [];
  SCORE_FIELDS.forEach((field) => {
    const prev = before ? before[field] : undefined;
    const next = after ? after[field] : undefined;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changed.push(field);
    }
  });
  if ((before && before.notes) !== (after && after.notes)) changed.push('notes');
  return changed;
}

function getSelectionStore() {
  return window.SelectionStore || null;
}

function currentPartnerSelection() {
  const store = getSelectionStore();
  if (!store) return [];
  const ids = store.get('partners');
  return Array.from(ids || []);
}

function setPartnerSelection(ids) {
  const store = getSelectionStore();
  if (!store) return;
  store.set(new Set(ids.map(String)), 'partners');
}

function ensureModal() {
  let dlg = document.getElementById('partner-merge-modal');
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'partner-merge-modal';
  dlg.innerHTML = `
    <form method="dialog" class="dlg merge-partners-shell" data-role="form">
      <header class="merge-partners-head">
        <h3 class="merge-title">Merge Partners</h3>
        <p class="muted" data-role="summary"></p>
      </header>
      <div class="merge-body" data-role="body"></div>
      <footer class="merge-actions">
        <span class="muted" data-role="warning"></span>
        <span class="grow"></span>
        <button class="btn" type="button" data-role="cancel">Cancel</button>
        <button class="btn brand" type="submit" data-role="confirm">Merge</button>
      </footer>
    </form>`;
  document.body.appendChild(dlg);
  return dlg;
}

function renderPreview(body, keep, drop, merged, changedFields) {
  const keepName = canon(keep.name) || 'Primary';
  const dropName = canon(drop.name) || 'Duplicate';
  const rows = changedFields.map((field) => {
    const before = drop && drop[field];
    const after = merged && merged[field];
    const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    return `<div class="merge-row">
      <div class="merge-label">${label}</div>
      <div class="merge-before">${canon(before) || '<span class="muted">—</span>'}</div>
      <div class="merge-after">${canon(after) || '<span class="muted">—</span>'}</div>
    </div>`;
  }).join('');
  body.innerHTML = `
    <div class="merge-preview">
      <div><strong>Keeping</strong><div>${keepName}</div></div>
      <div><strong>Merging</strong><div>${dropName}</div></div>
    </div>
    <div class="merge-grid">${rows || '<div class="muted">No changes detected.</div>'}</div>`;
}

async function openMergeDialog(keep, drop) {
  const dlg = ensureModal();
  const form = dlg.querySelector('form');
  const summary = dlg.querySelector('[data-role="summary"]');
  const warning = dlg.querySelector('[data-role="warning"]');
  const body = dlg.querySelector('[data-role="body"]');
  const cancelBtn = dlg.querySelector('[data-role="cancel"]');
  const confirmBtn = dlg.querySelector('[data-role="confirm"]');
  const merged = mergePartnerRecord(keep, drop);
  const changed = diffPartnerFields(keep, merged);
  summary.textContent = `Merge "${canon(drop.name)||'Unnamed'}" into "${canon(keep.name)||'Primary'}"`;
  warning.textContent = changed.length ? '' : 'Records already match.';
  renderPreview(body, keep, drop, merged, changed);

  return new Promise((resolve) => {
    function cleanup(result) {
      try { dlg.close(); } catch (_err) { dlg.removeAttribute('open'); }
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      form.removeEventListener('submit', onSubmit);
      resolve(result);
    }
    function onConfirm(event) {
      event && event.preventDefault();
      cleanup(true);
    }
    function onCancel(event) {
      event && event.preventDefault();
      cleanup(false);
    }
    function onSubmit(event) {
      event && event.preventDefault();
      cleanup(true);
    }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    form.addEventListener('submit', onSubmit);
    try { dlg.showModal(); } catch (_err) { dlg.setAttribute('open', ''); }
  });
}

async function performMerge(ids) {
  if (!ids || ids.length !== 2) return;
  await openDB();
  const [aId, bId] = ids.map(String);
  const [a, b] = await Promise.all([
    dbGet('partners', aId).catch(()=>null),
    dbGet('partners', bId).catch(()=>null)
  ]);
  if (!a || !b) {
    (window.toast || console.log)('Unable to load selected partners.');
    return;
  }
  const { keep, drop } = chooseKeep(a, b);
  const confirmed = await openMergeDialog(keep, drop);
  if (!confirmed) return;
  if (typeof window.mergePartners !== 'function') {
    console.warn('mergePartners API missing');
    return;
  }
  const result = await window.mergePartners(keep.id, drop.id, { preview: false });
  setPartnerSelection([keep.id]);
  if (window.toast) {
    window.toast(`Merged "${canon(drop.name)||drop.id}" into "${canon(keep.name)||keep.id}"`);
  }
  return result;
}

function initActionBarBridge() {
  ensurePartnersMergeButton();
  onPartnersMerge(() => {
    const ids = currentPartnerSelection();
    performMerge(ids);
  });
}

function updateButton() {
  const ids = currentPartnerSelection();
  const count = ids.length;
  setPartnersMergeState({ visible: count > 0, enabled: count === 2 });
}

function subscribeSelection() {
  const store = getSelectionStore();
  if (!store || subscribeSelection.__wired) return;
  subscribeSelection.__wired = true;
  store.subscribe((snapshot) => {
    if (!snapshot || snapshot.scope !== 'partners') return;
    updateButton();
  });
}

initActionBarBridge();
subscribeSelection();
updateButton();
document.addEventListener('app:data:changed', (evt) => {
  if (!evt || !evt.detail) return;
  if (evt.detail.scope === 'partners' || evt.detail.scope === 'import') {
    updateButton();
  }
});
