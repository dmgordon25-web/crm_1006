import { generateICS } from "./calendar_ics.js";

const LEGACY_BUTTON_SELECTORS = [
  '[data-view="calendar"] [data-act="export-ics"]',
  '[data-view="calendar"] [data-act="calendar:export:ics"]',
  '#view-calendar [data-act="export-ics"]',
  '#view-calendar [data-act="calendar:export:ics"]',
  '#cal-export-ics',
];

let wiring = false;

function currentTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (_) {
    return null;
  }
}

function findCalendarToolbar() {
  return (
    document.querySelector('[data-view="calendar"] [data-role="toolbar"]') ||
    document.querySelector('[data-view="calendar"] [data-toolbar]') ||
    document.querySelector('#view-calendar [data-role="toolbar"]') ||
    document.querySelector('#view-calendar') ||
    document.querySelector('[data-view="calendar"]') ||
    null
  );
}

function normalizeButton(node) {
  if (!node) return null;
  node.setAttribute('data-act', 'ics');
  if (!node.textContent || !node.textContent.trim()) {
    node.textContent = 'Export ICS';
  }
  return node;
}

function removeDuplicateButtons(preferred, scope) {
  if (!scope) return;
  const candidates = scope.querySelectorAll('[data-act="ics"],[data-act="export-ics"],[data-act="calendar:export:ics"]');
  candidates.forEach((node) => {
    if (node !== preferred) node.remove();
  });
}

function ensureButton() {
  const toolbar = findCalendarToolbar();
  if (!toolbar) return null;

  let button = toolbar.querySelector('[data-act="ics"]');
  if (!button) {
    for (const selector of LEGACY_BUTTON_SELECTORS) {
      const legacy = document.querySelector(selector);
      if (legacy) {
        button = normalizeButton(legacy);
        break;
      }
    }
  }

  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Export ICS';
    button.setAttribute('data-act', 'ics');
    toolbar.appendChild(button);
  } else {
    normalizeButton(button);
  }

  removeDuplicateButtons(button, toolbar);
  return button;
}

function resolveSelectedIds() {
  try {
    const svc = window.selectionService || window.SelectionService || window.Selection;
    if (!svc) return [];
    const type = typeof svc.getSelectionType === 'function' ? svc.getSelectionType() : svc.type;
    if (type !== 'calendar') return [];
    const rawIds = typeof svc.getSelection === 'function'
      ? svc.getSelection()
      : (typeof svc.getIds === 'function' ? svc.getIds() : []);
    if (!Array.isArray(rawIds)) return [];
    return rawIds.map((id) => String(id)).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function candidateKey(event) {
  return (
    event?.id ??
    event?.uid ??
    event?.eventId ??
    event?.calendarEventId ??
    event?.calendar_id ??
    null
  );
}

async function gatherEvents() {
  const ids = resolveSelectedIds();
  const hasSelection = ids.length > 0;
  const idSet = new Set(ids.map(String));

  const use = (value) => (value && typeof value.then === 'function' ? value : Promise.resolve(value));

  const filter = (list) => {
    if (!Array.isArray(list)) return [];
    if (!hasSelection) return list;
    return list.filter((item) => {
      const key = candidateKey(item);
      return key != null && idSet.has(String(key));
    });
  };

  try {
    if (typeof window.getCalendarEvents === 'function') {
      const result = await use(window.getCalendarEvents({ range: hasSelection ? 'selection' : 'visible', ids }));
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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isDateOnly(value) {
  if (value instanceof Date) return false;
  if (typeof value === 'string') return DATE_ONLY.test(value.trim());
  return false;
}

function mapEventForICS(event) {
  if (!event) return null;
  const start = event.start ?? event.startDate ?? event.dtstart ?? event.begin ?? event.date ?? event.start_at ?? event.starts_at;
  const end = event.end ?? event.endDate ?? event.dtend ?? event.finish ?? event.end_at ?? event.ends_at;

  let allDay = Boolean(event.allDay ?? event.isAllDay ?? event.allday);
  if (!allDay && isDateOnly(start)) allDay = true;

  return {
    id: candidateKey(event) || null,
    title: event.title ?? event.summary ?? event.name ?? event.subject ?? 'Event',
    description: event.description ?? event.desc ?? event.notes ?? '',
    location: event.location ?? event.place ?? '',
    start,
    end,
    allDay,
    tz: event.tz || event.timezone || event.timeZone || event.tzid || null,
    contactName: event.contactName || event.contact || event.borrower || event.borrowerName || event.clientName || null,
    calendarName: event.calendarName || event.calendar || event.source || null,
  };
}

function inferFilenameHint(events) {
  if (!Array.isArray(events) || events.length === 0) return 'calendar';
  const sample = events[0] || {};
  const fromContact =
    sample.contactName ||
    sample.contact ||
    sample.borrower ||
    sample.borrowerName ||
    sample.clientName ||
    sample.name;
  if (fromContact && String(fromContact).trim()) return fromContact;
  const fromCalendar = sample.calendarName || sample.calendar || sample.source || sample.type;
  if (fromCalendar && String(fromCalendar).trim()) return fromCalendar;
  if (events.length === 1) {
    const title = sample.title || sample.summary || sample.name;
    if (title && String(title).trim()) return title;
  }
  return 'calendar';
}

async function handleExport(event) {
  event?.preventDefault?.();
  try {
    const rawEvents = await gatherEvents();
    const mapped = rawEvents.map(mapEventForICS).filter(Boolean);
    if (!mapped.length) return;
    const tz = currentTimeZone();
    const hint = inferFilenameHint(mapped);
    generateICS({ events: mapped, tz, filenameHint: hint });
    window.dispatchAppDataChanged?.({ source: 'calendar:export:ics' });
  } catch (err) {
    console.error('[calendar] ICS export failed', err);
  }
}

function wireButton() {
  const button = ensureButton();
  if (!button) return;
  if (!button.__wiredCalendarICS) {
    button.__wiredCalendarICS = true;
    button.addEventListener('click', handleExport);
  }
}

function scheduleWire() {
  if (wiring) return;
  wiring = true;
  requestAnimationFrame(() => {
    wiring = false;
    wireButton();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    wireButton();
    scheduleWire();
  }, { once: true });
} else {
  wireButton();
  scheduleWire();
}

document.addEventListener('app:data:changed', () => scheduleWire());
