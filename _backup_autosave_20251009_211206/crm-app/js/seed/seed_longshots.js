const DAY_MS = 24 * 60 * 60 * 1000;

function stableId(email) {
  const input = String(email || '').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `longshot-${hash.toString(16).padStart(8, '0')}`;
}

async function resolveNonePartnerId() {
  if (typeof window.getNonePartnerUUID === 'function') {
    try {
      return await window.getNonePartnerUUID();
    } catch (err) {
      console.warn('[seed:longshots] none-partner UUID failed', err);
    }
  }
  if (typeof window.NONE_PARTNER_ID === 'string') {
    return window.NONE_PARTNER_ID;
  }
  return '00000000-0000-none-partner-000000000000';
}

function normalizeTags(existing, incoming) {
  const result = new Set();
  (existing || []).forEach((tag) => {
    if (tag != null) result.add(String(tag));
  });
  (incoming || []).forEach((tag) => {
    if (tag != null) result.add(String(tag));
  });
  return Array.from(result);
}

function hasDiff(existing, next, keys) {
  if (!existing) return true;
  return keys.some((key) => {
    const prev = existing[key];
    const value = next[key];
    if (Array.isArray(prev) || Array.isArray(value)) {
      const a = Array.isArray(prev) ? prev.map(String) : [];
      const b = Array.isArray(value) ? value.map(String) : [];
      if (a.length !== b.length) return true;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return true;
      }
      return false;
    }
    if (prev instanceof Date || value instanceof Date) {
      const a = prev instanceof Date ? prev.toISOString() : String(prev || '');
      const b = value instanceof Date ? value.toISOString() : String(value || '');
      return a !== b;
    }
    return prev !== value;
  });
}

function ensureIso(dateInput) {
  if (!dateInput) return new Date().toISOString();
  if (typeof dateInput === 'string') return dateInput;
  if (dateInput instanceof Date) return dateInput.toISOString();
  if (typeof dateInput === 'number') return new Date(dateInput).toISOString();
  return new Date().toISOString();
}

