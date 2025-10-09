(function () {
  if (window.__WIRED_selectionService) return;
  window.__WIRED_selectionService = true;

  const _state = {
    ids: new Set(),
    type: "contacts",
    lastHash: "",
    subs: new Set(),
    items: new Map(),
  };

  const normalizeType = (value) => {
    const v = String(value || "").toLowerCase();
    if (v === "partners" || v === "partner") return "partners";
    if (v === "calendar") return "calendar";
    if (v === "tasks") return "tasks";
    return "contacts";
  };

  function syncItems() {
    _state.items.clear();
    const type = _state.type;
    for (const id of _state.ids) {
      _state.items.set(id, { type });
    }
  }

  function hash() {
    const ids = Array.from(_state.ids).map(String).sort().join("|");
    return `${_state.type}#${ids}`;
  }

  function emitDetail(reason) {
    return {
      ids: Array.from(_state.ids),
      type: _state.type,
      reason,
    };
  }

  function forward(detail) {
    if (!detail) return;
    try {
      if (typeof document !== "undefined" && document?.dispatchEvent) {
        document.dispatchEvent(new CustomEvent("selection:changed", { detail }));
      }
    } catch (_) {}
    try {
      if (typeof window !== "undefined" && window?.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("selection:change", { detail }));
      }
    } catch (_) {}
  }

  function notify(reason = "selection") {
    const h = hash();
    if (h === _state.lastHash) return;
    _state.lastHash = h;
    const snapshot = Array.from(_state.ids);
    for (const fn of _state.subs) {
      try {
        fn(snapshot.slice());
      } catch (_) {}
    }
    const detail = emitDetail(reason);
    forward(detail);
    if (typeof window.dispatchAppDataChanged === "function") {
      window.dispatchAppDataChanged("selection:" + reason);
    }
  }

  const api = {
    clear(reason = "clear") {
      if (_state.ids.size === 0 && _state.type === "contacts") {
        notify(reason);
        return;
      }
      _state.ids.clear();
      _state.type = "contacts";
      syncItems();
      notify(reason);
    },
    set(ids, type, reason = "set") {
      const list = Array.isArray(ids)
        ? ids
        : ids || ids === 0
          ? [ids]
          : [];
      _state.ids = new Set(list.map(String));
      _state.type = _state.ids.size ? normalizeType(type || _state.type) : "contacts";
      syncItems();
      notify(reason);
    },
    add(id, type, reason = "add") {
      if (id == null) return;
      const key = String(id);
      const nextType = type ? normalizeType(type) : _state.type;
      if (_state.ids.size && _state.type !== nextType) {
        _state.ids.clear();
      }
      _state.type = nextType;
      if (_state.ids.has(key)) return;
      _state.ids.add(key);
      syncItems();
      notify(reason);
    },
    remove(id, _type, reason = "remove") {
      if (id == null) return;
      if (!_state.ids.delete(String(id))) return;
      if (_state.ids.size === 0) {
        _state.type = "contacts";
      }
      syncItems();
      notify(reason);
    },
    toggle(id, type, reason = "toggle") {
      if (id == null) return;
      const key = String(id);
      const has = _state.ids.has(key);
      if (has) {
        api.remove(key, type, reason);
      } else {
        api.add(key, type, reason);
      }
    },
    prune(ids, reason = "prune") {
      const list = Array.isArray(ids)
        ? ids
        : ids && typeof ids[Symbol.iterator] === "function"
          ? Array.from(ids)
          : [];
      if (!list.length) return false;
      let changed = false;
      for (const raw of list) {
        if (_state.ids.delete(String(raw))) {
          changed = true;
        }
      }
      if (!changed) return false;
      if (_state.ids.size === 0) {
        _state.type = "contacts";
      }
      syncItems();
      notify(reason);
      return true;
    },
    get(scope) {
      const type = _state.ids.size ? _state.type : normalizeType(scope);
      return { ids: Array.from(_state.ids), type };
    },
    getIds() {
      return Array.from(_state.ids);
    },
    getSelectedIds() {
      return Array.from(_state.ids);
    },
    getCount() {
      return _state.ids.size;
    },
    count() {
      return _state.ids.size;
    },
    size() {
      return _state.ids.size;
    },
    isAnySelected() {
      return _state.ids.size > 0;
    },
    snapshot(scope) {
      const snap = api.get(scope);
      return { ids: snap.ids.slice(), type: snap.type };
    },
    restore(snap, reason = "restore") {
      if (!snap || !Array.isArray(snap.ids)) {
        api.clear(reason);
        return;
      }
      api.set(snap.ids, snap.type, reason);
    },
    reemit(reason = "reemit") {
      _state.lastHash = "";
      notify(reason);
    },
    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      _state.subs.add(fn);
      return () => {
        _state.subs.delete(fn);
      };
    },
  };

  api.del = api.remove;

  Object.defineProperty(api, "type", {
    get() {
      return _state.type;
    },
    set(value) {
      const next = normalizeType(value);
      if (_state.type === next) return;
      _state.type = next;
      syncItems();
      _state.lastHash = "";
      notify("type");
    },
  });

  Object.defineProperty(api, "ids", {
    get() {
      return _state.ids;
    },
  });

  Object.defineProperty(api, "items", {
    get() {
      return _state.items;
    },
  });

  window.selectionService = api;
  if (typeof window.Selection === "undefined") {
    window.Selection = api;
  }
  if (typeof window.SelectionService === "undefined") {
    window.SelectionService = api;
  }
})();
