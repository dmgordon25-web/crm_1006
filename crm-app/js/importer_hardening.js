(function () {
  if (window.__WIRED_importerHardening) return;
  window.__WIRED_importerHardening = true;

  function norm(value) {
    return (value || "").trim();
  }

  function keyEmail(record) {
    return norm(record.email).toLowerCase();
  }

  function keyPhone(record) {
    return norm(record.phone).replace(/\D+/g, "");
  }

  function keyNameCity(record) {
    return (
      norm(record.name).toLowerCase() + "|" + norm(record.city).toLowerCase()
    );
  }

  function dedupe(rows, keyFn) {
    const map = new Map();
    const out = [];
    for (const row of rows || []) {
      const key = keyFn(row);
      if (!key) {
        out.push(row);
        continue;
      }
      if (!map.has(key)) {
        map.set(key, row);
        out.push(row);
      } else {
        const target = map.get(key);
        for (const field of Object.keys(row)) {
          if (!target[field] && row[field]) {
            target[field] = row[field];
          }
        }
      }
    }
    return out;
  }

  function bumpImportCounter(field, delta) {
    const diag = window.__DIAG__;
    if (!diag || !diag.import) return;
    if (typeof diag.import[field] !== "number") return;
    diag.import[field] += delta;
  }

  async function ensureNonePartnerId() {
    try {
      const noneId = await window.getNonePartnerUUID?.();
      if (noneId) return noneId;
    } catch (_err) {
      // Fall through to hard-coded fallback below.
    }
    return "00000000-0000-5000-8000-000000000000";
  }

  async function partnersFirst(partners) {
    if (!Array.isArray(partners) || partners.length === 0) return [];
    let rows = partners.slice();
    rows = dedupe(rows, keyEmail);
    rows = dedupe(rows, keyPhone);
    rows = dedupe(rows, keyNameCity);
    await window.savePartnersBulk?.(rows);
    bumpImportCounter("partners", partners.length || 0);
    return rows;
  }

  function extractId(record) {
    if (!record) return null;
    return record.id ?? record.partnerId ?? null;
  }

  async function buildPartnerIndex(partnerIndex) {
    const byName = new Map();
    if (Array.isArray(partnerIndex)) {
      for (const partner of partnerIndex) {
        const nameKey = norm(partner?.name).toLowerCase();
        if (nameKey && !byName.has(nameKey)) byName.set(nameKey, partner);
      }
    }
    if (byName.size === 0 && typeof window.getAllPartners === "function") {
      try {
        const all = await window.getAllPartners();
        for (const partner of all || []) {
          const nameKey = norm(partner?.name).toLowerCase();
          if (nameKey && !byName.has(nameKey)) byName.set(nameKey, partner);
        }
      } catch (_err) {
        // Quiet diagnostics mandate — do not spam console.
      }
    }
    return byName;
  }

  async function resolvePartnerByName(name, nameIndex, finder) {
    const key = norm(name).toLowerCase();
    if (!key) return null;
    if (nameIndex.has(key)) return nameIndex.get(key);
    if (typeof finder === "function") {
      try {
        const result = finder(name);
        const awaited = result && typeof result.then === "function" ? await result : result;
        if (awaited) {
          nameIndex.set(key, awaited);
          return awaited;
        }
      } catch (_err) {
        // Keep quiet per diagnostics requirements.
      }
    }
    return null;
  }

  async function contactsSecond(contacts, partnerIndex) {
    if (!Array.isArray(contacts) || contacts.length === 0) return [];

    const finder = typeof window.findPartnerByName === "function" ? window.findPartnerByName : null;
    const byName = await buildPartnerIndex(partnerIndex);
    const noneId = await ensureNonePartnerId();

    for (const contact of contacts) {
      const buyerPartner = await resolvePartnerByName(
        contact?.buyerPartnerName,
        byName,
        finder
      );
      const listingPartner = await resolvePartnerByName(
        contact?.listingPartnerName,
        byName,
        finder
      );

      const buyerId = extractId(buyerPartner);
      const listingId = extractId(listingPartner);

      contact.buyerPartnerId = buyerId || contact.buyerPartnerId || noneId;
      contact.listingPartnerId =
        listingId || contact.listingPartnerId || noneId;
    }

    let rows = contacts.slice();
    rows = dedupe(rows, keyEmail);
    rows = dedupe(rows, keyPhone);
    rows = dedupe(rows, keyNameCity);

    await window.saveContactsBulk?.(rows);

    window.dispatchAppDataChanged?.("import:commit");
    bumpImportCounter("contacts", contacts.length || 0);
    return rows;
  }

  async function runImport(payload) {
    bumpImportCounter("runs", 1);
    const partners = payload?.partners || payload?.Partners || [];
    const contacts = payload?.contacts || payload?.Contacts || [];
    const savedPartners = await partnersFirst(partners);
    await contactsSecond(contacts, savedPartners);
  }

  const btn = document.querySelector?.('[data-act="import-json"]');
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          const json = JSON.parse(text);
          await runImport(json);
        };
        input.click();
      } catch (error) {
        console.error("Import failed", error);
      }
    });
  }

  window.importerV5 = {
    runImport,
    partnersFirst,
    contactsSecond,
  };
})();
