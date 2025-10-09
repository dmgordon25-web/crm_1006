const SNAPSHOT_VERSION = "snapshot/v2";
const FALLBACK_NONE_ID = "00000000-0000-none-partner-000000000000";

function toStringId(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str || null;
}

function cloneRecord(record) {
  if (record == null) return null;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(record);
    } catch (_) {}
  }
  try {
    return JSON.parse(JSON.stringify(record));
  } catch (_) {
    return Object.assign({}, record);
  }
}

function canonicalEmail(record) {
  const email = record?.email || record?.primaryEmail || record?.workEmail || record?.personalEmail;
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function canonicalPhone(record) {
  const phone = record?.phone || record?.mobile || record?.cell || record?.primaryPhone;
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9]/g, "");
  return digits || null;
}

function canonicalName(record) {
  const parts = [];
  if (record?.firstName) parts.push(String(record.firstName).trim());
  if (record?.lastName) parts.push(String(record.lastName).trim());
  const combo = parts.filter(Boolean).join(" ");
  if (combo) return combo.toLowerCase();
  if (record?.name) return String(record.name).trim().toLowerCase();
  return null;
}

function canonicalCity(record) {
  const city =
    record?.city ||
    record?.addressCity ||
    record?.mailingCity ||
    record?.locationCity ||
    record?.primaryCity;
  if (!city || typeof city !== "string") return null;
  const trimmed = city.trim().toLowerCase();
  return trimmed || null;
}

function identityForPartner(record) {
  const email = canonicalEmail(record);
  if (email) return `email:${email}`;
  const phone = canonicalPhone(record);
  if (phone) return `phone:${phone}`;
  const name = canonicalName(record);
  const city = canonicalCity(record);
  if (name && city) return `namecity:${name}|${city}`;
  return null;
}

function identityForContact(record) {
  const email = canonicalEmail(record);
  if (email) return `email:${email}`;
  const phone = canonicalPhone(record);
  if (phone) return `phone:${phone}`;
  const name = canonicalName(record);
  const city = canonicalCity(record);
  if (name && city) return `namecity:${name}|${city}`;
  return null;
}

async function resolveNonePartnerId() {
  if (typeof window.getNonePartnerUUID === "function") {
    try {
      const id = await window.getNonePartnerUUID();
      if (id) return String(id);
    } catch (_) {}
  }
  if (typeof window.PARTNER_NONE_ID === "string" && window.PARTNER_NONE_ID.trim()) {
    return window.PARTNER_NONE_ID.trim();
  }
  return FALLBACK_NONE_ID;
}

