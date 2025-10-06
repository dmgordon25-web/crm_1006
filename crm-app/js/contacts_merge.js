
// contacts_merge.js — Action bar merge (exactly two) with field precedence + consolidated artifacts + diff summary
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.contacts_merge) return;
  window.__INIT_FLAGS__.contacts_merge = true;

  function pickPrefer(a, b){
    // Prefer a if it is "truthy-non-empty"; else b
    return (a!==undefined && a!==null && String(a).trim()!=='') ? a : (b || '');
  }
  function dedupLines(a,b){
    const set = new Set();
    String(a||'').split('\n').forEach(s=> { s=s.trim(); if(s) set.add(s); });
    String(b||'').split('\n').forEach(s=> { s=s.trim(); if(s) set.add(s); });
    return Array.from(set).join('\n');
  }

  async function mergeContactsWithIds(ids){
    try{
      if(!ids || ids.length!==2){ toast('Pick exactly 2 contacts'); return; }
      await openDB();
      const rows = await dbGetAll('contacts');
      const A = rows.find(r=> r.id===ids[0]);
      const B = rows.find(r=> r.id===ids[1]);
      if(!A || !B){ toast('Missing contacts'); return; }

      // Determine primary — prefer one with more data, else ask
      function score(c){
        let s=0; ['first','last','email','phone','address','city','state','zip','notes','loanType','stage','loanAmount','rate','fundedDate'].forEach(k=>{ if(c[k]) s++; });
        return s + (Array.isArray(c.extras?.timeline)? c.extras.timeline.length:0);
      }
      let primary = score(A)>=score(B) ? A : B;
      let other   = primary===A ? B : A;

      // Field precedence
      const merged = Object.assign({}, primary);
      const fields = ['first','last','email','phone','address','city','state','zip','referredBy','loanType','stage','loanAmount','rate','fundedDate','status'];
      for(const f of fields){ merged[f] = pickPrefer(primary[f], other[f]); }
      merged.notes = dedupLines(primary.notes, other.notes);
      merged.lastContact = pickPrefer(primary.lastContact, other.lastContact);

      // Partners: keep real ones; if missing use other's
      merged.buyerPartnerId   = pickPrefer(primary.buyerPartnerId, other.buyerPartnerId)   || window.NONE_PARTNER_ID;
      merged.listingPartnerId = pickPrefer(primary.listingPartnerId, other.listingPartnerId) || window.NONE_PARTNER_ID;

      // Extras / timeline
      merged.extras = merged.extras || {};
      const tlA = Array.isArray(primary.extras?.timeline) ? primary.extras.timeline : [];
      const tlB = Array.isArray(other.extras?.timeline) ? other.extras.timeline : [];
      merged.extras.timeline = tlA.concat(tlB);

      merged.updatedAt = Date.now();

      // Persist merged contact
      await dbPut('contacts', merged);

      // Rewire tasks & docs
      const [tasks, docs] = await Promise.all([dbGetAll('tasks'), dbGetAll('documents')]);
      const chT = tasks.filter(t=> t.contactId===other.id).map(t=> (t.contactId=merged.id, t.updatedAt=Date.now(), t));
      const chD = docs.filter(d=> d.contactId===other.id).map(d=> (d.contactId=merged.id, d.updatedAt=Date.now(), d));
      if(chT.length) await dbBulkPut('tasks', chT);
      if(chD.length) await dbBulkPut('documents', chD);

      // Delete duplicate
      await dbDelete('contacts', other.id);

      const nameA = `${A.first||''} ${A.last||''}`.trim();
      const nameB = `${B.first||''} ${B.last||''}`.trim();
      // Diff summary (concise)
      const changed = [];
      for(const f of fields.concat(['notes','lastContact','buyerPartnerId','listingPartnerId'])){
        if(String(primary[f]||'') !== String(merged[f]||'')) changed.push(f);
      }
      const keptName = [merged.first, merged.last].filter(Boolean).join(" ") || merged.name || "primary";
const summary = `Merged "${nameA}" + "${nameB}" → kept "${keptName.length>18? (keptName.slice(0,18)+"...") : keptName}"; rewired ${chT.length} tasks, ${chD.length} docs.`;
      toast(summary);
      await renderAll();
      return merged.id;
    }catch(e){
      console.error('mergeContactsWithIds error', e);
      toast('Merge failed');
    }
  }

  window.mergeContactsWithIds = mergeContactsWithIds;
})();
