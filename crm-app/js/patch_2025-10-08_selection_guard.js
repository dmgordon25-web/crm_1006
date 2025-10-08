(() => {
  if (window.__WIRED_SELECTION_GUARD__) return;
  window.__WIRED_SELECTION_GUARD__ = true;

  const FORWARD_FLAG = "__selectionGuardForwarded";

  const fallbackState = { type: "contacts", ids: new Set(), items: new Map() };
  const normalizeType = (t) => (t === "partners" ? "partners" : t === "calendar" ? "calendar" : "contacts");

  function cloneFallbackIds() {
    return Array.from(fallbackState.ids).map(String);
  }

  function updateFallbackItems() {
    const next = new Map();
    const type = fallbackState.type;
    cloneFallbackIds().forEach((id) => next.set(id, { type }));
    fallbackState.items = next;
  }

  function emitFallback(source) {
    const detail = { type: fallbackState.type, ids: cloneFallbackIds(), source };
    try { document.dispatchEvent(new CustomEvent("selection:changed", { detail })); } catch {}
    try { window.dispatchEvent(new CustomEvent("selection:change", { detail })); } catch {}
    syncDomSelection();
  }

  function normalizeIdsInput(input) {
    if (!input && input !== 0) return [];
    if (Array.isArray(input)) return input.filter(Boolean).map(String);
    if (input instanceof Set) return Array.from(input).filter(Boolean).map(String);
    return [String(input)];
  }

  function createFallbackSelection() {
    const api = {
      get(scope) {
        const type = normalizeType(scope || fallbackState.type);
        const ids = cloneFallbackIds();
        return { ids, type };
      },
      set(ids, type, source = "set") {
        const list = normalizeIdsInput(ids);
        fallbackState.type = normalizeType(type || fallbackState.type);
        fallbackState.ids = new Set(list);
        updateFallbackItems();
        emitFallback(source);
      },
      add(id, type, source = "add") {
        if (!id && id !== 0) return;
        const normType = normalizeType(type || fallbackState.type);
        if (fallbackState.ids.size && fallbackState.type !== normType) {
          fallbackState.ids.clear();
          fallbackState.items.clear();
        }
        fallbackState.type = normType;
        const before = fallbackState.ids.size;
        fallbackState.ids.add(String(id));
        updateFallbackItems();
        if (fallbackState.ids.size !== before) emitFallback(source);
      },
      remove(id, _type, source = "remove") {
        if (!id && id !== 0) return;
        const before = fallbackState.ids.size;
        fallbackState.ids.delete(String(id));
        updateFallbackItems();
        if (fallbackState.ids.size !== before) {
          if (!fallbackState.ids.size) fallbackState.type = "contacts";
          emitFallback(source);
        }
      },
      clear(source = "clear") {
        if (!fallbackState.ids.size && fallbackState.type === "contacts") {
          emitFallback(source);
          return;
        }
        fallbackState.ids.clear();
        fallbackState.items.clear();
        fallbackState.type = "contacts";
        emitFallback(source);
      },
      toggle(id, type, source = "toggle") {
        if (!id && id !== 0) return;
        const key = String(id);
        if (fallbackState.ids.has(key)) api.remove(key, type, source);
        else api.add(key, type, source);
      },
      prune(ids, source = "prune") {
        const list = normalizeIdsInput(ids);
        if (!list.length) return false;
        let changed = false;
        list.forEach((key) => {
          if (fallbackState.ids.delete(key)) {
            changed = true;
            fallbackState.items.delete(key);
          }
        });
        if (changed) {
          if (!fallbackState.ids.size) fallbackState.type = "contacts";
          emitFallback(source);
        }
        return changed;
      },
      count() {
        return fallbackState.ids.size;
      },
      size() {
        return fallbackState.ids.size;
      },
      getIds() {
        return cloneFallbackIds();
      },
      idsOf(filterType) {
        const target = normalizeType(filterType || fallbackState.type);
        if (target !== fallbackState.type) return [];
        return cloneFallbackIds();
      },
      snapshot(scope) {
        const { ids, type } = api.get(scope);
        return { ids: ids.slice(), type };
      },
      restore(snap, source = "restore") {
        if (!snap || !Array.isArray(snap.ids)) {
          api.clear(source);
          return;
        }
        api.set(snap.ids, snap.type, source);
      },
      reemit(source = "refresh") {
        emitFallback(source);
      },
      syncChecks() {
        syncDomSelection();
      },
    };

    api.del = api.remove;

    Object.defineProperty(api, "type", {
      get() {
        return fallbackState.type;
      },
      set(value) {
        fallbackState.type = normalizeType(value);
        updateFallbackItems();
        emitFallback("guard:type");
      },
    });

    Object.defineProperty(api, "ids", {
      get() {
        return fallbackState.ids;
      },
    });

    Object.defineProperty(api, "items", {
      get() {
        return fallbackState.items;
      },
    });

    return api;
  }

  function isFullService(candidate) {
    if (!candidate || typeof candidate !== "object") return false;
    return typeof candidate.set === "function"
      && typeof candidate.add === "function"
      && typeof candidate.remove === "function"
      && typeof candidate.clear === "function"
      && typeof candidate.count === "function"
      && typeof candidate.getIds === "function";
  }

  function createSelectionAdapter(base) {
    const adapter = {
      get(scope) {
        if (typeof base.get === "function") {
          const payload = base.get(scope);
          if (payload && Array.isArray(payload.ids)) {
            return { ids: payload.ids.map(String), type: payload.type || scope || "contacts" };
          }
        }
        const ids = base.ids instanceof Set ? Array.from(base.ids).map(String)
          : Array.isArray(base.ids) ? base.ids.map(String)
          : [];
        const type = base.type || scope || "contacts";
        return { ids, type };
      },
      set(ids, type, source = "guard:set") { base.set?.(ids, type, source); },
      add(id, type, source = "guard:add") { base.add?.(id, type, source); },
      remove(id, type, source = "guard:remove") { base.remove?.(id, type, source); },
      clear(reason = "guard:clear") { base.clear?.(reason); },
      toggle(id, type, source = "guard:toggle") { base.toggle?.(id, type, source); },
      prune(ids, source = "guard:prune") { return typeof base.prune === "function" ? base.prune(ids, source) : false; },
      count() { return typeof base.count === "function" ? base.count() : adapter.get().ids.length; },
      size() { return adapter.count(); },
      getIds() {
        if (typeof base.getIds === "function") return base.getIds().map(String);
        return adapter.get().ids.slice();
      },
      idsOf(filterType) {
        if (typeof base.idsOf === "function") return base.idsOf(filterType);
        const payload = adapter.get(filterType);
        return payload.ids.slice();
      },
      snapshot(scope) {
        if (typeof base.snapshot === "function") return base.snapshot(scope);
        return adapter.get(scope);
      },
      restore(snap, source = "guard:restore") { base.restore?.(snap, source); },
      reemit(source = "guard:reemit") { base.reemit?.(source); },
      syncChecks() {
        if (typeof base.syncChecks === "function") base.syncChecks();
        else base.syncCheckboxes?.();
      },
    };
    adapter.del = adapter.remove;
    Object.defineProperty(adapter, "type", {
      get() { return base.type || adapter.get().type; },
      set(value) { if (base) base.type = value; },
    });
    Object.defineProperty(adapter, "ids", {
      get() {
        if (base && base.ids) return base.ids;
        const payload = adapter.get();
        return new Set(payload.ids);
      },
    });
    Object.defineProperty(adapter, "items", {
      get() {
        if (base && base.items) return base.items;
        const payload = adapter.get();
        return new Map(payload.ids.map((id) => [id, { type: payload.type }]));
      },
    });
    return adapter;
  }

  function ensureSelectionFacade() {
    const primary = window.SelectionService;
    if (isFullService(primary)) return primary;
    const secondary = window.selectionService;
    if (isFullService(secondary)) return secondary;
    if (window.Selection && typeof window.Selection.set === "function") {
      return createSelectionAdapter(window.Selection);
    }
    const fallback = createFallbackSelection();
    window.Selection = window.Selection || fallback;
    window.SelectionService = window.SelectionService || fallback;
    window.selectionService = window.selectionService || fallback;
    return fallback;
  }

  const selectionFacade = ensureSelectionFacade();

  window.selectionService = selectionFacade;
  if (!window.SelectionService) window.SelectionService = selectionFacade;
  if (!window.Selection) window.Selection = selectionFacade;

  function normalizeScope(node) {
    if (!node?.closest) return "contacts";
    const scoped = node.closest("[data-scope]");
    if (scoped?.getAttribute("data-scope")) return scoped.getAttribute("data-scope");
    const page = node.closest("[data-page], [data-view], #partners, #contacts, #calendar]");
    const attr = page?.getAttribute?.("data-page") || page?.getAttribute?.("data-view") || page?.id;
    return (attr === "partners" || attr === "contacts" || attr === "calendar") ? attr : "contacts";
  }

  function syncDomSelection() {
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
    const detail = Object.assign({}, ev.detail || {}, { [FORWARD_FLAG]: "doc" });
    try { window.dispatchEvent(new CustomEvent("selection:change", { detail })); } catch {}
    syncDomSelection();
  }
  function forwardToDocument(ev) {
    const detail = Object.assign({}, ev.detail || {}, { [FORWARD_FLAG]: "win" });
    try { document.dispatchEvent(new CustomEvent("selection:changed", { detail })); } catch {}
    syncDomSelection();
  }

  document.addEventListener("selection:changed", forwardToWindow);
  document.addEventListener("selectionChanged", forwardToWindow);
  window.addEventListener("selection:change", forwardToDocument);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncDomSelection, { once: true });
  } else {
    syncDomSelection();
  }
  document.addEventListener("app:data:changed", syncDomSelection);
})();
