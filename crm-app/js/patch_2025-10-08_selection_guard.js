(() => {
  if (window.__WIRED_SELECTION_GUARD__) return;
  window.__WIRED_SELECTION_GUARD__ = true;

  const FORWARD_FLAG = "__selectionGuardForwarded";

  function createFallbackSelection() {
    const state = { type: "contacts", ids: new Set() };
    const normalizeType = (t) => (t === "partners" ? "partners" : "contacts");
    const emit = (source) => {
      const detail = { type: state.type, ids: Array.from(state.ids), source };
      try { document.dispatchEvent(new CustomEvent("selection:changed", { detail })); } catch (_) {}
    };
    return {
      get() {
        return { type: state.type, ids: Array.from(state.ids) };
      },
      set(ids, type) {
        state.type = normalizeType(type);
        state.ids = new Set(Array.isArray(ids) ? ids.map(String) : []);
        emit("set");
      },
      add(id, type) {
        if (id == null) return;
        const key = String(id);
        const nextType = normalizeType(type);
        if (state.ids.size && state.type !== nextType) {
          state.ids.clear();
        }
        state.type = nextType;
        state.ids.add(key);
        emit("add");
      },
      remove(id) {
        if (id == null) return;
        const key = String(id);
        if (!state.ids.delete(key)) return;
        if (state.ids.size === 0) state.type = "contacts";
        emit("remove");
      },
      toggle(id, type) {
        if (id == null) return;
        const key = String(id);
        if (state.ids.has(key)) {
          this.remove(key);
        } else {
          this.add(key, type);
        }
      },
      clear() {
        if (!state.ids.size && state.type === "contacts") return;
        state.ids.clear();
        state.type = "contacts";
        emit("clear");
      },
    };
  }

  function ensureBaseSelection() {
    if (window.Selection && typeof window.Selection.set === "function") return window.Selection;
    if (window.SelectionService && typeof window.SelectionService.set === "function") return window.SelectionService;
    if (window.selectionService && typeof window.selectionService.set === "function") return window.selectionService;
    const fallback = createFallbackSelection();
    window.Selection = window.Selection || fallback;
    window.SelectionService = window.SelectionService || fallback;
    return fallback;
  }

  const baseSelection = ensureBaseSelection();

  function toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.slice();
    if (val instanceof Set) return Array.from(val).map(String);
    if (typeof val[Symbol.iterator] === "function") return Array.from(val).map(String);
    return [];
  }

  const selectionFacade = (() => {
    if (window.selectionService && typeof window.selectionService.set === "function") {
      return window.selectionService;
    }
    return {
      get(scope) {
        if (typeof baseSelection.get === "function") {
          const payload = baseSelection.get(scope);
          if (payload && Array.isArray(payload.ids)) {
            return { ids: payload.ids.map(String), type: payload.type || scope };
          }
        }
        const ids = toArray(baseSelection.ids || baseSelection.getIds?.());
        const type = typeof baseSelection.type === "string" && baseSelection.type
          ? baseSelection.type
          : scope;
        return { ids: ids.map(String), type };
      },
      set(ids, type) {
        if (typeof baseSelection.set === "function") {
          baseSelection.set(ids, type, "guard:set");
          return;
        }
        if (typeof baseSelection.setIds === "function") {
          baseSelection.setIds(ids, type, "guard:set");
          return;
        }
      },
      add(id, type) {
        if (typeof baseSelection.add === "function") baseSelection.add(id, type, "guard:add");
      },
      remove(id) {
        if (typeof baseSelection.remove === "function") baseSelection.remove(id, "guard:remove");
        else if (typeof baseSelection.del === "function") baseSelection.del(id, "guard:remove");
      },
      toggle(id, type) {
        if (typeof baseSelection.toggle === "function") baseSelection.toggle(id, type, "guard:toggle");
        else {
          const snap = this.get(type);
          if (snap.ids.includes(String(id))) this.remove(id);
          else this.add(id, type);
        }
      },
      clear() {
        if (typeof baseSelection.clear === "function") baseSelection.clear("guard:clear");
      },
    };
  })();

  window.selectionService = selectionFacade;

  function normalizeScope(node) {
    if (!node || typeof node.closest !== "function") return "contacts";
    const scoped = node.closest("[data-scope]");
    if (scoped) {
      const attr = scoped.getAttribute("data-scope");
      if (attr) return attr;
    }
    const page = node.closest("[data-page]") || node.closest("[data-view]");
    if (page) {
      const direct = page.getAttribute("data-page") || page.getAttribute("data-view");
      if (direct === "partners") return "partners";
      if (direct === "contacts") return "contacts";
      const scopeAttr = page.getAttribute("data-scope");
      if (scopeAttr) return scopeAttr;
      if (page.id === "partners") return "partners";
    }
    return "contacts";
  }

  function handleClick(ev) {
    if (ev.defaultPrevented) return;
    const target = ev.target;
    const row = target?.closest?.("[data-row-id]");
    const checkbox = target?.closest?.('input[type="checkbox"][data-row-id]');
    if (!row && !checkbox) return;

    const host = row || checkbox;
    const id = host?.getAttribute?.("data-row-id");
    if (!id) return;
    const type = normalizeScope(host);

    const multikey = ev.ctrlKey || ev.metaKey || ev.shiftKey;
    if (multikey) {
      selectionFacade.toggle(id, type);
    } else {
      selectionFacade.set([id], type);
    }
  }

  document.addEventListener("click", handleClick, true);

  function readSelection(scopeHint) {
    try {
      const payload = selectionFacade.get(scopeHint);
      if (payload && Array.isArray(payload.ids)) {
        return { ids: payload.ids.map(String), type: payload.type || scopeHint || "contacts" };
      }
    } catch (_) {}
    const base = typeof baseSelection.get === "function"
      ? baseSelection.get(scopeHint)
      : null;
    if (base && Array.isArray(base.ids)) {
      return { ids: base.ids.map(String), type: base.type || scopeHint || "contacts" };
    }
    const ids = toArray(baseSelection.ids || baseSelection.getIds?.());
    const type = typeof baseSelection.type === "string" && baseSelection.type
      ? baseSelection.type
      : scopeHint || "contacts";
    return { ids: ids.map(String), type };
  }

  function syncChecks() {
    const scope = document.body?.getAttribute?.("data-scope") || undefined;
    const { ids, type } = readSelection(scope);
    const selected = new Set(ids.map(String));
    const typeKey = type || "contacts";
    const rows = document.querySelectorAll('[data-row-id]');
    rows.forEach((el) => {
      const rowId = el.getAttribute("data-row-id");
      const rowType = normalizeScope(el);
      const on = rowType === typeKey && rowId != null && selected.has(String(rowId));
      el.classList.toggle("is-selected", on);
      if (on) {
        el.setAttribute("aria-selected", "true");
      } else {
        el.removeAttribute("aria-selected");
      }
      const checkbox = el.querySelector('input[type="checkbox"][data-row-id]');
      if (checkbox) {
        checkbox.checked = on;
      }
    });
  }

  function cloneDetail(detail, source) {
    const base = detail && typeof detail === "object" ? { ...detail } : {};
    if (source && !base.sourceEvent) base.sourceEvent = source;
    return base;
  }

  function forwardToWindow(ev) {
    const detail = cloneDetail(ev.detail, ev.type);
    if (detail[FORWARD_FLAG]) return;
    detail[FORWARD_FLAG] = "doc";
    try { window.dispatchEvent(new CustomEvent("selection:change", { detail })); } catch (_) {}
    syncChecks();
  }

  function forwardToDocument(ev) {
    const detail = cloneDetail(ev.detail, ev.type);
    if (detail[FORWARD_FLAG]) return;
    detail[FORWARD_FLAG] = "win";
    try { document.dispatchEvent(new CustomEvent("selection:changed", { detail })); } catch (_) {}
    syncChecks();
  }

  document.addEventListener("selection:changed", forwardToWindow);
  document.addEventListener("selectionChanged", forwardToWindow);
  window.addEventListener("selection:change", forwardToDocument);
  document.addEventListener("app:data:changed", syncChecks);
  document.addEventListener("DOMContentLoaded", syncChecks, { once: true });
})();
