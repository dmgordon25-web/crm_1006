/* P6f: Idempotent seeds */
(function(){
  if (window.__SEEDS_V1__) return; window.__SEEDS_V1__ = true;

  async function upsert(store, key, row){
    try {
      const existing = await window.db.get(store, key).catch(()=>null);
      const rec = existing ? { ...existing, ...row, id: key } : { id: key, ...row };
      await window.db.put(store, rec);
    } catch {
      // localStorage fallback
      const k = `seed:${store}`;
      const all = JSON.parse(localStorage.getItem(k)||"{}");
      all[key] = { ...(all[key]||{}), ...row, id:key };
      localStorage.setItem(k, JSON.stringify(all));
    }
  }

  async function runSeeds(){
    // Deterministic keys
    const p1="partner_acme_co", p2="partner_zen_realty";
    const c1="contact_alex_m",  c2="contact_bailey_s";

    await upsert("partners", p1, { name:"Acme Co", email:"acme@ex.com", phone:"5551112222" });
    await upsert("partners", p2, { name:"Zen Realty", email:"zen@re.com", phone:"5553334444" });

    await upsert("contacts", c1, { firstName:"Alex", lastName:"Morris", email:"alex@home.com", buyerPartnerId:p1, listingPartnerId:p2, loanType:"Conventional" });
    await upsert("contacts", c2, { firstName:"Bailey", lastName:"Stone", email:"bailey@work.com", buyerPartnerId:p2, listingPartnerId:p1, loanType:"FHA" });

    window.dispatchAppDataChanged?.("seeds:complete");
  }

  window.Seeds = { runSeeds };
})();
