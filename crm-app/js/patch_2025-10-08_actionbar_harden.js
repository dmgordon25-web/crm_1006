(() => {
  if (window.__WIRED_ACTIONBAR_HARDEN__) return;
  window.__WIRED_ACTIONBAR_HARDEN__ = true;

  function activeScope() {
    return document.body?.getAttribute?.("data-scope") || "contacts";
  }
  function svc() {
    return window.selectionService || window.Selection || window.SelectionService || null;
  }
  function normalizeIds(ids) {
    if (!ids) return [];
    if (Array.isArray(ids)) return ids.map(String);
    if (ids instanceof Set) return Array.from(ids).map(String);
    return [String(ids)];
  }
  function currentSelection() {
    const scope = activeScope();
    try {
      const s = svc();
      if (s) {
        if (typeof s.get === "function") {
          const got = s.get(scope);
          if (got?.ids) return { ids: normalizeIds(got.ids), type: got.type || scope };
        }
        if (s.ids) return { ids: normalizeIds(s.ids), type: s.type || scope };
      }
    } catch {}
    return { ids: [], type: scope };
  }
  function setEnabled(btn, on) {
    if (!btn) return;
    const en = !!on;
    btn.classList.toggle("is-disabled", !en);
    btn.dataset.enabled = en ? "1" : "0";
    btn.setAttribute("aria-disabled", en ? "false" : "true");
  }

  function recalc() {
    const bar = document.querySelector('[data-role="actionbar"]');
    if (!bar) return;
    const mergeBtn = bar.querySelector('[data-act="merge"]');
    const { ids } = currentSelection();
    setEnabled(mergeBtn, ids.length === 2);
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest?.('[data-role="actionbar"] [data-act="merge"]');
    if (!btn) return;
    ev.preventDefault();
    const scope = activeScope();
    const { ids, type } = currentSelection();
    if (ids.length !== 2) return;

    const run = window.contactsMerge?.run || window.contactsMergeOrchestrator?.run;
    const runPartners = window.partnersMerge?.run || window.partnersMergeOrchestrator?.run;

    const promise =
      (type === "partners" ? runPartners?.(ids) : run?.(ids)) || Promise.resolve(null);

    Promise.resolve(promise)
      .then(() => {
        try { (window.selectionService || window.Selection || window.SelectionService)?.clear?.("merge"); } catch {}
        window.dispatchAppDataChanged?.(type === "partners" ? "partners:merge" : "contacts:merge");
      })
      .catch(() => {});
  }, true);

  function onAnySelection() { recalc(); }
  window.addEventListener("selection:change", onAnySelection);
  document.addEventListener("selection:changed", onAnySelection);
  document.addEventListener("app:data:changed", recalc);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", recalc, { once: true });
  } else {
    recalc();
  }
})();
