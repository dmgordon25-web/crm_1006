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
    const kind = inferDataset();
    try {
      const rows = await pullRows(kind);
      const csv = toCsv(rows);
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
