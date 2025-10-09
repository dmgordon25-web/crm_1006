const CRLF = "\r\n";
const PRODID = "-//CRM_vFinal//Calendar//EN";
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dtfCache = new Map();

function pad(num) {
  return String(num).padStart(2, "0");
}

function resolvedLocalTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch (_) {
    return null;
  }
}

function validateTimeZone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch (_) {
    return null;
  }
}

function formatterFor(tz) {
  const key = tz || "__local__";
  if (dtfCache.has(key)) return dtfCache.get(key);
  let fmt;
  if (tz) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } else {
    fmt = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  dtfCache.set(key, fmt);
  return fmt;
}

function safeClone(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : new Date(time);
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (DATE_ONLY_RE.test(trimmed)) {
      const [, y, m, d] = trimmed.match(DATE_ONLY_RE) || [];
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function parseDateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (DATE_ONLY_RE.test(trimmed)) {
      const [, y, m, d] = trimmed.match(DATE_ONLY_RE) || [];
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

function addDays(date, days) {
  const clone = new Date(date.getTime());
  clone.setDate(clone.getDate() + days);
  return clone;
}

function formatDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatDateForFilename(date, tz) {
  const fmt = formatterFor(validateTimeZone(tz));
  const parts = fmt.formatToParts(date);
  const map = Object.create(null);
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.year || pad(date.getFullYear())}${map.month || pad(date.getMonth() + 1)}${map.day || pad(date.getDate())}`;
}

function formatLocalDateTime(date, tz) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const tzid = validateTimeZone(tz);
  try {
    const fmt = formatterFor(tzid);
    const parts = fmt.formatToParts(date);
    const map = Object.create(null);
    for (const part of parts) {
      map[part.type] = part.value;
    }
    return `${map.year}${map.month}${map.day}T${map.hour}${map.minute}${map.second}`;
  } catch (_) {
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }
}

function formatUtcStamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function safeText(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, "\\n")
    .replace(/([,;])/g, "\\$1")
    .trim();
}

function makeUid(event) {
  const raw =
    event?.uid ??
    event?.id ??
    event?.eventId ??
    event?.calendarEventId ??
    event?.calendar_id ??
    null;
  if (raw) return String(raw);
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `evt-${Math.random().toString(36).slice(2)}`;
}

function deriveTitle(event) {
  return (
    event?.title ??
    event?.summary ??
    event?.name ??
    event?.subject ??
    "Event"
  );
}

function deriveDescription(event) {
  return (
    event?.description ??
    event?.desc ??
    event?.notes ??
    event?.body ??
    ""
  );
}

function deriveLocation(event) {
  return event?.location ?? event?.place ?? event?.address ?? "";
}

function isDateOnlyValue(value) {
  if (value instanceof Date) return false;
  if (typeof value === "string") return DATE_ONLY_RE.test(value.trim());
  return false;
}

function normalizeEvent(raw, fallbackTz) {
  if (!raw) return null;
  const startValue =
    raw.start ?? raw.startDate ?? raw.dtstart ?? raw.begin ?? raw.date ?? raw.start_at ?? raw.starts_at;
  const endValue =
    raw.end ?? raw.endDate ?? raw.dtend ?? raw.finish ?? raw.end_at ?? raw.ends_at ?? raw.stop;

  let allDay = Boolean(raw.allDay ?? raw.isAllDay ?? raw.allday);
  if (!allDay && isDateOnlyValue(startValue) && !endValue) allDay = true;

  const tzid = validateTimeZone(
    raw.tz || raw.timezone || raw.timeZone || raw.tzid || raw.timeZoneId || fallbackTz
  ) || fallbackTz;

  if (allDay) {
    const startDate = parseDateOnly(startValue ?? new Date());
    if (!startDate) return null;
    let endDate = parseDateOnly(endValue);
    if (!endDate) {
      endDate = addDays(startDate, 1);
    } else {
      if (endDate <= startDate) {
        endDate = addDays(startDate, 1);
      } else if (isDateOnlyValue(endValue)) {
        endDate = addDays(endDate, 1);
      }
    }
    return {
      uid: makeUid(raw),
      title: safeText(deriveTitle(raw)),
      description: safeText(deriveDescription(raw)),
      location: safeText(deriveLocation(raw)),
      allDay: true,
      start: startDate,
      end: endDate,
      tzid: null,
    };
  }

  const startDate = safeClone(startValue ?? new Date());
  if (!startDate) return null;
  const endDate = endValue ? safeClone(endValue) : null;

  return {
    uid: makeUid(raw),
    title: safeText(deriveTitle(raw)),
    description: safeText(deriveDescription(raw)),
    location: safeText(deriveLocation(raw)),
    allDay: false,
    start: startDate,
    end: endDate,
    tzid,
  };
}

function sanitizeFilenameHint(hint) {
  const base = String(hint ?? "").trim();
  if (!base) return "calendar";
  const cleaned = base
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "calendar";
}

function triggerDownload(filename, contents) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildEventLines(event, tzFallback, stamp) {
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`];
  if (stamp) lines.push(`DTSTAMP:${stamp}`);
  if (event.allDay) {
    const startValue = formatDateValue(event.start);
    const endValue = formatDateValue(event.end ?? addDays(event.start, 1));
    if (startValue) lines.push(`DTSTART;VALUE=DATE:${startValue}`);
    if (endValue) lines.push(`DTEND;VALUE=DATE:${endValue}`);
  } else {
    const tzid = validateTimeZone(event.tzid) || validateTimeZone(tzFallback);
    const dtStart = formatLocalDateTime(event.start, tzid);
    if (dtStart) {
      if (tzid) lines.push(`DTSTART;TZID=${tzid}:${dtStart}`);
      else lines.push(`DTSTART:${dtStart}`);
    }
    if (event.end instanceof Date && !Number.isNaN(event.end.getTime())) {
      const dtEnd = formatLocalDateTime(event.end, tzid);
      if (dtEnd) {
        if (tzid) lines.push(`DTEND;TZID=${tzid}:${dtEnd}`);
        else lines.push(`DTEND:${dtEnd}`);
      }
    }
  }
  if (event.location) lines.push(`LOCATION:${event.location}`);
  if (event.description) lines.push(`DESCRIPTION:${event.description}`);
  if (event.title) lines.push(`SUMMARY:${event.title}`);
  lines.push("END:VEVENT");
  return lines;
}

export function generateICS({ events = [], tz, filenameHint } = {}) {
  const resolvedTz = validateTimeZone(tz) || resolvedLocalTimeZone();
  const normalized = events
    .map((event) => normalizeEvent(event, resolvedTz))
    .filter(Boolean);

  const stamp = formatUtcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
  ];

  if (resolvedTz) lines.push(`X-WR-TIMEZONE:${resolvedTz}`);

  for (const event of normalized) {
    lines.push(...buildEventLines(event, resolvedTz, stamp));
  }

  lines.push("END:VCALENDAR");
  const ics = lines.join(CRLF) + CRLF;

  const today = new Date();
  const datePart = formatDateForFilename(today, resolvedTz || null);
  const safeHint = sanitizeFilenameHint(filenameHint);
  const filename = `CRM-${datePart}-${safeHint}-events.ics`;

  triggerDownload(filename, ics);

  return { filename, ics };
}
