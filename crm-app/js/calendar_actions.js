/* P6c: Calendar export wiring (idempotent) */
(function(){
  if (window.__WIRED_ICS__) return; window.__WIRED_ICS__ = true;

  function currentSelection(){
    // Prefer the selection service when available
    if (window.selectionService && typeof window.selectionService.get === "function"){
      const sel = window.selectionService.get("calendar");
      // sel might be an object { ids, type } — normalize to string[] of ids
      const ids = Array.isArray(sel) ? sel : (Array.isArray(sel?.ids) ? sel.ids : []);
      if (ids.length) return ids;
    }
    // Fallback: selected rows in Calendar view
    const rows = Array.from(document.querySelectorAll(
      '[data-view="calendar"] [data-event][aria-selected="true"]'
    ));
    return rows.map(r => r.getAttribute("data-event-id")).filter(Boolean);
  }

  async function fetchEvents(ids){
    // Project’s existing data source; fallback to window.db if available
    const list = [];
    if (Array.isArray(ids) && ids.length){
      for (const id of ids){
        let ev = null;
        try { ev = await window.db?.get?.("events", id); } catch {}
        if (ev) list.push(ev);
      }
      return list;
    }
    // Fallback: pull visible month’s events from UI adapters if present
    return window.CalendarAPI?.visibleEvents?.() || [];
  }

  function mapToIcsShape(ev){
    return {
      id: ev.id,
      title: ev.title || ev.summary || "Event",
      desc: ev.description || "",
      location: ev.location || "",
      start: ev.start, end: ev.end,
      allDay: !!ev.allDay
    };
  }

  async function exportSelection(){
    const ids = currentSelection();
    const events = await fetchEvents(ids);
    const ics = window.CRM_ICS.buildICS(events.map(mapToIcsShape));
    window.CRM_ICS.downloadICS(ids?.length===1 ? `event-${ids[0]}.ics` : `events-${Date.now()}.ics`, ics);
  }

  // Delegated buttons (no HTML edits): look for data-act hooks
  document.addEventListener("click", (e)=>{
    const btn = e.target?.closest?.('[data-act="calendar:export:ics"],[data-act="calendar:export:ics:batch"]');
    if (!btn) return;
    e.preventDefault();
    exportSelection().then(()=>{
      window.dispatchAppDataChanged?.("calendar:export:ics");
    });
  }, true);
})();
