/* P6f: Snapshot export/restore */
(function(){
  if (window.__SNAPSHOT_V1__) return; window.__SNAPSHOT_V1__ = true;

  async function exportJSON(){
    const out = { contacts:[], partners:[], events:[], documents:[] };
    try {
      out.contacts  = await window.db.getAll?.("contacts")  || out.contacts;
      out.partners  = await window.db.getAll?.("partners")  || out.partners;
      out.events    = await window.db.getAll?.("events")    || out.events;
      out.documents = await window.db.getAll?.("documents") || out.documents;
    } catch {}
    const blob = new Blob([JSON.stringify(out,null,2)], {type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`crm_snapshot_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function restoreJSON(file){
    const json = await file.text();
    const data = JSON.parse(json);
    async function putAll(store, rows){
      for (const r of (rows||[])){ try { await window.db.put(store, r); } catch {} }
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
