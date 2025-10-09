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
        if (typeof window.saveContact === "function") window.saveContact(contact, { reason: "contact:docChecklist" });
        else if (typeof window.dispatchAppDataChanged === "function") window.dispatchAppDataChanged("contact:docChecklist");
        render(contact);
      });
      const label = document.createElement("span");
      label.textContent = it.label + (it.done && it.at ? ` — ${fmt(it.at)}` : "");
      li.appendChild(cb);
      li.appendChild(label);
      ul.appendChild(li);
    }
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

  function contactIdFromDetail(detail) {
    if (!detail || typeof detail !== "object") return null;
    if (detail.contact && typeof detail.contact === "object" && detail.contact.id != null) {
      return String(detail.contact.id);
    }
    if (detail.contactId != null) return String(detail.contactId);
    if (detail.detail && typeof detail.detail === "object") {
      const nested = contactIdFromDetail(detail.detail);
      if (nested) return nested;
    }
    const scope = String(detail.scope || detail.entity || "").toLowerCase();
    if ((scope === "contact" || scope === "contacts") && detail.id != null) {
      return String(detail.id);
    }
    return null;
  }

  function activeContactId() {
    try {
      if (typeof document === "undefined") return null;
      const root = document.querySelector('[data-view="contact"]');
      const modal = document.querySelector('#contact-modal');
      const attr =
        (root && root.getAttribute && root.getAttribute("data-contact-id")) ||
        (modal && modal.getAttribute && modal.getAttribute("data-contact-id"));
      if (attr) return String(attr);
    } catch (_) {}
    if (typeof window !== "undefined" && window.__ACTIVE_CONTACT_ID__) return String(window.__ACTIVE_CONTACT_ID__);
    return null;
  }

  async function resolveContact(detail) {
    if (detail && typeof detail === "object" && detail.contact && typeof detail.contact === "object") {
      return detail.contact;
    }
    const id = contactIdFromDetail(detail) || activeContactId();
    if (!id) return null;
    if (typeof window !== "undefined" && typeof window.dbGet === "function") {
      try {
        return await window.dbGet("contacts", id);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  function shouldHandle(detail, raw) {
    if (!detail) return false;
    if (typeof detail === "object") {
      if (detail.contact || detail.contactId != null) return true;
      const scope = String(detail.scope || detail.entity || "").toLowerCase();
      if (scope === "contact" || scope === "contacts") return true;
      const text = [detail.reason, detail.topic, detail.type, detail.action, detail.source]
        .filter(Boolean)
        .map((v) => String(v))
        .join(" ");
      if (/contact/i.test(text)) return true;
    }
    if (raw && /contact/i.test(raw)) return true;
    return false;
  }

  async function refresh(detail) {
    try {
      const contact = await resolveContact(detail);
      if (contact) render(contact);
    } catch (_) {}
  }

  const orig = window.dispatchAppDataChanged;
  window.dispatchAppDataChanged = function patched() {
    const out = orig ? orig.apply(this, arguments) : undefined;
    try {
      const info = extractDispatchDetail(arguments);
      if (shouldHandle(info.detail, info.raw)) refresh(info.detail);
    } catch (_) {}
    return out;
  };

  injectPanel();
  refresh();

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("contact:stageHistory:updated", (event) => {
      try {
        const detail = event && event.detail ? event.detail : {};
        if (detail.contact) render(detail.contact);
        else refresh(detail);
      } catch (_) {}
    });
  }
})();
