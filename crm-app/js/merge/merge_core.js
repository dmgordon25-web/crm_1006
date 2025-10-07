/* eslint-disable no-console */
// Generic, small merge helpers for Contacts (can be extended for Partners later)

export function isNonEmpty(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

export function scoreField(field, a, b) {
  // Higher score wins; tie breaks by more "information" length, then stable order (a)
  const va = a?.[field];
  const vb = b?.[field];
  let sa = 0, sb = 0;

  // Prefer non-empty
  if (isNonEmpty(va)) sa += 2;
  if (isNonEmpty(vb)) sb += 2;

  // Prefer validity for common fields
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRx = /[0-9]{7,}/; // very liberal
  if (field.toLowerCase().includes("email")) {
    if (typeof va === "string" && emailRx.test(va)) sa += 2;
    if (typeof vb === "string" && emailRx.test(vb)) sb += 2;
  }
  if (field.toLowerCase().includes("phone")) {
    if (typeof va === "string" && phoneRx.test(va)) sa += 1;
    if (typeof vb === "string" && phoneRx.test(vb)) sb += 1;
  }

  // Prefer fresher timestamps if provided
  const ta = Number(a?.updatedAt || a?.modifiedAt || 0);
  const tb = Number(b?.updatedAt || b?.modifiedAt || 0);
  if (ta || tb) {
    if (ta > tb) sa += 1;
    if (tb > ta) sb += 1;
  }

  // Prefer longer strings (heuristic for more info)
  if (typeof va === "string") sa += Math.min(2, Math.floor(va.trim().length / 20));
  if (typeof vb === "string") sb += Math.min(2, Math.floor(vb.trim().length / 20));

  return sa - sb; // >0 => A wins; <0 => B wins; 0 => tie
}

export function chooseValue(field, a, b) {
  const delta = scoreField(field, a, b);
  if (delta > 0) return { from: "A", value: a?.[field] };
  if (delta < 0) return { from: "B", value: b?.[field] };
  // tie: prefer non-empty, else A
  const va = a?.[field], vb = b?.[field];
  if (isNonEmpty(va) && !isNonEmpty(vb)) return { from: "A", value: va };
  if (!isNonEmpty(va) && isNonEmpty(vb)) return { from: "B", value: vb };
  return { from: "A", value: va };
}

export function unionArray(a = [], b = [], key = null) {
  const out = [];
  const seen = new Set();
  const push = (item) => {
    const k = key ? (item?.[key] ?? JSON.stringify(item)) : JSON.stringify(item);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(item);
  };
  (Array.isArray(a) ? a : []).forEach(push);
  (Array.isArray(b) ? b : []).forEach(push);
  return out;
}

export function mergeContacts(a, b, picks) {
  // picks: { fieldName: "A"|"B"|"UNION"|"NONE" }
  const template = Object.assign({}, a, b); // superset of fields
  const result = {};
  for (const field of Object.keys(template)) {
    const pick = picks?.[field];
    if (pick === "NONE") continue;
    if (Array.isArray(a?.[field]) || Array.isArray(b?.[field])) {
      // arrays: UNION unless explicit A or B
      if (pick === "A") result[field] = Array.isArray(a?.[field]) ? a[field] : [];
      else if (pick === "B") result[field] = Array.isArray(b?.[field]) ? b[field] : [];
      else result[field] = unionArray(a?.[field], b?.[field], "id");
      continue;
    }
    if (pick === "A") { result[field] = a?.[field]; continue; }
    if (pick === "B") { result[field] = b?.[field]; continue; }
    // default smart choice
    result[field] = chooseValue(field, a, b).value;
  }
  // Always preserve identity of winner; timestamps
  result.updatedAt = Date.now();
  return result;
}

export function pickWinnerContact(a, b) {
  // Winner is the one with more non-empty fields; tie → A
  const nonEmpty = (obj) => Object.keys(obj || {}).reduce((n, k) => n + (isNonEmpty(obj[k]) ? 1 : 0), 0);
  const sa = nonEmpty(a), sb = nonEmpty(b);
  return sa >= sb ? "A" : "B";
}