function formatBirthday(month, day) {
  const yyyy = new Date().getFullYear();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildSeeds(partnerMap, nonePartnerId) {
  const now = Date.now();
  const thisMonth = new Date().getMonth() + 1;
  const daySequence = [5, 12, 18, 22, 8, 14, 27, 3];
  const partnerId = (alias) => {
    if (!alias) return null;
    const key = alias.trim().toLowerCase();
    return partnerMap.get(key) || null;
  };

  const sample = [
    {
      firstName: 'Jordan',
      lastName: 'Nguyen',
      email: 'jordan.nguyen@longshots.demo',
      phone: '555-0101',
      loanType: 'Conventional',
      loanAmount: 285000,
      referredBy: 'Acme Co',
      buyerPartnerAlias: 'acme',
      tags: ['longshot'],
      birthday: formatBirthday(thisMonth, daySequence[0]),
    },
    {
      firstName: 'Priya',
      lastName: 'Desai',
      email: 'priya.desai@longshots.demo',
      phone: '555-0102',
      loanType: 'FHA',
      loanAmount: 240000,
      referredBy: 'Zen Realty',
      buyerPartnerAlias: 'zen',
      tags: ['longshot', 'first-time'],
      birthday: formatBirthday(thisMonth, daySequence[1]),
    },
    {
      firstName: 'Miles',
      lastName: 'Anderson',
      email: 'miles.anderson@longshots.demo',
      phone: '555-0103',
      loanType: 'VA',
      loanAmount: 325000,
      referredBy: 'Veteran Network',
      buyerPartnerAlias: 'none',
      tags: ['longshot', 'veteran'],
    },
    {
      firstName: 'Gabriela',
      lastName: 'Silva',
      email: 'gabriela.silva@longshots.demo',
      phone: '555-0104',
      loanType: 'Jumbo',
      loanAmount: 625000,
      referredBy: 'Horizon Builders',
      buyerPartnerAlias: 'horizon',
      tags: ['longshot'],
    },
    {
      firstName: 'Emmett',
      lastName: 'Cole',
      email: 'emmett.cole@longshots.demo',
      phone: '555-0105',
      loanType: 'USDA',
      loanAmount: 205000,
      referredBy: 'Rural Outreach',
      buyerPartnerAlias: 'none',
      tags: ['longshot'],
    },
    {
      firstName: 'Lina',
      lastName: 'Kowalski',
      email: 'lina.kowalski@longshots.demo',
      phone: '555-0106',
      loanType: 'HELOC',
      loanAmount: 85000,
      referredBy: 'Acme Co',
      buyerPartnerAlias: 'acme',
      tags: ['longshot', 'equity'],
    },
    {
      firstName: 'Trevor',
      lastName: 'Banks',
      email: 'trevor.banks@longshots.demo',
      phone: '555-0107',
      loanType: 'Non-QM',
      loanAmount: 480000,
      referredBy: 'Indie Brokers',
      buyerPartnerAlias: 'zen',
      tags: ['longshot'],
    },
    {
      firstName: 'Aisha',
      lastName: 'Hughes',
      email: 'aisha.hughes@longshots.demo',
      phone: '555-0108',
      loanType: 'Conventional',
      loanAmount: 315000,
      referredBy: 'Community Event',
      buyerPartnerAlias: 'none',
      tags: ['longshot', 'referral'],
    },
  ];

  return sample.map((entry, index) => {
    const createdAt = now - index * DAY_MS * 2;
    const buyerAlias = entry.buyerPartnerAlias || 'none';
    let buyerPartnerId = partnerId(buyerAlias);
    if (!buyerPartnerId && buyerAlias === 'none') {
      buyerPartnerId = nonePartnerId;
    }
    if (!buyerPartnerId && nonePartnerId) {
      buyerPartnerId = nonePartnerId;
    }
    return {
      id: stableId(entry.email),
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: entry.email,
      phone: entry.phone,
      status: 'longshot',
      stage: 'New',
      stageEnteredAt: new Date(createdAt).toISOString(),
      createdAt: new Date(createdAt).toISOString(),
      updatedAt: new Date(createdAt).toISOString(),
      loanType: entry.loanType,
      loanAmount: entry.loanAmount,
      referredBy: entry.referredBy,
      buyerPartnerId,
      tags: entry.tags,
      birthday: entry.birthday || null,
      nextFollowUp: new Date(createdAt + 7 * DAY_MS).toISOString(),
      source: 'seed:longshots',
    };
  });
}

async function ensureDbOpen() {
  if (typeof window.openDB === 'function') {
    try {
      await window.openDB();
    } catch (err) {
      console.warn('[seed:longshots] openDB failed', err);
    }
  }
}

async function fetchAll(store) {
  if (typeof window.dbGetAll === 'function') {
    return window.dbGetAll(store).catch(() => []);
  }
  if (window.db && typeof window.db.getAll === 'function') {
    return window.db.getAll(store).catch(() => []);
  }
  return [];
}

async function putContact(record, db) {
  if (typeof window.dbPut === 'function') {
    return window.dbPut('contacts', record);
  }
  if (db && typeof db.put === 'function') {
    return db.put('contacts', record);
  }
  throw new Error('dbPut unavailable');
}

export async function seedLongShots(db) {
  await ensureDbOpen();
  const [contacts, partners] = await Promise.all([
    fetchAll('contacts'),
    fetchAll('partners'),
  ]);

  const partnerMap = new Map();
  partners.forEach((partner) => {
    if (!partner) return;
    const id = String(partner.id || '').trim();
    if (id) partnerMap.set(id.toLowerCase(), id);
    const name = String(partner.name || '').trim();
    if (name) partnerMap.set(name.toLowerCase(), id);
    const company = String(partner.company || '').trim();
    if (company) partnerMap.set(company.toLowerCase(), id);
    const email = String(partner.email || '').trim();
    if (email) partnerMap.set(email.toLowerCase(), id);
  });

  const nonePartnerId = await resolveNonePartnerId();
  if (nonePartnerId) {
    partnerMap.set('none', nonePartnerId);
  }

  if (!partnerMap.has('acme')) {
    const acme = Array.isArray(partners)
      ? partners.find((p) => String(p?.name || '').toLowerCase().includes('acme'))
      : null;
    if (acme && acme.id) {
      partnerMap.set('acme', String(acme.id));
    }
  }
  if (!partnerMap.has('zen')) {
    const zen = Array.isArray(partners)
      ? partners.find((p) => String(p?.name || '').toLowerCase().includes('zen'))
      : null;
    if (zen && zen.id) {
      partnerMap.set('zen', String(zen.id));
    }
  }
  if (!partnerMap.has('horizon')) {
    const horizon = Array.isArray(partners)
      ? partners.find((p) => String(p?.name || '').toLowerCase().includes('horizon'))
      : null;
    if (horizon && horizon.id) {
      partnerMap.set('horizon', String(horizon.id));
    }
  }

  const seeds = buildSeeds(partnerMap, nonePartnerId);
  const existingByEmail = new Map();
  contacts.forEach((contact) => {
    if (!contact) return;
    const key = String(contact.email || '').trim().toLowerCase();
    if (key) existingByEmail.set(key, contact);
  });

  let touched = false;
  for (const seed of seeds) {
    const key = String(seed.email || '').trim().toLowerCase();
    if (!key) continue;
    const current = existingByEmail.get(key) || null;
    const merged = Object.assign({}, current || {}, seed);
    merged.id = current?.id || seed.id || stableId(seed.email);
    merged.tags = normalizeTags(current?.tags, seed.tags);
    merged.createdAt = current?.createdAt ? ensureIso(current.createdAt) : ensureIso(seed.createdAt);
    merged.updatedAt = ensureIso(Date.now());
    merged.stageEnteredAt = current?.stageEnteredAt ? ensureIso(current.stageEnteredAt) : ensureIso(seed.stageEnteredAt);
    merged.status = 'longshot';
    merged.stage = seed.stage || current?.stage || 'New';
    merged.source = seed.source || current?.source || 'seed:longshots';
    merged.nextFollowUp = seed.nextFollowUp || current?.nextFollowUp || ensureIso(Date.now() + 7 * DAY_MS);
    if (!merged.birthday && seed.birthday) merged.birthday = seed.birthday;
    if (!merged.buyerPartnerId) merged.buyerPartnerId = seed.buyerPartnerId || null;

    const diffKeys = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'status',
      'stage',
      'loanType',
      'loanAmount',
      'referredBy',
      'buyerPartnerId',
      'tags',
      'birthday',
      'nextFollowUp',
    ];
    if (hasDiff(current, merged, diffKeys)) {
      touched = true;
    }
    await putContact(merged, db);
  }

  return touched;
}

export default seedLongShots;