async function readAll(store, db) {
  if (db) {
    try {
      if (typeof db.getAll === "function") {
        const rows = await db.getAll(store);
        if (Array.isArray(rows)) return rows;
      }
    } catch (_) {}
    try {
      if (typeof db.table === "function") {
        const table = db.table(store);
        if (table && typeof table.toArray === "function") {
          const rows = await table.toArray();
          if (Array.isArray(rows)) return rows;
        }
      }
    } catch (_) {}
  }
  if (typeof window.dbGetAll === "function") {
    try {
      const rows = await window.dbGetAll(store);
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }
  if (window.db && typeof window.db.getAll === "function") {
    try {
      const rows = await window.db.getAll(store);
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }
  return [];
}

async function putRecord(store, record, db) {
  if (!record) return;
  if (db) {
    try {
      if (typeof db.put === "function") {
        await db.put(store, record);
        return;
      }
    } catch (_) {}
    try {
      if (typeof db.table === "function") {
        const table = db.table(store);
        if (table && typeof table.put === "function") {
          await table.put(record);
          return;
        }
      }
    } catch (_) {}
  }
  if (typeof window.dbPut === "function") {
    await window.dbPut(store, record);
    return;
  }
  if (window.db && typeof window.db.put === "function") {
    await window.db.put(store, record);
  }
}

async function exportSnapshot(db) {
  const [contacts, partners, settings] = await Promise.all([
    readAll('contacts', db),
    readAll('partners', db),
    readAll('settings', db),
  ]);

  const snapshot = {
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    counts: {
      contacts: Array.isArray(contacts) ? contacts.length : 0,
      partners: Array.isArray(partners) ? partners.length : 0,
      settings: Array.isArray(settings) ? settings.length : 0,
    },
    contacts,
    partners,
    settings,
  };

  window.dispatchAppDataChanged?.('snapshot');
  return snapshot;
}

async function downloadSnapshot(db) {
  const data = await exportSnapshot(db);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  anchor.href = url;
  anchor.download = `CRM-${y}${m}${d}-snapshot.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeSnapshotPayload(payload) {
  if (!payload) return { contacts: [], partners: [], settings: [] };
  if (typeof payload === 'string') {
    try {
      return normalizeSnapshotPayload(JSON.parse(payload));
    } catch (err) {
      throw new Error('Invalid snapshot payload');
    }
  }
  const version = typeof payload.version === 'string' ? payload.version : SNAPSHOT_VERSION;
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const partners = Array.isArray(payload.partners) ? payload.partners : [];
  const settingsValue = payload.settings;
  const settings =
    Array.isArray(settingsValue) || (settingsValue && typeof settingsValue === 'object')
      ? settingsValue
      : [];
  return { version, contacts, partners, settings };
}

function deriveContactId(record) {
  return toStringId(
    record?.id ??
    record?.contactId ??
    record?.contactID ??
    record?.contact_id ??
    null
  );
}

function derivePartnerId(record) {
  return toStringId(record?.id ?? record?.partnerId ?? record?.partner_id ?? null);
}

function remapPartnerReferences(contact, idMap) {
  if (!contact || !idMap) return contact;
  const next = Object.assign({}, contact);
  const partnerFields = ['partnerId', 'buyerPartnerId', 'listingPartnerId', 'referralPartnerId'];
  partnerFields.forEach((field) => {
    if (field in next && next[field] != null) {
      const mapped = idMap.get(String(next[field]));
      if (mapped) next[field] = mapped;
    }
  });
  if (Array.isArray(next.partnerIds)) {
    next.partnerIds = next.partnerIds.map((value) => idMap.get(String(value)) || value);
  }
  return next;
}

async function restoreSettings(db, settings) {
  if (!settings) return;
  if (Array.isArray(settings)) {
    for (const entry of settings) {
      if (!entry) continue;
      const id = toStringId(entry.id);
      if (!id) continue;
      const record = Object.assign({}, entry, { id });
      await putRecord('settings', record, db);
    }
    return;
  }
  if (typeof settings === 'object') {
    for (const [key, value] of Object.entries(settings)) {
      await putRecord('settings', { id: key, value }, db);
    }
  }
}

async function restoreSnapshot(db, payload) {
  const { contacts, partners, settings } = normalizeSnapshotPayload(payload);
  const nonePartnerId = await resolveNonePartnerId();

  const existingPartners = await readAll('partners', db);
  const partnerById = new Map();
  const partnerByIdentity = new Map();
  (existingPartners || []).forEach((partner) => {
    const id = derivePartnerId(partner);
    if (id) partnerById.set(id, partner);
    const identity = identityForPartner(partner);
    if (identity) partnerByIdentity.set(identity, partner);
  });

  const partnerIdMap = new Map();
  for (const raw of partners || []) {
    if (!raw) continue;
    const candidate = cloneRecord(raw);
    const incomingId = derivePartnerId(candidate);
    const identity = identityForPartner(candidate);

    let existing = null;
    if (incomingId && partnerById.has(incomingId)) existing = partnerById.get(incomingId);
    else if (identity && partnerByIdentity.has(identity)) existing = partnerByIdentity.get(identity);

    let targetId = incomingId || (existing ? derivePartnerId(existing) : null);
    if (!targetId) {
      if (identity && identity.startsWith('email:')) {
        targetId = `partner-${identity.slice(6)}`;
      } else if (typeof crypto?.randomUUID === 'function') {
        targetId = crypto.randomUUID();
      } else {
        targetId = `partner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    }

    const nameLower = String(candidate.name || '').trim().toLowerCase();
    if (nameLower === 'none' || targetId === FALLBACK_NONE_ID) {
      targetId = nonePartnerId;
    }

    const nextRecord = Object.assign({}, existing || {}, candidate, { id: targetId });
    await putRecord('partners', nextRecord, db);
    partnerById.set(targetId, nextRecord);
    if (identity) partnerByIdentity.set(identity, nextRecord);
    if (incomingId) partnerIdMap.set(incomingId, targetId);
  }

  const existingContacts = await readAll('contacts', db);
  const contactById = new Map();
  const contactByIdentity = new Map();
  (existingContacts || []).forEach((contact) => {
    const id = deriveContactId(contact);
    if (id) contactById.set(id, contact);
    const identity = identityForContact(contact);
    if (identity) contactByIdentity.set(identity, contact);
  });

  for (const raw of contacts || []) {
    if (!raw) continue;
    const candidate = cloneRecord(raw);
    const incomingId = deriveContactId(candidate);
    const identity = identityForContact(candidate);

    let existing = null;
    if (incomingId && contactById.has(incomingId)) existing = contactById.get(incomingId);
    else if (identity && contactByIdentity.has(identity)) existing = contactByIdentity.get(identity);

    let targetId = incomingId || (existing ? deriveContactId(existing) : null);
    if (!targetId) {
      if (identity && identity.startsWith('email:')) {
        targetId = `contact-${identity.slice(6)}`;
      } else if (typeof crypto?.randomUUID === 'function') {
        targetId = crypto.randomUUID();
      } else {
        targetId = `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    }

    const remapped = remapPartnerReferences(candidate, partnerIdMap);
    const nextRecord = Object.assign({}, existing || {}, remapped, { id: targetId });
    await putRecord('contacts', nextRecord, db);
    contactById.set(targetId, nextRecord);
    if (identity) contactByIdentity.set(identity, nextRecord);
  }

  await restoreSettings(db, settings);

  window.dispatchAppDataChanged?.('snapshot');
}

async function pickAndRestore(db) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return reject(new Error('No file selected'));
        const text = await file.text();
        const json = JSON.parse(text);
        await restoreSnapshot(db, json);
        resolve(true);
      } catch (err) {
        console.error('[snapshot] restore failed', err);
        reject(err);
      }
    };
    input.click();
  });
}

const snapshotService = {
  exportSnapshot,
  downloadSnapshot,
  restoreSnapshot,
  pickAndRestore,
};

if (typeof window !== 'undefined') {
  window.snapshotService = snapshotService;
}

export { exportSnapshot, downloadSnapshot, restoreSnapshot, pickAndRestore };
