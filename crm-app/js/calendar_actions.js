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

    const ensureOne = (selector, build) => {
      const list = host.querySelectorAll(selector);
      if (list.length > 1) {
        [...list].slice(1).forEach((node) => node.remove());
        return list[0];
      }
      if (list.length === 1) return list[0];
      const el = build();
      host.appendChild(el);
      return el;
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
    const fromStore = async (value) => {
      if (value && typeof value.then === "function") return value;
      return value;
    };

    if (ids.length && typeof window.CalendarStore?.getEventsByIds === "function") {
      const events = await fromStore(window.CalendarStore.getEventsByIds(ids));
      if (Array.isArray(events) && events.length) return events;
    }

    if (typeof window.CalendarStore?.visibleEvents === "function") {
      const events = await fromStore(window.CalendarStore.visibleEvents());
      if (Array.isArray(events) && events.length) return events;
      if (events) return events;
    }

    if (ids.length && window.db?.get){
      const result = [];
      for (const id of ids){
        try {
          const event = await window.db.get("events", id);
          if (event) result.push(event);
        } catch (error) {
          console.warn("calendar export: failed to load event", id, error);
        }
      }
      if (result.length) return result;
    }

    const nodes = Array.from(document.querySelectorAll('[data-view="calendar"] [data-event]'));
    return nodes.map((node) => ({
      id: node.getAttribute("data-event-id"),
      title: node.getAttribute("data-title") || node.textContent?.trim() || "Event",
      start: node.getAttribute("data-start"),
      end: node.getAttribute("data-end")
    }));
  }

  function download(filename, text, mime = "text/plain;charset=utf-8"){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function toCSV(events){
    const header = ["Title", "Start", "End", "ID"];
    const rows = (events || []).map((event) => [
      (event.title || "").replace(/"/g, '""'),
      event.start || "",
      event.end || "",
      event.id || ""
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\r\n");
    return csv;
  }

  function mapEventForICS(event){
    return {
      id: event.id || event.eventId,
      title: event.title || event.summary || event.name || "Event",
      desc: event.description || event.desc || event.notes || "",
      location: event.location || event.place || "",
      start: event.start || event.startDate || event.start_at,
      end: event.end || event.endDate || event.end_at,
      allDay: Boolean(event.allDay ?? event.isAllDay ?? false)
    };
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
      if (typeof window.CRM_ICS?.downloadICS === "function") {
        window.CRM_ICS.downloadICS(filename, icsContent);
      } else {
        download(filename, icsContent, "text/calendar;charset=utf-8");
      }
      window.dispatchAppDataChanged?.("calendar:export:ics");
    } else if (csvBtn) {
      const csv = toCSV(events || []);
      const filename = ids.length === 1 ? `event-${ids[0]}.csv` : `events-${Date.now()}.csv`;
      download(filename, csv, "text/csv;charset=utf-8");
      window.dispatchAppDataChanged?.("calendar:export:csv");
    }
  }, true);
})();
