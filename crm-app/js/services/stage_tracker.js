/* crm-app/js/services/stage_tracker.js */
(function () {
  if (window.__WIRED_stageTracker) return;
  window.__WIRED_stageTracker = true;

  function ensureHistory(contact) {
    if (!contact) return [];
    if (!Array.isArray(contact.stageHistory)) contact.stageHistory = [];
    return contact.stageHistory;
  }

  function normalizeStage(value) {
    const raw = value == null ? "" : String(value);
    const trimmed = raw.trim();
    return trimmed;
  }

  function record(contact, newStage) {
    if (!contact) return null;
    const stage = normalizeStage(newStage != null ? newStage : contact.stage);
    if (!stage) return null;
    const hist = ensureHistory(contact);
    const last = hist[hist.length - 1];
    if (last && normalizeStage(last.stage) === stage) return null;
    const entry = { stage, at: new Date().toISOString() };
    hist.push(entry);
    return entry;
  }

  function activeContactId() {
    try {
      const root = document.querySelector('[data-view="contact"]') || document.body;
      const attr = root?.getAttribute?.("data-contact-id");
      const fallback = typeof window.__ACTIVE_CONTACT_ID__ === "string" ? window.__ACTIVE_CONTACT_ID__ : null;
      const id = attr && String(attr).trim() ? String(attr).trim() : fallback && String(fallback).trim();
      return id || null;
    } catch (_) {
      return null;
    }
  }

  function contactIdFromCandidate(candidate, scopeHint) {
    if (candidate == null) return null;
    if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") {
      const str = String(candidate).trim();
      return str || null;
    }
    if (typeof candidate !== "object") return null;

    if (candidate === window) return null;

    if (candidate.contactId != null) return contactIdFromCandidate(candidate.contactId, scopeHint);
    if (candidate.contactID != null) return contactIdFromCandidate(candidate.contactID, scopeHint);
    if (candidate.contact_id != null) return contactIdFromCandidate(candidate.contact_id, scopeHint);

    const scope = scopeHint
      || candidate.scope
      || candidate.store
      || candidate.entity
      || candidate.topic
      || candidate.type
      || candidate.source
      || candidate.table
      || candidate.reason
      || candidate.action
      || candidate.kind
      || "";

    const looksContact = /contact/i.test(String(scope || ""));
    const hasTraits = looksContact
      || Object.prototype.hasOwnProperty.call(candidate, "stage")
      || Object.prototype.hasOwnProperty.call(candidate, "loanType")
      || Object.prototype.hasOwnProperty.call(candidate, "firstName")
      || Object.prototype.hasOwnProperty.call(candidate, "lastName")
      || Object.prototype.hasOwnProperty.call(candidate, "email")
      || Object.prototype.hasOwnProperty.call(candidate, "phone");

    if (hasTraits && candidate.id != null) return contactIdFromCandidate(candidate.id, scope);
    if (candidate.entity === "contacts" && candidate.id != null) return contactIdFromCandidate(candidate.id, scope);
    if (candidate.table === "contacts" && candidate.id != null) return contactIdFromCandidate(candidate.id, scope);

    if (candidate.contact) return contactIdFromCandidate(candidate.contact, scope);
    return null;
  }

  function gatherContactIds(detail) {
    const ids = new Set();
    const stack = [];
    const seen = new Set();
    if (detail !== undefined) stack.push({ value: detail, scope: null });

    while (stack.length) {
      const { value, scope } = stack.pop();
      if (value == null) continue;

      const type = typeof value;
      if (type === "string" || type === "number" || type === "boolean") {
        if (type === "string" && /contact/i.test(value)) {
          const active = activeContactId();
          if (active) ids.add(active);
        } else if (scope && /contact/i.test(String(scope))) {
          const id = contactIdFromCandidate(value, scope);
          if (id) ids.add(id);
        }
        continue;
      }

      if (type !== "object") continue;
      if (seen.has(value)) continue;
      seen.add(value);

      const currentScope =
        scope
        || value.scope
        || value.store
        || value.entity
        || value.topic
        || value.type
        || value.source
        || value.table
        || value.reason
        || value.action
        || value.kind
        || "";

      const candidateId = contactIdFromCandidate(value, currentScope);
      if (candidateId) ids.add(candidateId);

      const looksContact = /contact/i.test(String(currentScope || ""));

      const arrays = [
        value.contactIds,
        looksContact ? value.ids : null,
        value.items,
        value.contacts,
        value.records,
      ];
      for (const arr of arrays) {
        if (!Array.isArray(arr)) continue;
        for (const entry of arr) {
          stack.push({ value: entry, scope: currentScope });
        }
      }

      const nestedKeys = ["contact", "record", "item", "payload", "detail", "data", "target"];
      for (const key of nestedKeys) {
        if (value[key]) stack.push({ value: value[key], scope: currentScope });
      }
    }

    return ids;
  }

  function dbGetContact(contactId) {
    const id = contactId == null ? "" : String(contactId).trim();
    if (!id) return Promise.resolve(null);
    const get = typeof window.dbGet === "function"
      ? (cid) => window.dbGet("contacts", cid)
      : (typeof window.db?.get === "function" ? (cid) => window.db.get("contacts", cid) : null);
    if (!get) return Promise.resolve(null);
    return (async () => {
      try {
        if (typeof window.openDB === "function") {
          try { await window.openDB(); } catch (_) {}
        }
        const contact = await get(id);
        return contact || null;
      } catch (_) {
        return null;
      }
    })();
  }

  async function persistContact(contact) {
    if (!contact || contact.id == null) return false;
    const put = typeof window.dbPut === "function"
      ? (row) => window.dbPut("contacts", row)
      : (typeof window.db?.put === "function" ? (row) => window.db.put("contacts", row) : null);
    if (!put) return false;
    try {
      await put(contact);
      return true;
    } catch (_) {
      return false;
    }
  }

  const pending = new Map();

  function scheduleHistoryWrite(contactId) {
    const id = contactId == null ? "" : String(contactId).trim();
    if (!id) return;
    if (pending.has(id)) return;
    pending.set(id, true);
    Promise.resolve().then(async () => {
      try {
        const contact = await dbGetContact(id);
        if (!contact) return;
        const entry = record(contact, contact.stage);
        if (!entry) return;
        const saved = await persistContact(contact);
        if (saved && typeof document?.dispatchEvent === "function") {
          document.dispatchEvent(new CustomEvent("contact:stageHistory:changed", {
            detail: { contactId: id, stage: entry.stage, at: entry.at }
          }));
        }
      } finally {
        pending.delete(id);
      }
    });
  }

  function onChanged(detail) {
    try {
      const ids = gatherContactIds(detail);
      if (!ids.size && typeof detail === "object" && detail && detail.contact) {
        const direct = contactIdFromCandidate(detail.contact, detail.contact?.scope);
        if (direct) ids.add(direct);
      }
      if (!ids.size) {
        const fallback = activeContactId();
        if (fallback) ids.add(fallback);
      }
      ids.forEach(scheduleHistoryWrite);
    } catch (_) {}
  }

  const orig = window.dispatchAppDataChanged;
  window.dispatchAppDataChanged = function patched(detail) {
    try { onChanged(detail); } catch (_) {}
    return orig ? orig.apply(this, arguments) : undefined;
  };

  window.stageTracker = { record };
})();
