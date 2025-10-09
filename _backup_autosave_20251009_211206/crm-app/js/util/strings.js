export function safeMax(value, limit) {
  const text = String(value ?? '');
  const max = Number.isFinite(limit) ? Number(limit) : 0;
  if (!max || max < 0) return text;
  return text.length > max ? text.slice(0, max) : text;
}

export function normalizePhone(value) {
  return String(value ?? '').replace(/[^0-9x+]/gi, '');
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}
