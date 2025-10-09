(function () {
  if (window.__WIRED_exportCsv) return;
  window.__WIRED_exportCsv = true;

  const wiredButtons = new WeakSet();

  const scopeSelectors = [
    '#actionbar',
    '[data-view="contacts"]',
    '[data-view="partners"]',
    '[data-page="contacts"]',
    '[data-page="partners"]',
    '#view-contacts',
    '#view-partners',
    '#contacts',
    '#partners',
  ];

  function isRelevant(node) {
    if (!node) return false;
    const scope = node.closest('#view-contacts, #view-partners, [data-view="contacts"], [data-view="partners"], [data-page="contacts"], [data-page="partners"], #actionbar');
    return Boolean(scope);
  }

  function normalizeButton(node) {
    if (!node) return null;
    if (node.__exportCsvNormalized) return node;
    const clone = node.cloneNode(true);
    clone.__exportCsvNormalized = true;
    clone.setAttribute('data-act', 'export-csv');
    if (node.parentNode) {
      node.parentNode.replaceChild(clone, node);
    }
    return clone;
  }

  function findButtons() {
    const candidates = new Set();
    if (typeof document?.querySelectorAll === 'function') {
      document.querySelectorAll('[data-act="export-csv"]').forEach((node) => {
        if (isRelevant(node)) candidates.add(node);
      });
    }
    if (!candidates.size) {
      const scopes = scopeSelectors
        .map((sel) => document.querySelector?.(sel))
        .filter(Boolean);
      scopes.forEach((scope) => {
        scope.querySelectorAll?.('button, a[role="button"], [data-act]').forEach((node) => {
          if (candidates.has(node)) return;
          const text = (node.textContent || '').trim().toLowerCase();
          if (text === 'export csv' && isRelevant(node)) {
            candidates.add(node);
          }
        });
      });
    }
    const normalized = [];
    candidates.forEach((node) => {
      const btn = normalizeButton(node);
      if (btn) normalized.push(btn);
    });
    return normalized;
  }

  function normalizeDataset(value) {
    const key = String(value || "").toLowerCase();
    if (key === "partner" || key === "partners") return "partners";
    if (key === "contact" || key === "contacts") return "contacts";
    return "";
  }

  function inferDataset() {
    const scopeAttr = document.body?.getAttribute?.('data-scope') || '';
    if (/partner/i.test(scopeAttr)) return 'partners';
    if (/contact/i.test(scopeAttr)) return 'contacts';

    const activeNav = document.querySelector('#main-nav [data-nav].active');
    const navKey = activeNav?.getAttribute('data-nav') || '';
    if (/partner/i.test(navKey)) return 'partners';
    if (/contact/i.test(navKey)) return 'contacts';

    const visibleView = document.querySelector('main[id^="view-"]:not(.hidden)');
    const viewId = visibleView?.id || '';
    if (/partner/i.test(viewId)) return 'partners';
    if (/contact/i.test(viewId)) return 'contacts';

    const activeTab = document.querySelector('[data-tab].active');
    const tabKey = activeTab?.getAttribute('data-tab') || '';
    if (/partner/i.test(tabKey)) return 'partners';

    return 'contacts';
  }

  function getSelectionSnapshot() {
    const svc =
      window.selectionService || window.SelectionService || window.Selection || null;
    if (!svc) return null;

    const wrap = (snap) => {
      if (!snap || typeof snap !== 'object') return null;
      let ids = [];
      if (Array.isArray(snap.ids)) {
        ids = snap.ids.slice();
      } else if (snap.ids && typeof snap.ids.forEach === 'function') {
        const next = [];
        snap.ids.forEach((value) => next.push(value));
        ids = next;
      }
      const type = snap.type || snap.scope || (typeof svc.type === 'string' ? svc.type : '');
      return { ids, type };
    };

    try {
      if (typeof svc.snapshot === 'function') {
        const snap = svc.snapshot();
        const wrapped = wrap(snap);
        if (wrapped) return wrapped;
      }
    } catch (err) {
      console.warn('CSV export selection snapshot failed', err);
    }

    try {
      if (typeof svc.get === 'function') {
        const snap = svc.get();
        const wrapped = wrap(snap);
        if (wrapped) return wrapped;
      }
    } catch (err) {
      console.warn('CSV export selection get() failed', err);
    }

    let ids = [];
    try {
      if (typeof svc.getIds === 'function') {
        ids = svc.getIds();
      } else if (typeof svc.getSelectedIds === 'function') {
        ids = svc.getSelectedIds();
      }
    } catch (err) {
      console.warn('CSV export selection ids failed', err);
    }

    const normalizedIds = Array.isArray(ids)
      ? ids
      : ids && typeof ids.forEach === 'function'
        ? (() => {
            const next = [];
            ids.forEach((value) => next.push(value));
            return next;
          })()
        : [];
    const snapshot = wrap({ ids: normalizedIds, type: svc.type });
    return snapshot;
  }

  const CONTACT_ID_KEYS = new Set(['id', 'contactid', 'contact_id', 'uuid', 'guid']);
  const PARTNER_ID_KEYS = new Set(['id', 'partnerid', 'partner_id', 'uuid', 'guid']);

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

  function filterRowsBySelection(rows, kind, selection) {
    if (!Array.isArray(rows)) return [];
    const ids = Array.isArray(selection?.ids) ? selection.ids : [];
    if (!ids.length) return rows;
    const dataset = normalizeDataset(kind) || 'contacts';
    const lookup = new Set(
      ids
        .map((id) => (id == null ? '' : String(id)))
        .filter((id) => id !== '')
    );
    if (!lookup.size) return rows;
    const filtered = rows.filter((row) => {
      const rowId = resolveRowId(row, dataset);
      return rowId ? lookup.has(rowId) : false;
    });
    if (!filtered.length) {
      console.warn('CSV export selection had no matching rows; exporting empty set');
    }
    return filtered;
  }

  async function pullRows(kind) {
    const target = kind === 'partners' ? 'partners' : 'contacts';
    try {
      const getter = kind === 'partners' ? window.getAllPartners : window.getAllContacts;
      if (typeof getter === 'function') {
        const rows = await Promise.resolve(getter());
        if (Array.isArray(rows) && rows.length) return rows;
      }
    } catch (err) {
      console.error('CSV export data fetch failed', err);
    }

    try {
      if (typeof window.dbGetAll === 'function') {
        const rows = await window.dbGetAll(target).catch(() => []);
        if (Array.isArray(rows) && rows.length) return rows;
        if (Array.isArray(rows)) return rows;
      }
    } catch (err) {
      console.error('CSV export dbGetAll failed', err);
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

  async function onExport(ev) {
    ev?.preventDefault?.();
    const selection = getSelectionSnapshot();
    const selectionKind = normalizeDataset(selection?.type);
    const kind = selectionKind || inferDataset();
    try {
      const rows = await pullRows(kind);
      const filtered = filterRowsBySelection(rows, kind, selection);
      const csv = toCsv(filtered);
      const ymd = new Date().toISOString().slice(0, 10);
      const filename = `CRM_${kind.toUpperCase()}_${ymd}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
      window.dispatchAppDataChanged?.(`export:csv:${kind}`);
    } catch (err) {
      console.error('CSV export failed', err);
    }
  }

  function wireButtons() {
    const buttons = findButtons();
    let wiredAny = false;
    buttons.forEach((btn) => {
      if (!wiredButtons.has(btn)) {
        wiredButtons.add(btn);
        btn.addEventListener('click', onExport);
        wiredAny = true;
      }
    });
    return wiredAny;
  }

  const boot = () => {
    if (wireButtons()) return;
    window.requestAnimationFrame?.(() => wireButtons());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  document.addEventListener('app:data:changed', wireButtons);
})();
