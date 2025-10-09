(function () {
  if (window.__WIRED_actionBar) return;
  window.__WIRED_actionBar = true;

  const rootSelectors = [
    "[data-ui='actionbar']",
    "[data-role='actionbar']",
    "#actionbar",
  ];

  let root = null;
  for (const sel of rootSelectors) {
    if (typeof document?.querySelector !== "function") break;
    const found = document.querySelector(sel);
    if (found) {
      root = found;
      break;
    }
  }

  if (!root) return;

  const lookup = (act) => root.querySelector(`[data-act="${act}"]`);

  const setEnabled = (el, on) => {
    if (!el) return;
    const enabled = !!on;
    el.toggleAttribute("disabled", !enabled);
    if (el.classList) {
      el.classList.toggle("disabled", !enabled);
      el.classList.toggle("is-disabled", !enabled);
    }
    el.setAttribute("aria-disabled", enabled ? "false" : "true");
  };

  const currentCount = () => {
    const svc = window.selectionService || window.SelectionService || window.Selection || null;
    if (!svc) return 0;
    try {
      if (typeof svc.getCount === "function") return Number(svc.getCount()) || 0;
      if (typeof svc.count === "function") return Number(svc.count()) || 0;
      if (typeof svc.size === "function") return Number(svc.size()) || 0;
      if (Array.isArray(svc.getIds?.())) return svc.getIds().length;
      if (Array.isArray(svc.getSelectedIds?.())) return svc.getSelectedIds().length;
      if (svc.ids instanceof Set) return svc.ids.size;
    } catch (_) {}
    return 0;
  };

  function applyState() {
    const n = currentCount();
    setEnabled(lookup("edit"), n === 1);
    setEnabled(lookup("merge"), n === 2);
    setEnabled(lookup("delete"), n >= 1);
    setEnabled(lookup("export"), n >= 1);
  }

  applyState();

  const selectionChanged = () => applyState();
  const svc = window.selectionService || window.SelectionService || window.Selection || null;
  let unsubscribe = null;
  if (svc && typeof svc.subscribe === "function") {
    try {
      unsubscribe = svc.subscribe(selectionChanged);
    } catch (_) {
      unsubscribe = null;
    }
  }

  const bind = (target, event) => {
    try {
      target?.addEventListener?.(event, selectionChanged);
    } catch (_) {}
  };

  bind(window, "selection:change");
  bind(document, "selection:changed");
  bind(document, "app:data:changed");

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(applyState);
  }

  // Keep a reference to unsubscribe for diagnostics or hot reloads.
  root.__actionbarUnsubscribe = unsubscribe;
})();
