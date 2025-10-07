(() => {
  if (window.__WIRED_ACTIONBAR_HARDEN__) return;
  window.__WIRED_ACTIONBAR_HARDEN__ = true;

  function activeScope() {
    return document.body?.getAttribute?.("data-scope") || "contacts";
  }

  function resolveSelectionService() {
    return window.selectionService
      || window.Selection
      || window.SelectionService
      || null;
  }

  function normalizeIds(ids) {
    if (!ids) return [];
    if (Array.isArray(ids)) return ids.map(String);
    if (ids instanceof Set) return Array.from(ids).map(String);
    if (typeof ids[Symbol.iterator] === "function") return Array.from(ids).map(String);
    return [];
  }

  function currentSelection() {
    const scope = activeScope();
    const svc = resolveSelectionService();
    try {
      if (svc) {
        if (typeof svc.get === "function") {
          const payload = svc.get(scope);
          if (payload && Array.isArray(payload.ids)) {
            const ids = payload.ids.map(String);
            const type = payload.type || scope;
            return { ids, type };
          }
          if (Array.isArray(payload)) {
            const ids = payload.map(String);
            const type = typeof svc.type === "string" && svc.type ? svc.type : scope;
            return { ids, type };
          }
        }
        if (typeof svc.getIds === "function") {
          const ids = normalizeIds(svc.getIds());
          const type = typeof svc.type === "string" && svc.type ? svc.type : scope;
          return { ids, type };
        }
        if (svc.ids) {
          const ids = normalizeIds(svc.ids);
          const type = typeof svc.type === "string" && svc.type ? svc.type : scope;
          return { ids, type };
        }
      }
    } catch (_) {}
    return { ids: [], type: scope };
  }

  function setEnabled(btn, on) {
    if (!btn) return;
    const enabled = !!on;
    btn.classList.toggle("is-disabled", !enabled);
    btn.dataset.enabled = enabled ? "1" : "0";
    btn.setAttribute("aria-disabled", enabled ? "false" : "true");
  }

  function recalc() {
    const bar = document.querySelector('[data-role="actionbar"]');
    if (!bar) return;
    const mergeBtn = bar.querySelector('[data-act="merge"]');
    const { ids } = currentSelection();
    setEnabled(mergeBtn, ids.length === 2);
  }

  document.addEventListener("DOMContentLoaded", recalc, { once: true });
  window.addEventListener("selection:change", recalc);
  document.addEventListener("app:data:changed", recalc);

  function clearSelection(reason) {
    const svc = resolveSelectionService();
    try { svc?.clear?.(reason); } catch (_) {}
  }

  function performMerge(ids, type) {
    const mergeType = type === "partners" ? "partners" : "contacts";
    const orchestrator = mergeType === "partners" ? window.PartnersMergeOrchestrator : window.ContactsMergeOrchestrator;
    const handler = orchestrator?.mergeIds;
    if (typeof handler !== "function") return null;
    try {
      return handler.call(orchestrator, ids);
    } catch (err) {
      console.error("[actionbar] merge handler failed", err);
      return null;
    }
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.('[data-role="actionbar"] [data-act="merge"]');
    if (!btn) return;
    ev.preventDefault();
    if (btn.dataset.enabled !== "1" || btn.getAttribute("aria-disabled") === "true") return;

    const { ids, type } = currentSelection();
    if (ids.length !== 2) return;

    const result = performMerge(ids, type);
    if (result === null) return;

    Promise.resolve(result)
      .then(() => {
        clearSelection("merge");
        const reason = type === "partners" ? "partners:merge" : "contacts:merge";
        window.dispatchAppDataChanged?.(reason);
      })
      .catch(() => {});
  }, true);
})();
