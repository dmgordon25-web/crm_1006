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
    const hist = ensureHistory(contact);
    const last = hist[hist.length - 1];
    if (!last || last.stage !== newStage) {
      hist.push({ stage: newStage, at: new Date().toISOString() });
    }
  }

  const onChanged = (reason) => {
    try {
      if (/contact/i.test(reason) && typeof window.getLastSavedContact === "function") {
        const c = window.getLastSavedContact();
        if (c && c.stage) record(c, String(c.stage));
      }
    } catch (_) {}
  };

  const orig = window.dispatchAppDataChanged;
  window.dispatchAppDataChanged = function patched(reason) {
    try { onChanged(String(reason || "")); } catch (_) {}
    return orig ? orig.apply(this, arguments) : undefined;
  };

  window.stageTracker = { record };
})();
