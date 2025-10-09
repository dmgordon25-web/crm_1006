/* crm-app/js/ui/contact_extras.js */
(function () {
  if (window.__WIRED_contactExtras) return;
  window.__WIRED_contactExtras = true;

  function h(html) {
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstElementChild;
  }

  function injectPanel() {
    const host = document.querySelector('[data-view="contact-detail"]') || document.body;
    if (!host || host.__EXTRAS_INJECTED__) return;
    host.__EXTRAS_INJECTED__ = true;

    const style = document.createElement("style");
    style.textContent = `
      .ce-card{border:1px solid #d1d5db;border-radius:12px;padding:12px;margin:8px 0;background:#fff}
      .ce-title{font-weight:600;margin-bottom:6px}
      .ce-badges{display:flex;flex-wrap:wrap;gap:6px}
      .ce-badge{border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px;font-size:12px}
      .ce-list{list-style:none;margin:6px 0;padding:0}
      .ce-list li{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dashed #eee}
      .ce-list li:last-child{border-bottom:0}
      .ce-check{cursor:pointer}
    `;
    document.head.appendChild(style);

    const panel = h(`
      <div class="ce-card" data-ui="contact-extras">
        <div class="ce-title">Loan Stage Timeline</div>
        <div class="ce-badges" data-ce="timeline"></div>
        <div class="ce-title" style="margin-top:8px">Document Checklist</div>
        <ul class="ce-list" data-ce="checklist"></ul>
      </div>
    `);
    host.appendChild(panel);
  }

  function fmt(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return ""; }
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
    if ((candidate.entity === "contacts" || candidate.table === "contacts") && candidate.id != null) {
      return contactIdFromCandidate(candidate.id, scope);
    }

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
        value.contacts,
        value.items,
        value.records,
      ];
      for (const arr of arrays) {
        if (!Array.isArray(arr)) continue;
        for (const entry of arr) stack.push({ value: entry, scope: currentScope });
      }

      const nestedKeys = ["contact", "record", "item", "payload", "detail", "data", "target"];
      for (const key of nestedKeys) {
        if (value[key]) stack.push({ value: value[key], scope: currentScope });
      }
    }

    return ids;
  }

  function isActiveContact(id) {
    const active = activeContactId();
    return !!active && active === id;
  }

  async function loadContact(contactId) {
    const id = contactId == null ? "" : String(contactId).trim();
    if (!id) return null;
    const get = typeof window.dbGet === "function"
      ? (cid) => window.dbGet("contacts", cid)
      : (typeof window.db?.get === "function" ? (cid) => window.db.get("contacts", cid) : null);
    if (!get) return null;
    try {
      if (typeof window.openDB === "function") {
        try { await window.openDB(); } catch (_) {}
      }
      const contact = await get(id);
      return contact || null;
    } catch (_) {
      return null;
    }
  }

  const pendingRenders = new Map();

  async function render(contact) {
    const root = document.querySelector('[data-ui="contact-extras"]');
    if (!root || !contact) return;

    const targetId = contactIdFromCandidate(contact.id != null ? contact.id : (contact.contactId ?? contact.contactID ?? contact.contact_id));
    const activeId = activeContactId();
    if (activeId && targetId && activeId !== targetId) return;

    const tl = root.querySelector('[data-ce="timeline"]');
    tl.innerHTML = "";
    const hist = contact.stageHistory || [];
    for (const step of hist) {
      const chip = document.createElement("div");
      chip.className = "ce-badge";
      chip.textContent = `${step.stage} • ${fmt(step.at)}`;
      tl.appendChild(chip);
    }

    const ul = root.querySelector('[data-ce="checklist"]');
    if (ul) {
      if (window.docChecklistService?.mountDocChecklist) {
        await window.docChecklistService.mountDocChecklist(contact, contact.loanType, { host: ul });
      } else {
        ul.innerHTML = "";
      }
    }
  }

  function scheduleRenderById(contactId) {
    const id = contactIdFromCandidate(contactId);
    if (!id || !isActiveContact(id)) return;
    if (pendingRenders.has(id)) return;
    pendingRenders.set(id, true);
    Promise.resolve().then(async () => {
      pendingRenders.delete(id);
      if (!isActiveContact(id)) return;
      const contact = await loadContact(id);
      if (!contact) return;
      if (!isActiveContact(id)) return;
      await render(contact);
    });
  }

  function scheduleRenderWithContact(contact) {
    const id = contactIdFromCandidate(contact); // handles objects and primitives
    if (!id || !isActiveContact(id)) return;
    if (pendingRenders.has(id)) return;
    pendingRenders.set(id, true);
    Promise.resolve().then(async () => {
      pendingRenders.delete(id);
      if (!isActiveContact(id)) return;
      const payload = typeof contact === "object" ? contact : null;
      if (payload) await render(payload);
      scheduleRenderById(id);
    });
  }

  function handleDispatch(detail) {
    try {
      if (detail && typeof detail === "object") {
        if (detail.contact) scheduleRenderWithContact(detail.contact);
        if (Array.isArray(detail.contacts)) {
          for (const item of detail.contacts) scheduleRenderWithContact(item);
        }
      }
      const ids = gatherContactIds(detail);
      ids.forEach(scheduleRenderById);
    } catch (_) {}
  }

  const orig = window.dispatchAppDataChanged;
  window.dispatchAppDataChanged = function patched(detail) {
    const out = orig ? orig.apply(this, arguments) : undefined;
    try { handleDispatch(detail); } catch (_) {}
    return out;
  };

  injectPanel();
  document.addEventListener("contact:stageHistory:changed", (event) => {
    try {
      const id = contactIdFromCandidate(event?.detail?.contactId || event?.detail);
      if (id) scheduleRenderById(id);
    } catch (_) {}
  });

  Promise.resolve().then(async () => {
    const initId = activeContactId();
    if (!initId) return;
    const contact = await loadContact(initId);
    if (contact) await render(contact);
  });
})();
