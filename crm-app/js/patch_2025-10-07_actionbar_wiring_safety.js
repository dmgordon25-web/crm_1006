(() => {
  if (window.__WIRED_ACTIONBAR_SAFETY__) return;
  window.__WIRED_ACTIONBAR_SAFETY__ = true;

  const DEBUG = !!(window.__ENV__?.DEBUG);

  function getSelection() {
    const scope = document.body.getAttribute("data-scope") || "contacts";
    try {
      const svc = window.SelectionService || window.Selection;
      if (svc) {
        let ids;
        let type = scope;
        let fromModernSource = false;
        let payloadType;

        if (typeof svc.getIds === "function") {
          const result = svc.getIds();
          if (Array.isArray(result)) ids = result.slice();
          else if (result && typeof result[Symbol.iterator] === "function") ids = Array.from(result);
          if (Array.isArray(ids)) fromModernSource = true;
        } else if (svc.ids && typeof svc.ids[Symbol.iterator] === "function") {
          ids = Array.from(svc.ids);
          if (Array.isArray(ids)) fromModernSource = true;
        }

        if (!Array.isArray(ids) && typeof svc.get === "function") {
          const payload = svc.get(scope);
          if (Array.isArray(payload?.ids)) {
            ids = payload.ids.slice();
            if (typeof payload.type === "string" && payload.type) type = payload.type;
            payloadType = type;
          } else if (Array.isArray(payload)) {
            ids = payload.slice();
            if (typeof svc.type === "string" && svc.type) {
              payloadType = svc.type;
              type = svc.type;
            }
          }
        }

        if (Array.isArray(ids)) {
          if (typeof svc.type === "string" && svc.type) {
            if (fromModernSource || (payloadType && svc.type === payloadType)) {
              type = svc.type;
            }
          }
          return { ids, type };
        }
      }
    } catch (err) {
      if (DEBUG) console.warn("[actionbar] selection read failed", err);
    }
    return { ids: [], type: scope };
  }

  function recalcEnablement() {
    const { ids, type } = getSelection();
    const bar = document.querySelector('[data-role="actionbar"]');
    if (!bar) return;
    const mergeBtn = bar.querySelector('[data-act="merge"]');
    if (mergeBtn) {
      const on = ids.length === 2; // merge only with exactly 2
      mergeBtn.toggleAttribute("aria-disabled", !on);
      mergeBtn.toggleAttribute("data-enabled", on);
      mergeBtn.classList.toggle("is-disabled", !on);
    }
    // You can extend here for other action buttons if needed
    if (DEBUG) { /* no noisy logs in prod */ }
  }

  // Keep state fresh on selection changes and app repaints
  window.addEventListener("selection:change", recalcEnablement);
  document.addEventListener("app:data:changed", recalcEnablement);
  document.addEventListener("DOMContentLoaded", recalcEnablement, { once: true });

  // Delegated click handler for merge that routes by selection type
  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.('[data-act="merge"]');
    if (!btn) return;
    ev.preventDefault();
    const { ids, type } = getSelection();
    if (ids.length !== 2) return; // do nothing unless exactly two

    try {
      if (type === "partners" && window.PartnersMergeOrchestrator?.mergeIds) {
        window.PartnersMergeOrchestrator.mergeIds(ids).then(() => {
          window.dispatchAppDataChanged?.("partners:merge");
        });
      } else if (type === "contacts" && window.ContactsMergeOrchestrator?.mergeIds) {
        window.ContactsMergeOrchestrator.mergeIds(ids).then(() => {
          window.dispatchAppDataChanged?.("contacts:merge");
        });
      } else {
        // Fallback: try both orchestrators best-effort
        const p = window.PartnersMergeOrchestrator?.mergeIds?.(ids);
        const c = window.ContactsMergeOrchestrator?.mergeIds?.(ids);
        Promise.allSettled([p, c]).then(() => window.dispatchAppDataChanged?.("merge:attempt"));
      }
    } catch (e) {
      if (DEBUG) console.warn("[actionbar] merge click handler error", e);
    }
  }, true);

  // First paint
  queueMicrotask(recalcEnablement);
})();
