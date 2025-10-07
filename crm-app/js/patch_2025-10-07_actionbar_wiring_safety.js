(() => {
  if (window.__WIRED_ACTIONBAR_SAFETY__) return;
  window.__WIRED_ACTIONBAR_SAFETY__ = true;

  const DEBUG = !!(window.__ENV__?.DEBUG);

  function getSelection() {
    try {
      const sel = window.selectionService?.get?.(document.body.getAttribute("data-scope") || "contacts");
      if (Array.isArray(sel)) return { ids: sel, type: "contacts" };
      if (Array.isArray(sel?.ids)) return { ids: sel.ids, type: sel.type || "contacts" };
    } catch {}
    return { ids: [], type: "contacts" };
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
