(() => {
  if (window.__WIRED_SELECTION_GUARD__) return;
  window.__WIRED_SELECTION_GUARD__ = true;

  const FORWARD_FLAG = "__selectionGuardForwarded";

  function createFallbackSelection() {
    const state = { type: "contacts", ids: new Set() };
    const normalizeType = (t) => (t === "partners" ? "partners" : t === "calendar" ? "calendar" : "contacts");
    const emit = (source) => {
      const detail = { type: state.type, ids: Array.from(state.ids), source };
      try { document.dispatchEvent(new CustomEvent("selection:changed", { detail })); } catch {}
      try { window.dispatchEvent(new CustomEvent("selection:change", { detail })); } catch {}
    };
    return {
      get() { return { type: state.type, ids: Array.from(state.ids) }; },
      set(ids, type, source = "set") {
        state.type = normalizeType(type || state.type);
        state.ids = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String));
        emit(source);
      },
      add(id, type, source = "add") { state.type = normalizeType(type || state.type); if (id) state.ids.add(String(id)); emit(source); },
      remove(id, _type, source = "remove") { if (id) state.ids.delete(String(id)); emit(source); },
      clear(source = "clear") { state.type = "contacts"; state.ids.clear(); emit(source); },
    };
  }

  function ensureBaseSelection() {
    if (window.Selection?.set) return window.Selection;
    if (window.SelectionService?.set) return window.SelectionService;
    if (window.selectionService?.set) return window.selectionService;
    const fallback = createFallbackSelection();
    window.Selection = window.Selection || fallback;
    window.SelectionService = window.SelectionService || fallback;
    window.selectionService = window.selectionService || fallback;
    return fallback;
  }

  const baseSelection = ensureBaseSelection();

  const selectionFacade = (() => {
    if (window.selectionService?.set) return window.selectionService;
    return {
      get(scope) {
        const payload = typeof baseSelection.get === "function" ? baseSelection.get(scope) : null;
        if (payload?.ids) return { ids: payload.ids.map(String), type: payload.type || scope || "contacts" };
        const ids = Array.from(baseSelection.ids || []);
        const type = baseSelection.type || scope || "contacts";
        return { ids: ids.map(String), type };
      },
      set(ids, type) { baseSelection.set?.(ids, type, "guard:set"); },
      add(id, type) { baseSelection.add?.(id, type, "guard:add"); },
      remove(id, type) { baseSelection.remove?.(id, type, "guard:remove"); },
      clear(reason) { baseSelection.clear?.(reason || "guard:clear"); },
    };
  })();

  window.selectionService = selectionFacade;
  window.Selection = window.Selection || selectionFacade;
  window.SelectionService = window.SelectionService || selectionFacade;

  function normalizeScope(node) {
    if (!node?.closest) return "contacts";
    const scoped = node.closest("[data-scope]");
    if (scoped?.getAttribute("data-scope")) return scoped.getAttribute("data-scope");
    const page = node.closest("[data-page], [data-view], #partners, #contacts, #calendar]");
    const attr = page?.getAttribute?.("data-page") || page?.getAttribute?.("data-view") || page?.id;
    return (attr === "partners" || attr === "contacts" || attr === "calendar") ? attr : "contacts";
  }

  function syncChecks() {
    const sel = selectionFacade.get();
    const ids = new Set(sel.ids || []);
    const type = sel.type || "contacts";
    const rows = document.querySelectorAll(`[data-scope="${type}"] [data-row-id], [data-view="${type}"] [data-row-id], [data-page="${type}"] [data-row-id], #${type} [data-row-id]`);
    rows.forEach(el => {
      const id = el.getAttribute("data-row-id");
      const on = ids.has(id);
      el.classList.toggle("is-selected", on);
      if (on) el.setAttribute("aria-selected", "true"); else el.removeAttribute("aria-selected");
      const cb = el.querySelector('input[type="checkbox"][data-row-id]');
      if (cb) cb.checked = on;
    });
  }

  function handleClick(ev) {
    if (ev.defaultPrevented) return;
    const target = ev.target;
    const checkbox = target?.closest?.('input[type="checkbox"][data-row-id]');
    const host = checkbox || target?.closest?.("[data-row-id]");
    if (!host) return;
    const id = host.getAttribute("data-row-id");
    const type = normalizeScope(host);
    if (!id) return;

    if (checkbox) {
      checkbox.checked ? selectionFacade.add(id, type) : selectionFacade.remove(id, type);
    } else {
      const sel = selectionFacade.get(type);
      sel.ids.includes(id) ? selectionFacade.remove(id, type) : selectionFacade.add(id, type);
    }
  }

  document.addEventListener("click", handleClick, true);

  function forwardToWindow(ev) {
    const forwarded = ev?.detail?.[FORWARD_FLAG];
    if (!forwarded) {
      const detail = { ...(ev.detail || {}), [FORWARD_FLAG]: "doc" };
      try { window.dispatchEvent(new CustomEvent("selection:change", { detail })); } catch {}
    }
    syncChecks();
  }
  function forwardToDocument(ev) {
    const forwarded = ev?.detail?.[FORWARD_FLAG];
    if (!forwarded) {
      const detail = { ...(ev.detail || {}), [FORWARD_FLAG]: "win" };
      try { document.dispatchEvent(new CustomEvent("selection:changed", { detail })); } catch {}
    }
    syncChecks();
  }

  document.addEventListener("selection:changed", forwardToWindow);
  document.addEventListener("selectionChanged", forwardToWindow);
  window.addEventListener("selection:change", forwardToDocument);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncChecks, { once: true });
  } else {
    syncChecks();
  }
  document.addEventListener("app:data:changed", syncChecks);
})();
