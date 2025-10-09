/* crm-app/js/services/stage_tracker.js */
(function () {
  if (window.__WIRED_stageTracker) return;
  window.__WIRED_stageTracker = true;

  function ensureHistory(contact) {
    if (!contact) return;
    if (!Array.isArray(contact.stageHistory)) contact.stageHistory = [];
    return contact.stageHistory;
  }

  function canonicalStage(stage) {
    return String(stage || "").trim();
  }

  function inferContactId(detail) {
    if (!detail || typeof detail !== "object") return null;
    if (detail.contact && typeof detail.contact === "object" && detail.contact.id != null) {
      return String(detail.contact.id);
    }
    if (detail.contactId != null) return String(detail.contactId);
    if (detail.detail && typeof detail.detail === "object") {
      const nested = inferContactId(detail.detail);
      if (nested) return nested;
    }
    const scope = String(detail.scope || detail.entity || "").toLowerCase();
    if (scope === "contact" || scope === "contacts") {
      if (detail.id != null) return String(detail.id);
    }
    return null;
  }

  function shouldTrack(detail, raw) {
    if (!detail) return false;
    if (typeof detail === "object") {
      const scope = String(detail.scope || detail.entity || "").toLowerCase();
      if (scope === "contact" || scope === "contacts") return true;
      if (detail.contact || detail.contactId != null) return true;
      const text = [detail.reason, detail.topic, detail.type, detail.action, detail.source]
        .filter(Boolean)
        .map((v) => String(v))
        .join(" ");
      if (/contact/i.test(text)) return true;
    }
    if (raw && /contact/i.test(raw)) return true;
    return false;
  }

  function extractDispatchDetail(argsLike) {
    const args = Array.prototype.slice.call(argsLike || []);
    let raw = "";
    let detail = null;
    for (const arg of args) {
      if (arg == null) continue;
      if (typeof arg === "string" && !raw) raw = arg;
      if (typeof arg === "object") {
        const looksLikeEvent =
          Object.prototype.hasOwnProperty.call(arg || {}, "detail") &&
          (Object.prototype.hasOwnProperty.call(arg, "target") ||
            Object.prototype.hasOwnProperty.call(arg, "currentTarget") ||
            typeof arg.type === "string");
        if (looksLikeEvent) {
          const inner = extractDispatchDetail([arg.detail]);
          if (inner.detail || inner.raw) return inner;
        }
        if (!detail) detail = arg;
        if (!raw) {
          const text = [arg.reason, arg.topic, arg.type, arg.action, arg.source, arg.scope, arg.entity]
            .filter((v) => typeof v === "string" && v)
            .join(" ");
          if (text) raw = text;
        }
      }
    }
    if (!detail && raw) detail = { reason: raw };
    return { detail, raw };
  }

  async function resolveContact(detail) {
    if (!detail) return null;
    if (typeof detail === "object") {
      if (detail.contact && typeof detail.contact === "object") return detail.contact;
    }
    const id = inferContactId(detail);
    if (!id) return null;
    if (typeof window.dbGet === "function") {
      try {
        return await window.dbGet("contacts", id);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  async function record(contact, newStage) {
    if (!contact) return;
    const hist = ensureHistory(contact) || [];
    const last = hist[hist.length - 1];
    if (last && last.stage === newStage) return;
    const entry = { stage: newStage, at: new Date().toISOString() };
    const nextHistory = hist.concat([entry]);
    contact.stageHistory = nextHistory;
    const updated = Object.assign({}, contact, { stageHistory: nextHistory });
    if (typeof window.dbPut === "function" && updated.id != null) {
      try {
        await window.dbPut("contacts", updated);
      } catch (_) {}
    }
    try {
      if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(
          new window.CustomEvent("contact:stageHistory:updated", {
            detail: { contactId: String(updated.id || ""), contact: updated, entry },
          })
        );
      }
    } catch (_) {}
  }

  const onChanged = (detail, raw) => {
    if (!shouldTrack(detail, raw)) return;
    (async () => {
      try {
        const contact = await resolveContact(detail);
        const stage = canonicalStage(contact && contact.stage);
        if (!contact || !stage) return;
        await record(contact, stage);
      } catch (_) {}
    })();
  };

  const orig = window.dispatchAppDataChanged;
  window.dispatchAppDataChanged = function patched() {
    const out = orig ? orig.apply(this, arguments) : undefined;
    try {
      const info = extractDispatchDetail(arguments);
      if (info.detail || info.raw) onChanged(info.detail, info.raw);
    } catch (_) {}
    return out;
  };

  window.stageTracker = { record };
})();
