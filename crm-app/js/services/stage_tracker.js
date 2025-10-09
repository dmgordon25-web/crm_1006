/* crm-app/js/services/stage_tracker.js */
(function () {
  if (window.__WIRED_stageTracker) return;
  window.__WIRED_stageTracker = true;

  function ensureHistory(contact) {
    if (!contact) return;
    if (!Array.isArray(contact.stageHistory)) contact.stageHistory = [];
    return contact.stageHistory;
  }

  function record(contact, newStage) {
    if (!contact) return;
    const stage = (newStage == null ? "" : String(newStage)).trim();
    if (!stage) return;
    const hist = ensureHistory(contact);
    const last = hist[hist.length - 1];
    if (!last || last.stage !== stage) {
      hist.push({ stage, at: new Date().toISOString() });
    }
  }

  async function hydrateHistory(contact) {
    if (!contact) return;
    if (Array.isArray(contact.stageHistory)) return;
    const key = contact.id != null ? String(contact.id) : "";
    if (!key || typeof window.dbGet !== "function") {
      contact.stageHistory = [];
      return;
    }
    try {
      const prev = await window.dbGet("contacts", key);
      if (prev && Array.isArray(prev.stageHistory)) {
        contact.stageHistory = prev.stageHistory.slice();
      } else {
        contact.stageHistory = [];
      }
    } catch (_) {
      contact.stageHistory = [];
    }
  }

  function wrapDbPut(fn) {
    if (typeof fn !== "function" || fn.__STAGE_TRACKER_PATCHED__) return;
    const wrapped = function stageTrackerDbPut(store, obj) {
      if (store !== "contacts" || !obj) {
        return fn.apply(this, arguments);
      }
      return (async () => {
        try {
          await hydrateHistory(obj);
          record(obj, obj.stage);
        } catch (_) {}
        return fn.apply(this, arguments);
      })();
    };
    wrapped.__STAGE_TRACKER_PATCHED__ = true;
    window.dbPut = wrapped;
  }

  (function ensureDbPutPatched(attempt) {
    if (typeof window.dbPut === "function") {
      wrapDbPut(window.dbPut);
      return;
    }
    if ((attempt || 0) > 20) return;
    setTimeout(() => ensureDbPutPatched((attempt || 0) + 1), 50);
  })();

  window.stageTracker = { record };
})();
