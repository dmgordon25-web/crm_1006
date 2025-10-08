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

    // PRE-CLEAN: remove legacy export buttons that lack data-act (avoid duplicates)
    host.querySelectorAll('button').forEach(btn => {
      const txt = (btn.textContent || '').trim().toLowerCase();
      const hasAct = btn.hasAttribute('data-act');
      if (!hasAct && (txt === 'export ics' || txt === 'export csv')) {
        btn.remove();
      }
    });

    const ensureOne = (selector, build) => {
      const list = host.querySelectorAll(selector);
      if (list.length > 1) { [...list].slice(1).forEach((n) => n.remove()); return list[0]; }
      if (list.length === 1) return list[0];
      const el = build(); host.appendChild(el); return el;
    };

    ensureOne('[data-act="calendar:export:ics"]', () => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-act", "calendar:export:ics");
      button.textContent = "Export ICS";
      return button;
    });

    ensureOne('[data-act="calendar:export:csv"]', () => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-act", "calendar:export:csv");
      button.textContent = "Export CSV";
      return button;
    });
  }

  function currentSelectionIds(){
    if (window.selectionService?.get){
      const sel = window.selectionService.get("calendar");
      const ids = Array.isArray(sel) ? sel : (Array.isArray(sel?.ids) ? sel.ids : []);
      if (ids.length) return ids;
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

  function mapEventForICS(event){
    const title = event.title || event.name || "Event";
    const desc = event.description || event.desc || event.notes || "";
    return {
      id: event.id,
      title, description: desc,
      location: event.location || "",
      start: event.start || event.startDate || event.starts_at,
      end: event.end || event.endDate || event.end_at,
      allDay: Boolean(event.allDay ?? event.isAllDay ?? false)
    };
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
    const icsBtn = event.target.closest?.('[data-act="calendar:export:ics"]');
    const csvBtn = !icsBtn && event.target.closest?.('[data-act="calendar:export:csv"]');
    if (!icsBtn && !csvBtn) return;

    event.preventDefault();
    const ids = currentSelectionIds();
    const events = await eventsForExport(ids);

    if (icsBtn) {
      let icsContent = null;
      if (typeof window.buildICS === "function") {
        icsContent = window.buildICS(events);
      } else if (typeof window.CalendarICS?.build === "function") {
        icsContent = window.CalendarICS.build(events);
      } else if (typeof window.CRM_ICS?.buildICS === "function") {
        icsContent = window.CRM_ICS.buildICS((events || []).map(mapEventForICS));
      }
      if (!icsContent) return;
      const filename = ids.length === 1 ? `event-${ids[0]}.ics` : `events-${Date.now()}.ics`;
      if (typeof window.CRM_ICS?.downloadICS === "function") window.CRM_ICS.downloadICS(filename, icsContent);
      else download(filename, icsContent, "text/calendar;charset=utf-8");
      window.dispatchAppDataChanged?.("calendar:export:ics");
    } else if (csvBtn) {
      const csv = toCSV(events || []);
      const filename = ids.length === 1 ? `event-${ids[0]}.csv` : `events-${Date.now()}.csv`;
      download(filename, csv, "text/csv;charset=utf-8");
      window.dispatchAppDataChanged?.("calendar:export:csv");
    }
  }, true);
})();
