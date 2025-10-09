const LONGSHOTS_SCOPE = 'pipeline';

function resolveElement(selector) {
  if (typeof document === 'undefined') return null;
  try {
    return document.querySelector(selector);
  } catch (_err) {
    return null;
  }
}

function isViewActive() {
  const view = resolveElement('#view-longshots');
  return !!(view && !view.classList.contains('hidden'));
}

function contactIdFrom(node) {
  if (!node) return null;
  if (typeof node.getAttribute === 'function') {
    const direct = node.getAttribute('data-id');
    if (direct) return direct;
  }
  if (typeof node.closest === 'function') {
    const row = node.closest('tr[data-id]');
    if (row && typeof row.getAttribute === 'function') {
      const rowId = row.getAttribute('data-id');
      if (rowId) return rowId;
    }
  }
  return null;
}

async function openContact(id) {
  if (!id) return;
  try {
    if (typeof window.renderContactModal === 'function') {
      await window.renderContactModal(id);
      return;
    }
    if (typeof window.showContactModal === 'function') {
      await window.showContactModal(id);
      return;
    }
  } catch (err) {
    console.error('[longshots] contact modal failed', err);
  }
}

function wireTableInteractions(table) {
  if (!table || table.__longshotsWired) return;
  table.__longshotsWired = true;

  table.setAttribute('data-selection-scope', LONGSHOTS_SCOPE);

  table.addEventListener('click', (event) => {
    const link = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-role="contact-name"]')
      : null;
    if (link) {
      event.preventDefault();
      const id = contactIdFrom(link);
      openContact(id);
      return;
    }

    const trigger = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('button[data-act], a[data-act]')
      : null;
    if (trigger) return;

    const checkbox = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('input[type="checkbox"][data-role="select"]')
      : null;
    if (checkbox) return;

    const row = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('tr[data-id]')
      : null;
    if (!row) return;
    const id = contactIdFrom(row);
    if (!id) return;

    const selection = window.SelectionStore || null;
    if (selection && typeof selection.toggle === 'function') {
      selection.toggle(id, LONGSHOTS_SCOPE);
    }
  });
}

function dispatchRefresh(reason) {
  if (typeof window.dispatchAppDataChanged === 'function') {
    try {
      window.dispatchAppDataChanged(reason);
    } catch (err) {
      console.warn('[longshots] dispatch failed', err);
    }
  }
}

function handleStageMutation(event) {
  if (!isViewActive()) return;
  const detail = event && event.detail ? event.detail : {};
  const id = detail?.contactId || detail?.id || detail?.contact?.id;
  if (!id) return;
  dispatchRefresh('longshots:refresh');
}

let wired = false;

export function mountLongShots() {
  const view = resolveElement('#view-longshots');
  if (!view) return;
  view.classList.remove('hidden');

  const table = resolveElement('#tbl-longshots');
  if (table) {
    wireTableInteractions(table);
  }

  if (!wired) {
    wired = true;
    document.addEventListener('contact:stageHistory:changed', handleStageMutation);
    document.addEventListener('contact:stage:set', handleStageMutation);
  }

  dispatchRefresh({ source: 'longshots:mount' });
}

export default mountLongShots;
