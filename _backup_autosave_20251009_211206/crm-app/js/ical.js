
// ical.js — Export birthdays, funded anniversaries, and open tasks (rolling window) as a single .ics
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.ical) return; // idempotent
  window.__INIT_FLAGS__.ical = true;

  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(dt){
    if(typeof dt==='string'){
      // Accept YYYY-MM-DD, MM-DD, MM/DD
      if(/^\d{4}-\d{2}-\d{2}$/.test(dt)){ return dt.replace(/-/g,''); }
      const m = dt.match(/^(\d{1,2})[-\/](\d{1,2})$/);
      if(m){ const year = (new Date()).getFullYear(); return `${year}${pad(+m[1])}${pad(+m[2])}`; }
      // Fallback: Date parse
      const d = new Date(dt); if(!isNaN(d)) return d.toISOString().slice(0,10).replace(/-/g,'');
      return '';
    }
    const d = (dt instanceof Date) ? dt : new Date(dt);
    if(isNaN(d)) return '';
    return d.toISOString().slice(0,10).replace(/-/g,'');
  }
  function escapeText(s){
    return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
  }
  function foldLine(s){
    // Fold to <=75 octets per RFC5545-ish; simple 75-char fold is OK for our ASCII content
    const out = [];
    let i=0;
    while(i < s.length){
      out.push(s.slice(i, i+75));
      i += 75;
      if(i < s.length) out[out.length-1] += "\r\n ";
    }
    return out.join('');
  }
  function vevent({uid, dtstart, summary, description, rrule}){
    const nextDate = (()=>{
      if(!/^\d{8}$/.test(dtstart)) return '';
      const year = Number(dtstart.slice(0,4));
      const month = Number(dtstart.slice(4,6)) - 1;
      const day = Number(dtstart.slice(6,8));
      const next = new Date(Date.UTC(year, month, day + 1));
      if(Number.isNaN(next.getTime())) return '';
      return `${next.getUTCFullYear()}${pad(next.getUTCMonth()+1)}${pad(next.getUTCDate())}`;
    })();
    const dtendValue = nextDate || dtstart;
    const lines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${ymd(Date.now())}T000000Z`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtendValue}`,
      `SUMMARY:${escapeText(summary)}`
    ];
    if(description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if(rrule) lines.push(`RRULE:${rrule}`);
    lines.push('END:VEVENT');
    return lines.map(foldLine).join('\r\n');
  }

  function yearRRuleFromMMDD(dtstr){
    // If input didn't include year, create BYMONTH/BYMONTHDAY rule to recur yearly.
    const m = dtstr.match(/^\d{4}(\d{2})(\d{2})$/);
    if(!m) return '';
    return `FREQ=YEARLY;BYMONTH=${parseInt(m[1],10)};BYMONTHDAY=${parseInt(m[2],10)}`;
  }

  async function buildEvents(){
    await openDB();
    const [contacts, tasks] = await Promise.all([dbGetAll('contacts'), dbGetAll('tasks')]);
    const events = [];

    // Birthdays (supports 'birthday' on contact; accepts 'MM-DD' or 'YYYY-MM-DD')
    for(const c of contacts){
      const b = c.birthday || c.birthDate || '';
      if(!b) continue;
      const date = ymd(b); if(!date) continue;
      const uid = `crm:bday:${c.id||escapeText(c.email||c.phone||fullName(c))}@local`;
      const summary = `🎂 ${fullName(c)||'Contact'} — Birthday`;
      const rrule = /^\d{8}$/.test(date) && !/^\d{4}0{4}$/.test(date) ? yearRRuleFromMMDD(date) : ''; // always yearly; safe if DATE has year
      events.push(vevent({uid, dtstart: date, summary, description: '', rrule: rrule||`FREQ=YEARLY`}));
    }

    // Funded anniversaries (from fundedDate — yearly)
    for(const c of contacts){
      const f = c.fundedDate || c.fundedOn || '';
      if(!f) continue;
      const date = ymd(f); if(!date) continue;
      const uid = `crm:funded:${c.id||escapeText(c.email||c.phone||fullName(c))}@local`;
      const summary = `🏁 ${fullName(c)||'Client'} — Funding Anniversary`;
      events.push(vevent({uid, dtstart: date, summary, description: '', rrule:'FREQ=YEARLY'}));
    }

    // Open tasks/reminders in rolling 30-day window
    const now = Date.now();
    const soon = now + 30*86400000;
    for(const t of tasks){
      if(t.done) continue;
      if(!t.due) continue;
      const due = new Date(t.due).getTime();
      if(isNaN(due) || due>soon) continue;
      const date = ymd(t.due); if(!date) continue;
      const uid = `crm:task:${t.id||Math.random().toString(16).slice(2)}@local`;
      const summary = `🔔 ${t.title||'Task'} (Due)`;
      const desc = t.note || t.description || '';
      events.push(vevent({uid, dtstart: date, summary, description: desc}));
    }

    return events;
  }

  function wrapCalendar(components){
    const head = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//THE CRM Tool//Modular v1//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ].join('\r\n');
    return head + '\r\n' + components.join('\r\n') + '\r\nEND:VCALENDAR\r\n';
  }

  function downloadCalendar(components, filename){
    const ics = wrapCalendar(components);
    const blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'crm-export.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=> { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  async function exportToIcalFile(){
    const events = await buildEvents();
    downloadCalendar(events, 'crm-export.ics');
    return true;
  }

  function normalizeCustomEvent(evt, index){
    if(!evt) return null;
    const rawDate = evt.date || evt.dtstart || evt.when;
    const dtstart = ymd(rawDate);
    if(!dtstart) return null;
    const summary = evt.summary || evt.title || 'CRM Event';
    const description = evt.description || evt.meta || '';
    const uid = evt.uid || `crm:widget:${index}:${dtstart}@local`;
    return vevent({uid, dtstart, summary, description});
  }

  async function exportCustomEventsToIcs(events, filename){
    const list = Array.isArray(events) ? events : [];
    const components = list.map((evt, idx)=> normalizeCustomEvent(evt, idx)).filter(Boolean);
    if(!components.length) throw new Error('No events to export');
    downloadCalendar(components, filename || 'crm-events.ics');
    return true;
  }

  // Expose
  window.exportToIcalFile = exportToIcalFile;
  window.exportCustomEventsToIcs = exportCustomEventsToIcs;

  // Self-test helper
  window.__generateIcsTextForTest = async function(){
    const events = await buildEvents();
    return wrapCalendar(events);
  };
})();
