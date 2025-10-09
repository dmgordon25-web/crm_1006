(function () {
  if (window.__WIRED_calendarExport) return;
  window.__WIRED_calendarExport = true;

  const selectorOrder = [
    '[data-view="calendar"] [data-act="export-ics"]',
    '[data-view="calendar"] [data-act="calendar:export:ics"]',
    '#view-calendar [data-act="export-ics"]',
    '#view-calendar [data-act="calendar:export:ics"]',
    '#cal-export-ics',
  ];

  let BUTTON = null;
  let wired = false;

  function normalizeButton(node) {
    if (!node) return null;
    if (node.__calendarExportNormalized) return node;
    const clone = node.cloneNode(true);
    clone.__calendarExportNormalized = true;
    clone.setAttribute('data-act', 'export-ics');
    if (node.parentNode) {
      node.parentNode.replaceChild(clone, node);
    }
    const parent = clone.parentElement;
    if (parent) {
      const duplicates = Array.from(parent.querySelectorAll('[data-act="export-ics"]'));
      duplicates.forEach((el) => {
        if (el !== clone) {
          el.remove();
        }
      });
    }
    return clone;
  }

  function findButton() {
    if (BUTTON && document.contains(BUTTON)) return BUTTON;
    let found = null;
    for (const sel of selectorOrder) {
      if (typeof document?.querySelector !== 'function') break;
      const candidate = document.querySelector(sel);
      if (candidate) {
        found = candidate;
        break;
      }
    }
    if (!found) return null;
    BUTTON = normalizeButton(found);
    return BUTTON;
  }

  function resolveSelectedIds() {
    try {
      const svc = window.selectionService || window.SelectionService || window.Selection;
      if (!svc) return [];
      if (typeof svc.get === 'function') {
        const payload = svc.get('calendar');
        if (payload && Array.isArray(payload.ids)) {
          return payload.ids.map((id) => String(id)).filter(Boolean);
        }
      }
    } catch (_) {}
    return [];
  }

  async function gatherEvents() {
    const ids = resolveSelectedIds();
    const hasSelection = ids.length > 0;
    const idSet = new Set(ids.map(String));

    const use = (value) => (value && typeof value.then === 'function') ? value : Promise.resolve(value);

    const filter = (list) => {
      if (!Array.isArray(list)) return [];
      if (!hasSelection) return list;
      return list.filter((item) => {
        const key = item && (item.id ?? item.uid ?? item.eventId ?? item.calendarEventId);
        return key != null && idSet.has(String(key));
      });
    };

    try {
      if (typeof window.getCalendarEvents === 'function') {
        const result = await use(window.getCalendarEvents({ range: hasSelection ? 'selection' : 'all', ids }));
        const filtered = filter(result);
        if (filtered.length) return filtered;
      }
    } catch (_) {}

    try {
      if (hasSelection && typeof window.CalendarStore?.getEventsByIds === 'function') {
        const result = await use(window.CalendarStore.getEventsByIds(ids));
        const filtered = filter(result);
        if (filtered.length) return filtered;
      }
    } catch (_) {}

    try {
      if (!hasSelection && typeof window.CalendarStore?.visibleEvents === 'function') {
        const result = await use(window.CalendarStore.visibleEvents());
        const filtered = filter(result);
        if (filtered.length) return filtered;
      }
    } catch (_) {}

    try {
      if (typeof window.dbGetAll === 'function') {
        const all = await window.dbGetAll('events').catch(() => []);
        const filtered = filter(all);
        if (filtered.length) return filtered;
      }
    } catch (_) {}

    const fallback = Array.isArray(window.__CAL_EVENTS__) ? filter(window.__CAL_EVENTS__) : [];
    return fallback;
  }

  const safeText = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim();

  function normalizeEvent(event) {
    const firstDate = event?.start || event?.startDate || event?.dtstart || event?.begin || event?.date || event?.start_at;
    const lastDate = event?.end || event?.endDate || event?.dtend || event?.finish || event?.end_at;
    return {
      id: event?.id || event?.uid || event?.eventId || event?.calendarEventId || null,
      title: event?.title || event?.summary || event?.name || 'Event',
      description: event?.description || event?.desc || event?.notes || '',
      location: event?.location || event?.place || '',
      start: firstDate,
      end: lastDate,
      allDay: Boolean(event?.allDay ?? event?.isAllDay ?? event?.allday ?? false),
    };
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  async function buildIcsText() {
    const rawEvents = await gatherEvents();
    const normalized = rawEvents.map(normalizeEvent);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const makeIcs = window.makeIcsFromEvents || window.buildIcsFromEvents;
    if (typeof makeIcs === 'function') {
      try {
        const built = makeIcs(rawEvents, { tz: timezone });
        if (built) return built;
      } catch (_) {}
    }

    if (typeof window.CRM_ICS?.buildICS === 'function') {
      try {
        const built = window.CRM_ICS.buildICS(normalized);
        if (built) return built;
      } catch (_) {}
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CRM_vFinal//EN',
      `X-WR-TIMEZONE:${timezone}`,
    ];

    const stamp = formatDateTime(new Date()) || '';

    normalized.forEach((entry) => {
      lines.push('BEGIN:VEVENT');
      const uid = entry.id ? String(entry.id) : (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `evt-${Math.random().toString(36).slice(2)}`);
      lines.push(`UID:${uid}`);
      if (stamp) lines.push(`DTSTAMP:${stamp}`);
      if (entry.allDay) {
        const startDate = formatDate(entry.start) || formatDate(new Date());
        const endDateSource = entry.end ? entry.end : (() => {
          const start = entry.start ? new Date(entry.start) : new Date();
          if (Number.isNaN(start.getTime())) return null;
          start.setDate(start.getDate() + 1);
          return start;
        })();
        const endDate = formatDate(endDateSource);
        if (startDate) lines.push(`DTSTART;VALUE=DATE:${startDate}`);
        if (endDate) lines.push(`DTEND;VALUE=DATE:${endDate}`);
      } else {
        const start = formatDateTime(entry.start);
        if (start) lines.push(`DTSTART:${start}`);
        const end = formatDateTime(entry.end);
        if (end) lines.push(`DTEND:${end}`);
      }
      const summary = safeText(entry.title || 'Event');
      if (summary) lines.push(`SUMMARY:${summary.replace(/,/g, '\\,').replace(/;/g, '\\;')}`);
      const location = safeText(entry.location);
      if (location) lines.push(`LOCATION:${location.replace(/,/g, '\\,').replace(/;/g, '\\;')}`);
      const desc = safeText(entry.description);
      if (desc) lines.push(`DESCRIPTION:${desc.replace(/,/g, '\\,').replace(/;/g, '\\;')}`);
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  async function onExport(ev) {
    ev?.preventDefault?.();
    try {
      const ics = await buildIcsText();
      if (!ics) return;
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const ymd = new Date().toISOString().slice(0, 10);
      const version = window.__APP_VERSION__;
      const name = `CRM_${version?.tag || 'vFinal'}_${
        version?.ymd || ymd
      }_Calendar.ics`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
      window.dispatchAppDataChanged?.('calendar:export:ics');
    } catch (err) {
      console.error('ICS export failed', err);
    }
  }

  function wire() {
    if (wired) return;
    const btn = findButton();
    if (!btn) return;
    BUTTON = btn;
    if (!BUTTON.__calendarExportWired) {
      BUTTON.__calendarExportWired = true;
      BUTTON.addEventListener('click', onExport);
    }
    wired = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wire();
      if (!wired) window.requestAnimationFrame?.(wire);
    }, { once: true });
  } else {
    wire();
    if (!wired) window.requestAnimationFrame?.(wire);
  }

  document.addEventListener('app:data:changed', () => {
    if (!wired) wire();
  });
})();
