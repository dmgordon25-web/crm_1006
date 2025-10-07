/* P6d: Import helpers (deterministic None partner, hashing, dedupe) */
(function(){
  if (window.__IMPORT_HELPERS_V1__) return; window.__IMPORT_HELPERS_V1__ = true;

  function hash32(s){
    let h = 2166136261 >>> 0;
    for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h>>>0).toString(16).padStart(8,"0");
  }
  function uuidFromSeed(seed){
    // Simple stable UUID-like: 8-4-4-4-12 from two hashes
    const h1 = hash32(seed), h2 = hash32("x"+seed), h3 = hash32(seed+"y");
    return `${h1}-${h2.slice(0,4)}-${h2.slice(4,8)}-${h3.slice(0,4)}-${h3}${h1.slice(0,4)}`;
  }

  const NONE_PARTNER_NAME = "None";
  const NONE_PARTNER_ID = uuidFromSeed("PARTNER:NONE:CANONICAL");
  if (!window.NONE_PARTNER_ID) window.NONE_PARTNER_ID = NONE_PARTNER_ID;

  async function ensureNonePartner(){
    try {
      let existing = null;
      if (typeof window.dbGet === 'function'){
        existing = await window.dbGet('partners', NONE_PARTNER_ID);
      } else {
        existing = await window.db?.get?.('partners', NONE_PARTNER_ID);
      }
      if (existing) return existing;
      const row = { id: NONE_PARTNER_ID, name: NONE_PARTNER_NAME, tier:'-', phone:'', email:'', createdAt: Date.now() };
      if (typeof window.dbPut === 'function') await window.dbPut('partners', row);
      else await window.db?.put?.('partners', row);
      return row;
    } catch { return { id: NONE_PARTNER_ID, name: NONE_PARTNER_NAME }; }
  }

  function keyTuple(row){
    const email = (row.email||"").trim().toLowerCase();
    const phone = (row.phone||"").replace(/\D+/g,"");
    const first = (row.firstName||"").trim();
    const last  = (row.lastName||"").trim();
    const fallbackName = (row.name || `${first} ${last}`).trim();
    const name  = fallbackName.toLowerCase();
    const city  = (row.city||"").trim().toLowerCase();
    return { email, phone, name, city };
  }

  window.IMPORT_HELPERS = { NONE_PARTNER_ID, ensureNonePartner, keyTuple };
})();
