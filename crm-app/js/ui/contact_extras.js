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
    const candidates = [
      document.querySelector('[data-view="contact-detail"]'),
      document.querySelector('[data-view="contact"]'),
      document.querySelector('[data-contact-id]'),
    ];
    for (const node of candidates) {
      const id = node?.getAttribute?.("data-contact-id");
      if (id) return id;
    }
    return window.__ACTIVE_CONTACT_ID__ || null;
  }

  function shouldRenderFor(id) {
    if (!id) return false;
    const current = activeContactId();
    return !current || String(current) === String(id);
  }

  function contactIdFromDetail(detail) {
    if (!detail) return null;
    if (typeof detail === "object") {
      if (detail.contactId != null) return String(detail.contactId);
      const contactObj = detail.contact;
      if (contactObj && typeof contactObj === "object" && contactObj.id != null) {
        return String(contactObj.id);
      }
      const scope = typeof detail.scope === "string" ? detail.scope.toLowerCase() : "";
      if (scope === "contacts" || scope === "contact") {
        const fallback = detail.id ?? detail.targetId ?? null;
        return fallback != null ? String(fallback) : activeContactId();
      }
      const topic = typeof detail.topic === "string" ? detail.topic.toLowerCase() : "";
      if (topic.includes("contact")) return activeContactId();
      const source = typeof detail.source === "string" ? detail.source.toLowerCase() : "";
      if (source.includes("contact")) return activeContactId();
      return null;
    }
    if (typeof detail === "string") {
      const lower = detail.toLowerCase();
      if (lower.startsWith("contact") || lower.includes("contact:")) {
        return activeContactId();
      }
    }
    return null;
  }

  function fetchAndRender(id) {
    if (!id) return;
    if (!shouldRenderFor(id)) return;
    if (typeof window.dbGet === "function") {
      Promise.resolve(window.dbGet("contacts", String(id)))
        .then((contact) => { if (contact) render(contact); })
        .catch(() => {});
      return;
    }
    const fallback = typeof window.getActiveContact === "function" ? window.getActiveContact() : null;
    if (fallback && String(fallback.id) === String(id)) render(fallback);
  }

  function render(contact) {
    const root = document.querySelector('[data-ui="contact-extras"]');
    if (!root || !contact) return;

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
    ul.innerHTML = "";
    const items = window.docChecklistService?.seedIfEmpty(contact, contact.loanType) || [];
    for (const it of items) {
      const li = document.createElement("li");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "ce-check";
      cb.checked = !!it.done;
      cb.addEventListener("change", () => {
        window.docChecklistService?.toggle(contact, it.label, cb.checked);
        let persisted = null;
        if (typeof window.dbPut === "function") {
          persisted = Promise.resolve(window.dbPut("contacts", contact)).catch(() => {});
        } else if (typeof window.saveContact === "function") {
          persisted = Promise.resolve(window.saveContact(contact, { reason: "contact:docChecklist" })).catch(() => {});
        }
        if (typeof window.dispatchAppDataChanged === "function") {
          const emit = () => {
            try {
              window.dispatchAppDataChanged({ scope: "contacts", contactId: contact.id, source: "contact:docChecklist" });
            } catch (_) {}
          };
          if (persisted && typeof persisted.then === "function") persisted.then(emit, emit);
          else emit();
        }
        render(contact);
      });
      const label = document.createElement("span");
      label.textContent = it.label + (it.done && it.at ? ` — ${fmt(it.at)}` : "");
      li.appendChild(cb);
      li.appendChild(label);
      ul.appendChild(li);
    }
  }

  const orig = window.dispatchAppDataChanged;
  window.dispatchAppDataChanged = function patched(reason) {
    const out = orig ? orig.apply(this, arguments) : undefined;
    try {
      const id = contactIdFromDetail(reason);
      if (id) fetchAndRender(id);
    } catch (_) {}
    return out;
  };

  injectPanel();
  const initialId = activeContactId();
  if (initialId) fetchAndRender(initialId);
})();
