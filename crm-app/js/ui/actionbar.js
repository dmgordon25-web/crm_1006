import * as selection from '../services/selection.js';
import { exportCsv } from '../export_csv.js';

const ROOT_SELECTORS = [
  "[data-ui='actionbar']",
  "[data-role='actionbar']",
  "#actionbar",
];

const ENABLE_RULES = {
  edit: (count) => count === 1,
  merge: (count) => count === 2,
  delete: (count) => count >= 1,
  csv: (count) => count >= 1,
  clear: (count) => count >= 1,
  emailtogether: (count) => count >= 1,
  emailmass: (count) => count >= 1,
  task: (count) => count >= 1,
  bulklog: (count) => count >= 1,
};

const CSV_ALIASES = new Set(["csv", "export-csv", "export"]);

function normalizeAction(value) {
  return String(value || '').toLowerCase();
}

function detectContext() {
  const hash = normalizeAction(window.location?.hash || '');
  if (hash.includes('partner')) return { entity: 'partner', page: 'partners' };
  if (hash.includes('longshot')) return { entity: 'contact', page: 'longshots' };

  const activeNav = document.querySelector('#main-nav [data-nav].active');
  const navKey = normalizeAction(activeNav?.getAttribute('data-nav'));
  if (navKey.includes('partner')) return { entity: 'partner', page: 'partners' };
  if (navKey.includes('longshot')) return { entity: 'contact', page: 'longshots' };

  const visibleView = document.querySelector('main[id^="view-"]:not(.hidden)');
  const viewId = normalizeAction(visibleView?.id);
  if (viewId.includes('partner')) return { entity: 'partner', page: 'partners' };
  if (viewId.includes('longshot')) return { entity: 'contact', page: 'longshots' };

  return { entity: 'contact', page: 'contacts' };
}

