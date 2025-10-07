/* P6f: Snapshot export/restore */
(function(){
  if (window.__SNAPSHOT_V1__) return; window.__SNAPSHOT_V1__ = true;

  async function exportJSON(){
    const out = { contacts:[], partners:[], events:[], documents:[] };
    const dbGetAll = typeof window.dbGetAll === "function"
      ? window.dbGetAll
      : (window.db && typeof window.db.getAll === "function" ? window.db.getAll.bind(window.db) : null);
    if (dbGetAll){
      try {
        out.contacts  = await dbGetAll("contacts")  || out.contacts;
        out.partners  = await dbGetAll("partners")  || out.partners;
        out.events    = await dbGetAll("events")    || out.events;
        out.documents = await dbGetAll("documents") || out.documents;
      } catch (_err){}
    }
    const blob = new Blob([JSON.stringify(out,null,2)], {type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`crm_snapshot_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function restoreJSON(file){
    const json = await file.text();
    const data = JSON.parse(json);
    async function putAll(store, rows){
      const dbPut = typeof window.dbPut === "function"
        ? window.dbPut
        : (window.db && typeof window.db.put === "function" ? window.db.put.bind(window.db) : null);
      if (!dbPut) return;
      for (const r of (rows||[])){
        try { await dbPut(store, r); }
        catch (_err){}
      }
    }
    await putAll("partners",  data.partners);
    await putAll("contacts",  data.contacts);
    await putAll("events",    data.events);
    await putAll("documents", data.documents);
    window.dispatchAppDataChanged?.("snapshot:restore");
  }

  // Wiring (delegated; no HTML edits)
  document.addEventListener("click", (e)=>{
    const ex = e.target?.closest?.('[data-act="snapshot:export"]');
    if (ex){ e.preventDefault(); exportJSON(); }
  }, true);

  document.addEventListener("change", (e)=>{
    const inp = e.target?.closest?.('input[type="file"][data-act="snapshot:restore"]');
    if (inp && inp.files?.[0]) restoreJSON(inp.files[0]);
  }, true);

  window.Snapshot = { exportJSON, restoreJSON };
})();
