/* P6c: Calendar export wiring (idempotent) */
(function(){
  if (window.__CAL_EXPORT_WIRED__) return;
  window.__CAL_EXPORT_WIRED__ = true;

  function ensureCalendarButtons(){
    const host = document.querySelector('[data-view="calendar"] [data-role="toolbar"]')
      || document.querySelector('[data-view="calendar"]')
      || document.body
      || document;

    if (!host) return;

    host.querySelectorAll('button').forEach(btn => {
      const txt = (btn.textContent || '').trim().toLowerCase();
      const hasAct = btn.hasAttribute('data-act');
      if (!hasAct && txt === 'export csv') {
        btn.remove();
      }
    });

    const ensureOne = (selector, build) => {
      const list = host.querySelectorAll(selector);
      if (list.length > 1) { [...list].slice(1).forEach((n) => n.remove()); return list[0]; }
      if (list.length === 1) return list[0];
      const el = build(); host.appendChild(el); return el;
    };

    ensureOne('[data-act="calendar:export:csv"]', () => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-act", "calendar:export:csv");
      button.textContent = "Export CSV";
      return button;
    });
  }

  function currentSelectionIds(){
    const svc = window.selectionService || window.SelectionService || window.Selection;
    if (svc){
      try {
        const type = typeof svc.getSelectionType === 'function' ? svc.getSelectionType() : svc.type;
        if (type === 'calendar') {
          const ids = typeof svc.getSelection === 'function' ? svc.getSelection() : (typeof svc.getIds === 'function' ? svc.getIds() : []);
          if (Array.isArray(ids) && ids.length) return ids.map((id) => String(id));
        }
      } catch (err) {
        console.warn('[calendar] selection lookup failed', err);
      }
    }
    const rows = Array.from(document.querySelectorAll('[data-view="calendar"] [data-event][aria-selected="true"]'));
    return rows.map((row) => row.getAttribute("data-event-id")).filter(Boolean);
  }

  async function eventsForExport(ids = currentSelectionIds()){
    const fromStore = async (value) => (value && typeof value.then === "function") ? value : value;

    if (ids.length && typeof window.CalendarStore?.getEventsByIds === "function") {
      const events = await fromStore(window.CalendarStore.getEventsByIds(ids));
      if (Array.isArray(events) && events.length) return events;
    }
    if (typeof window.CalendarStore?.visibleEvents === "function") {
      const events = await fromStore(window.CalendarStore.visibleEvents());
      if (Array.isArray(events) && events.length) return events;
    }
    if (ids.length && window.db?.get){
      const result = [];
      for (const id of ids){
        try { const event = await window.db.get("events", id); if (event) result.push(event); } catch {}
      }
      if (result.length) return result;
    }
    return [];
  }

  function download(filename, content, mime){
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function toCSV(events){
    const header = ["Title","Start","End","AllDay","Location","Description"];
    const lines = [header.join(",")];
    (events || []).forEach(ev => {
      const title = (ev.title || ev.name || "").replace(/"/g,'""');
      const start = ev.start || ev.startDate || ev.starts_at || "";
      const end = ev.end || ev.endDate || ev.end_at || "";
      const allday = String(Boolean(ev.allDay ?? ev.isAllDay ?? false));
      const loc = (ev.location || "").replace(/"/g,'""');
      const desc = (ev.description || ev.desc || ev.notes || "").replace(/"/g,'""');
      lines.push([title,start,end,allday,loc,desc].map(x=>`"` + String(x??"").replace(/\r?\n/g," ").trim() + `"`).join(","));
    });
    return lines.join("\r\n");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureCalendarButtons, { once: true });
  } else {
    ensureCalendarButtons();
  }
  document.addEventListener("app:data:changed", ensureCalendarButtons);

  document.addEventListener("click", async (event) => {
    const csvBtn = event.target.closest?.('[data-act="calendar:export:csv"]');
    if (!csvBtn) return;

    event.preventDefault();
    const ids = currentSelectionIds();
    const events = await eventsForExport(ids);

    const csv = toCSV(events || []);
    const filename = ids.length === 1 ? `event-${ids[0]}.csv` : `events-${Date.now()}.csv`;
    download(filename, csv, "text/csv;charset=utf-8");
    window.dispatchAppDataChanged?.("calendar:export:csv");
  }, true);
})();
