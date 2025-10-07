/* P6c: ICS utility + exporters */
(function(){
  if (window.__ICS_UTIL_V1__) return; window.__ICS_UTIL_V1__ = true;

  const TZ = window.APP_TZ || "America/New_York";
  const CRLF = "\r\n";

  function pad2(n){ return String(n).padStart(2,"0"); }
  function fmtLocalToZ(dt){ // dt is Date in local TZ; output UTC Z format YYYYMMDDTHHMMSSZ
    const z = new Date(dt.getTime() - dt.getTimezoneOffset()*60000);
    const y = z.getUTCFullYear();
    const m = pad2(z.getUTCMonth()+1);
    const d = pad2(z.getUTCDate());
    const H = pad2(z.getUTCHours());
    const M = pad2(z.getUTCMinutes());
    const S = pad2(z.getUTCSeconds());
    return `${y}${m}${d}T${H}${M}${S}Z`;
  }
  function fmtAllDay(d){ // Date-only YYYYMMDD for all-day
    const y = d.getFullYear(), m = pad2(d.getMonth()+1), day = pad2(d.getDate());
    return `${y}${m}${day}`;
  }

  function esc(s){ return String(s||"").replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n"); }

  function vevent(ev){
    // expected ev shape: { id, title, desc, location, start, end, allDay }
    const uid = `crm-${ev.id || Math.random().toString(36).slice(2)}@local`;
    const now = fmtLocalToZ(new Date());
    let body = `BEGIN:VEVENT${CRLF}UID:${uid}${CRLF}DTSTAMP:${now}${CRLF}`;
    const title = esc(ev.title || "Event");
    const desc  = esc(ev.desc || "");
    if (ev.allDay){
      // All-day uses VALUE=DATE; DTEND is exclusive next day
      const s = fmtAllDay(new Date(ev.start));
      const eDate = new Date(ev.start); eDate.setDate(eDate.getDate()+1);
      const e = fmtAllDay(eDate);
      body += `DTSTART;VALUE=DATE:${s}${CRLF}DTEND;VALUE=DATE:${e}${CRLF}`;
    } else {
      body += `DTSTART:${fmtLocalToZ(new Date(ev.start))}${CRLF}`;
      if (ev.end) body += `DTEND:${fmtLocalToZ(new Date(ev.end))}${CRLF}`;
    }
    if (ev.location) body += `LOCATION:${esc(ev.location)}${CRLF}`;
    if (desc)        body += `DESCRIPTION:${desc}${CRLF}`;
    body += `SUMMARY:${title}${CRLF}END:VEVENT${CRLF}`;
    return body;
  }

  function buildICS(events){
    const head = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MortgageCRM//Calendar//EN",
      "CALSCALE:GREGORIAN",
      `X-WR-TIMEZONE:${TZ}`
    ].join(CRLF)+CRLF;
    const tail = "END:VCALENDAR"+CRLF;
    const ve = (events||[]).map(vevent).join("");
    return head + ve + tail;
  }

  function downloadICS(filename, ics){
    const blob = new Blob([ics], {type: "text/calendar;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename || "events.ics";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  window.CRM_ICS = { buildICS, downloadICS };
})();