function ensureCsvButton(root) {
  const host = root.querySelector('.actionbar-actions') || root;
  let csvBtn = host.querySelector('[data-act="csv"]');
  if (csvBtn) return csvBtn;
  csvBtn = host.querySelector('[data-act="export-csv"], [data-act="export"]');
  if (csvBtn) {
    csvBtn.setAttribute('data-act', 'csv');
    csvBtn.classList.add('btn');
    if (!csvBtn.textContent.trim()) {
      csvBtn.textContent = 'Export CSV';
    }
    return csvBtn;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.setAttribute('data-act', 'csv');
  button.textContent = 'Export CSV';
  host.appendChild(button);
  return button;
}

function toggleButtonState(button, enabled) {
  if (!button) return;
  const isEnabled = !!enabled;
  button.toggleAttribute('disabled', !isEnabled);
  button.classList.toggle('disabled', !isEnabled);
  button.classList.toggle('is-disabled', !isEnabled);
  button.setAttribute('aria-disabled', isEnabled ? 'false' : 'true');
}

function updateMeta(root, snapshot) {
  const count = snapshot.count || 0;
  const context = detectContext();
  const countEl = root.querySelector('[data-role="count"]');
  if (countEl) {
    countEl.textContent = count
      ? `${count} ${count === 1 ? 'record' : 'records'} selected`
      : 'No records selected';
  }
  const breakdown = root.querySelector('[data-role="breakdown"]');
  if (breakdown) {
    breakdown.textContent = count
      ? `Ready for ${context.entity === 'partner' ? 'partner' : 'contact'} actions`
      : 'Select rows to unlock pipeline actions.';
  }
  const names = root.querySelector('[data-role="names"]');
  if (names) {
    names.textContent = count
      ? `${context.entity === 'partner' ? 'Partner' : 'Contact'} selection in focus.`
      : 'No contacts or partners in focus yet.';
  }
  root.classList.toggle('has-selection', count > 0);
}

async function handleEdit(ids) {
  if (ids.length !== 1) return;
  const id = ids[0];
  const context = detectContext();
  if (context.entity === 'partner') {
    const open = window.openPartnerEditModal
      || window.renderPartnerModal
      || window.showPartnerModal
      || window.requestPartnerModal;
    if (typeof open === 'function') {
      await Promise.resolve(open(id));
    }
    return;
  }
  const openContact = window.renderContactModal
    || window.showContactModal
    || window.openContactModal
    || window.openContact;
  if (typeof openContact === 'function') {
    await Promise.resolve(openContact(id));
  }
}

async function handleMerge(ids) {
  if (ids.length !== 2) return;
  const context = detectContext();
  if (context.entity === 'partner') {
    const mergeFn = window.mergePartnersWithIds || window.mergePartnersWithSelection || window.mergePartners;
    if (typeof mergeFn === 'function') {
      await Promise.resolve(mergeFn(ids));
    }
    return;
  }
  const mergeContacts = window.mergeContactsWithIds || window.mergeContacts;
  if (typeof mergeContacts === 'function') {
    await Promise.resolve(mergeContacts(ids));
  }
}

async function handleCsv(ids) {
  if (!ids.length) return;
  const context = detectContext();
  try {
    await exportCsv({ ids, scope: context.page, type: context.entity === 'partner' ? 'partners' : 'contacts' });
  } catch (err) {
    console.error('[actionbar] CSV export failed', err);
  }
}

function handleClear() {
  selection.clear('action:clear');
}

async function dispatchAction(action, ids) {
  const key = normalizeAction(action);
  if (key === 'edit') {
    await handleEdit(ids);
    return true;
  }
  if (key === 'merge') {
    await handleMerge(ids);
    return true;
  }
  if (CSV_ALIASES.has(key)) {
    await handleCsv(ids);
    return true;
  }
  if (key === 'clear') {
    handleClear();
    return true;
  }
  return false;
}

function applyState(root, snapshot) {
  const count = snapshot.count || 0;
  updateMeta(root, snapshot);
  const actions = Array.from(root.querySelectorAll('[data-act]'));
  actions.forEach((button) => {
    const act = normalizeAction(button.getAttribute('data-act'));
    const rule = ENABLE_RULES[act] || ((n) => n > 0);
    const enabled = rule(count);
    toggleButtonState(button, enabled);
  });
}

function mount() {
  if (window.__WIRED_ACTIONBAR) return;
  window.__WIRED_ACTIONBAR = true;

  let root = null;
  for (const sel of ROOT_SELECTORS) {
    const candidate = document.querySelector(sel);
    if (candidate) {
      root = candidate;
      break;
    }
  }
  if (!root) return;

  ensureCsvButton(root);

  let lastSnapshot = {
    ids: selection.getSelection(),
    count: selection.getSelectionCount(),
    type: selection.getSelectionType(),
    scope: selection.getSelectionType(),
    reason: 'init',
  };

  const update = (payload = lastSnapshot) => {
    lastSnapshot = {
      ids: Array.isArray(payload.ids) ? payload.ids.slice() : selection.getSelection(),
      count: typeof payload.count === 'number' ? payload.count : selection.getSelectionCount(),
      type: payload.type || selection.getSelectionType(),
      scope: payload.scope || payload.type || selection.getSelectionType(),
      reason: payload.reason || 'selection',
    };
    applyState(root, lastSnapshot);
  };

  update(lastSnapshot);
  const unsubscribe = selection.subscribe(update);

  const onClick = async (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.getAttribute('data-act');
    const normalized = normalizeAction(act);
    const rule = ENABLE_RULES[normalized] || ((n) => n > 0);
    if (!rule(lastSnapshot.count)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const handled = await dispatchAction(act, selection.getSelection());
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  root.addEventListener('click', onClick);
  window.addEventListener('hashchange', () => update(lastSnapshot));
  document.addEventListener('app:data:changed', () => update(lastSnapshot));

  root.__actionbarUnsubscribe = () => {
    unsubscribe?.();
    root.removeEventListener('click', onClick);
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}

export default mount;
