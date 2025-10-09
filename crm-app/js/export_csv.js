const CONTACT_ID_KEYS = new Set(['id', 'contactid', 'contact_id', 'uuid', 'guid']);
const PARTNER_ID_KEYS = new Set(['id', 'partnerid', 'partner_id', 'uuid', 'guid']);

function normalizeDataset(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'partner' || key === 'partners') return 'partners';
  if (key === 'contact' || key === 'contacts') return 'contacts';
  if (key === 'longshot' || key === 'longshots' || key === 'pipeline') return 'contacts';
  return '';
}

function inferDatasetFromDom() {
  const bodyScope = document.body?.getAttribute?.('data-scope') || '';
  if (/partner/i.test(bodyScope)) return 'partners';
  if (/contact/i.test(bodyScope)) return 'contacts';

  const activeNav = document.querySelector('#main-nav [data-nav].active');
  const navKey = activeNav?.getAttribute('data-nav') || '';
  if (/partner/i.test(navKey)) return 'partners';
  if (/contact/i.test(navKey)) return 'contacts';

  const visibleView = document.querySelector('main[id^="view-"]:not(.hidden)');
  const viewId = visibleView?.id || '';
  if (/partner/i.test(viewId)) return 'partners';
  if (/contact/i.test(viewId)) return 'contacts';

  return 'contacts';
}

function resolveRowId(row, kind) {
  if (!row || typeof row !== 'object') return null;
  const dataset = kind === 'partners' ? PARTNER_ID_KEYS : CONTACT_ID_KEYS;
  for (const key of Object.keys(row)) {
    const lower = String(key || '').toLowerCase();
    if (!dataset.has(lower)) continue;
    const value = row[key];
    if (value == null || value === '') continue;
    return String(value);
  }
  return null;
}

function filterRowsByIds(rows, kind, ids) {
  if (!Array.isArray(rows)) return [];
  if (!ids || !ids.size) return [];
  return rows.filter((row) => {
    const rowId = resolveRowId(row, kind);
    return rowId ? ids.has(rowId) : false;
  });
}

async function pullRows(kind) {
  const target = kind === 'partners' ? 'partners' : 'contacts';
  const use = (value) => (value && typeof value.then === 'function' ? value : Promise.resolve(value));

  try {
    const getter = kind === 'partners' ? window.getAllPartners : window.getAllContacts;
    if (typeof getter === 'function') {
      const rows = await use(getter());
      if (Array.isArray(rows) && rows.length) return rows;
    }
  } catch (err) {
    console.warn('[exportCsv] getAll* failed', err);
  }

  try {
    if (typeof window.dbGetAll === 'function') {
      const rows = await window.dbGetAll(target).catch(() => []);
      if (Array.isArray(rows)) return rows;
    }
  } catch (err) {
    console.warn('[exportCsv] dbGetAll failed', err);
  }

  const fallback = window.__DATA__?.[target];
  return Array.isArray(fallback) ? fallback : [];
}

function toCsv(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return '\uFEFF';
  }
  const keys = Array.from(rows.reduce((set, row) => {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((key) => set.add(key));
    }
    return set;
  }, new Set()));
  keys.sort();

  const escape = (value) => {
    if (value == null) return '';
    const text = String(value);
    if (text === '') return '';
    const needsWrap = /[",\r\n]/.test(text);
    const clean = text.replace(/"/g, '""');
    return needsWrap ? `"${clean}"` : clean;
  };

  const lines = [];
  lines.push(keys.join(','));
  for (const row of rows) {
    const line = keys.map((key) => escape(row?.[key])).join(',');
    lines.push(line);
  }

  return '\uFEFF' + lines.join('\r\n');
}

function normalizedIdSet(ids) {
  const set = new Set();
  (ids || []).forEach((value) => {
    if (value == null) return;
    const id = String(value);
    if (!id) return;
    set.add(id);
  });
  return set;
}

async function getRowsForExport(kind, ids, rows) {
  if (!ids.size) return [];
  const direct = Array.isArray(rows) ? rows : [];
  if (direct.length) {
    const filtered = filterRowsByIds(direct, kind, ids);
    if (filtered.length === ids.size) {
      return filtered;
    }
  }
  const fetched = await pullRows(kind);
  return filterRowsByIds(fetched, kind, ids);
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  link.remove();
}

function defaultFilename(kind) {
  const ymd = new Date().toISOString().slice(0, 10);
  const version = window.__APP_VERSION__;
  const tag = version?.tag || 'vFinal';
  const build = version?.ymd || ymd;
  return `CRM_${tag}_${build}_${kind.toUpperCase()}.csv`;
}

export async function exportCsv(options = {}) {
  const ids = normalizedIdSet(options.ids || options.selection || []);
  if (!ids.size) {
    console.warn('[exportCsv] no selected ids supplied');
    return false;
  }
  const dataset = normalizeDataset(options.type || options.scope) || inferDatasetFromDom();
  const rows = await getRowsForExport(dataset, ids, options.rows || []);
  if (!rows.length) {
    console.warn('[exportCsv] no rows matched the current selection');
    return false;
  }
  const csv = toCsv(rows);
  const filename = options.filename || defaultFilename(dataset);
  downloadCsv(filename, csv);
  try {
    window.dispatchAppDataChanged?.({ source: `export:csv:${dataset}`, selectionCount: ids.size });
  } catch (err) {
    if (window?.__DEV__) console.warn('[exportCsv] dispatch failed', err);
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.exportCsv = exportCsv;
}

export default exportCsv;
