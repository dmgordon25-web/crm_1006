
// commissions.js — Phase 0.9.0 Commissions & Payouts
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.commissions) return;
  window.__INIT_FLAGS__.commissions = true;

  function pad(n){return (n<10?'0':'')+n;}
  function ymd(d){ const x=new Date(d); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; }

  async function loadCommSettings(){
    try{ const all = await dbGetAll('settings'); const rec = all.find(s=>s.id==='commissions'); if(rec) return rec; }catch(_){}
    return { id:'commissions', bps: 125, loSplit: 50 }; // defaults: 125 bps, 50% LO split
  }
  async function saveCommSettings(obj){ obj.id='commissions'; await dbPut('settings', obj); }

  async function computeRows(){
    await openDB();
    const [contacts, partners] = await Promise.all([dbGetAll('contacts'), dbGetAll('partners')]);
    const cfg = await loadCommSettings();
    const rows = [];
    contacts.filter(c => String(c.stage||'').toLowerCase()==='funded').forEach(c => {
      const amt = Number(c.loanAmount||0);
      const bps = Number(cfg.bps||0);
      const gross = Math.round( amt * (bps/10000) * 100 )/100; // currency
      const loSplit = Number(cfg.loSplit||0)/100;
      const loPay = Math.round( gross * loSplit * 100 )/100;
      const house = Math.round( (gross - loPay) * 100 )/100;
      const pid = c.partnerId || c.buyerPartnerId || c.listingPartnerId || 'None';
      const p = partners.find(x=>x.id===pid);
      rows.push({
        contactId: c.id, name: ((c.first||'')+' '+(c.last||'')).trim(),
        loanType: c.loanType||'', fundedDate: c.fundedDate||'', amount: amt,
        partner: (p?.name || (pid==='None'?'(None)':pid)),
        bps, gross, loPay, house
      });
    });
    return rows;
  }

  function csvEscape(s){const v=String(s??''); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  function downloadFile(name, text){ const blob=new Blob([text],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),500); }

  function renderRows(rows){
    if(!rows.length) return '<div class="muted">No funded loans found.</div>';
    const hdr = '<div class="grid" style="grid-template-columns: 1fr 80px 90px 90px 90px 90px"><div><strong>Contact</strong></div><div><strong>Type</strong></div><div><strong>Amount</strong></div><div><strong>Gross</strong></div><div><strong>LO</strong></div><div><strong>House</strong></div></div>';
    const body = rows.map(r => `<div class="grid" style="grid-template-columns: 1fr 80px 90px 90px 90px 90px">
      <div>${r.name}</div><div>${r.loanType||''}</div><div>$${r.amount.toLocaleString()}</div>
      <div>$${r.gross.toLocaleString()}</div><div>$${r.loPay.toLocaleString()}</div><div>$${r.house.toLocaleString()}</div>
    </div>`).join('');
    return hdr + body;
  }

  async function renderCommissions(){
    const monthEl = document.getElementById('comm-month');
    const box = document.getElementById('comm-table');
    if(!monthEl || !box) return;
    if(!monthEl.__defaulted){
      monthEl.value = monthEl.value || new Date().toISOString().slice(0,7);
      monthEl.__defaulted = true;
    }
    const rows = await computeRows();
    const mval = monthEl.value || '';
    const rows2 = mval ? rows.filter(r => (r.fundedDate||'').startsWith(mval)) : rows;
    box.innerHTML = renderRows(rows2);
    const btn = document.getElementById('btn-comm-export');
    if(btn && !btn.__wired){
      btn.__wired = true;
      btn.addEventListener('click', ()=>{
        const hdr = ['contactId','name','loanType','fundedDate','amount','partner','bps','gross','loPay','house'];
        const csv = [hdr.join(','), ...rows2.map(r => [r.contactId,r.name,r.loanType,r.fundedDate,r.amount,r.partner,r.bps,r.gross,r.loPay,r.house].map(csvEscape).join(','))].join('\\n');
        downloadFile(`commissions_${Date.now()}.csv`, csv);
      });
    }
    if(!monthEl.__wired){
      monthEl.__wired = true;
      monthEl.addEventListener('change', ()=> renderCommissions());
    }
  }

  if(!window.__COMM_WRAPPED__){
    window.__COMM_WRAPPED__ = true;
    const _renderAll = window.renderAll;
    window.renderAll = async function(){
      const r = await _renderAll.apply(this, arguments);
      try{ await renderCommissions(); }catch(_){}
      return r;
    };
  }
  document.addEventListener('DOMContentLoaded', ()=>{ renderCommissions(); });

  function hasAction(detail, name){
    if(!detail || !name) return false;
    if(detail.action === name) return true;
    if(Array.isArray(detail.actions)){
      return detail.actions.some(entry => entry && entry.action === name);
    }
    return false;
  }

  let pendingRender = false;
  let renderTickScheduled = false;
  let renderActive = false;
  async function drainCommissionsRender(){
    renderTickScheduled = false;
    if(renderActive) return;
    renderActive = true;
    try{
      while(pendingRender){
        pendingRender = false;
        try{ await renderCommissions(); }
        catch(_){ }
      }
    } finally {
      renderActive = false;
      if(pendingRender){
        scheduleCommissionsRender();
      }
    }
  }
  function scheduleCommissionsRender(){
    pendingRender = true;
    if(renderTickScheduled) return;
    renderTickScheduled = true;
    Promise.resolve().then(drainCommissionsRender);
  }

  const DATA_LISTENER_KEY = '__COMMISSIONS_DATA_HANDLER__';
  const scheduleDataChangeFrame = (function(){
    let scheduled = false;
    const raf = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 16);
    return function(){
      if(scheduled) return;
      scheduled = true;
      raf(() => {
        scheduled = false;
        scheduleCommissionsRender();
      });
    };
  })();
  if(!window[DATA_LISTENER_KEY]){
    const handler = (evt) => {
      const detail = evt && evt.detail;
      if(!detail || detail.partial) return;
      if(hasAction(detail,'stage') || hasAction(detail,'contact') || hasAction(detail,'commissions')){
        scheduleDataChangeFrame();
      }
    };
    document.addEventListener('app:data:changed', handler, {passive:true});
    window[DATA_LISTENER_KEY] = handler;
  }
})();

/* === injected: Commissions DOM adapter (Phase 6 ledger tables) — v2025-09-17 === */
(function(){
  try{
    if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
    const FLAG='commissions_dom_adapter_v20250917';
    if(window.__INIT_FLAGS__[FLAG]) return;
    window.__INIT_FLAGS__[FLAG]=true;

    function $id(id){ return document.getElementById(id); }
    function pad(n){ return (n<10?'0':'')+n; }
    function ymd(d){ const x=new Date(d); if(!x||isNaN(x)) return ''; return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; }
    function toMoney(n){ n=Number(n||0); return '$' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function computeRange(kind, startEl, endEl){
      const today = new Date();
      let s=null, e=null;
      if(kind==='tm'){ s=new Date(today.getFullYear(), today.getMonth(), 1); e=new Date(today.getFullYear(), today.getMonth()+1, 0); }
      else if(kind==='lm'){ const d=new Date(today.getFullYear(), today.getMonth()-1, 1); s=d; e=new Date(d.getFullYear(), d.getMonth()+1, 0); }
      else if(kind==='ytd'){ s=new Date(today.getFullYear(),0,1); e=today; }
      else if(kind==='all'){ s=null; e=null; }
      else if(kind==='custom'){
        const sv = startEl?.value; const ev = endEl?.value;
        s = sv? new Date(sv) : null; e = ev? new Date(ev) : null;
      }
      const custom = (kind==='custom');
      if(startEl) startEl.disabled = !custom;
      if(endEl) endEl.disabled = !custom;
      return {start:s, end:e};
    }
    function inRange(date, start, end){
      if(!date) return false;
      const d = new Date(date);
      if(isNaN(d)) return false;
      if(start && d < start) return false;
      if(end && d > end) return false;
      return true;
    }

    async function renderLedger(){
      const ledgerView = $id('commissions-ledger'); if(!ledgerView) return;
      const parentView = document.getElementById('view-reports');
      if(parentView && parentView.classList.contains('hidden')) return;

      await openDB();
      const [contacts, partners, settings] = await Promise.all([dbGetAll('contacts'), dbGetAll('partners'), dbGetAll('settings')]);
      const pMap = new Map(partners.map(p=>[p.id, p]));
      const commFlags = (settings.find(s=>s.id==='commissionFlags')||{map:{}}).map || {};

      const rangeSel = $id('led-range'); const startEl = $id('led-start'); const endEl = $id('led-end');
      const {start, end} = computeRange((rangeSel?.value)||'tm', startEl, endEl);

      const received = contacts.filter(c=> c.fundedDate && inRange(c.fundedDate,start,end));
      const projected = contacts.filter(c=> !c.fundedDate && !/lost|dead|closed/i.test(String(c.status||c.stage||'')));

      // received table
      const tbRec = document.querySelector('#tbl-ledger-received tbody');
      if(tbRec){
        tbRec.innerHTML = received.map(c=>{
          const name = `${c.first||''} ${c.last||''}`.trim() || (c.name||'');
          const partner = (pMap.get(c.partnerId)?.name) || c.partnerName || 'None';
          const amt = Number(c.amount||c.loanAmount||0);
          const paid = !!commFlags[c.id];
          return `<tr data-id="${c.id}">
            <td><input type="checkbox" class="paid-flag"${paid?' checked':''}></td>
            <td>${name}</td><td>${(c.loanType||'').toUpperCase()}</td>
            <td>${toMoney(amt)}</td><td>${ymd(c.fundedDate)}</td><td>${partner}</td>
          </tr>`;
        }).join('');
      }
      const recSumEl = $id('led-rec-sum');
      if(recSumEl){ const sum = received.reduce((s,c)=> s + Number(c.amount||c.loanAmount||0), 0); recSumEl.textContent = toMoney(sum); }

      // projected table
      const tbProj = document.querySelector('#tbl-ledger-projected tbody');
      if(tbProj){
        tbProj.innerHTML = projected.map(c=>{
          const name = `${c.first||''} ${c.last||''}`.trim() || (c.name||'');
          const partner = (pMap.get(c.partnerId)?.name) || c.partnerName || 'None';
          const amt = Number(c.amount||c.loanAmount||0);
          return `<tr data-id="${c.id}">
            <td>${name}</td><td>${String(c.stage||'').toUpperCase()}</td>
            <td>${(c.loanType||'').toUpperCase()}</td><td>${toMoney(amt)}</td><td>${partner}</td>
          </tr>`;
        }).join('');
      }
      const projSumEl = $id('led-proj-sum');
      if(projSumEl){ const sum = projected.reduce((s,c)=> s + Number(c.amount||c.loanAmount||0), 0); projSumEl.textContent = toMoney(sum); }

      // wire paid flags
      const tbl = document.getElementById('tbl-ledger-received');
      if(tbl && !tbl.__wired){
        tbl.__wired = true;
        tbl.addEventListener('change', async (e)=>{
          const cb = e.target.closest('.paid-flag'); if(!cb) return;
          const tr = cb.closest('tr'); const id = tr?.getAttribute('data-id'); if(!id) return;
          await openDB();
          const all = await dbGetAll('settings');
          const rec = all.find(s=>s.id==='commissionFlags') || {id:'commissionFlags', map:{}};
          rec.map = rec.map || {}; rec.map[id] = !!cb.checked;
          await dbPut('settings', rec);
        });
      }
    }

    // control wiring
    document.addEventListener('change', (e)=>{
      if(e.target && (e.target.id==='led-range' || e.target.id==='led-start' || e.target.id==='led-end')){
        renderLedger();
      }
    });
    const apply = $id('led-apply'); if(apply && !apply.__wired){ apply.__wired = true; apply.addEventListener('click', ()=>renderLedger()); }

    // export
    const exp = $id('led-export');
    if(exp && !exp.__wired){
      exp.__wired = true;
      exp.addEventListener('click', async ()=>{
        await openDB();
        const contacts = await dbGetAll('contacts');
        const {start,end} = computeRange(($id('led-range')?.value)||'tm', $id('led-start'), $id('led-end'));
        const received = contacts.filter(c=> c.fundedDate && inRange(c.fundedDate,start,end));
        const rows = [['Paid','Name','Loan Type','Amount','Funded','Partner','Id']];
        rows.push(...received.map(c=>[
          '', `${(c.first||'').trim()} ${(c.last||'').trim()}`.trim() || (c.name||''),
          (c.loanType||'').toUpperCase(),
          String(Number(c.amount||c.loanAmount||0)),
          ymd(c.fundedDate),
          c.partnerName||'',
          c.id||''
        ]));
        const csv = rows.map(r=> r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], {type:'text/csv'});
        const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='commissions_received.csv'; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      });
    }

    // hook to lifecycle
    document.addEventListener('DOMContentLoaded', renderLedger);

    if(!window.__LEDGER_RENDER_WRAP__){
      window.__LEDGER_RENDER_WRAP__ = true;
      const prevRenderAll = window.renderAll;
      if(typeof prevRenderAll === 'function'){
        window.renderAll = async function(){
          const result = await prevRenderAll.apply(this, arguments);
          try{ await renderLedger(); }catch(_){ }
          return result;
        };
      }
    }

    window.renderLedger = (function(orig){
      return async function(){ try{ await renderLedger(); }catch(_){ } return (typeof orig==='function'?orig():undefined); };
    })(window.renderLedger);

    function hasLedgerAction(detail){
      if(!detail || detail.partial) return false;
      if(detail.action === 'stage' || detail.action === 'contact' || detail.action === 'commissions') return true;
      if(Array.isArray(detail.actions)){
        return detail.actions.some(entry => entry && ['stage','contact','commissions'].includes(entry.action));
      }
      return false;
    }

    let ledgerPending = false;
    let ledgerTickScheduled = false;
    let ledgerActive = false;
    async function drainLedgerRender(){
      ledgerTickScheduled = false;
      if(ledgerActive) return;
      ledgerActive = true;
      try{
        while(ledgerPending){
          ledgerPending = false;
          try{ await renderLedger(); }
          catch(_){ }
        }
      } finally {
        ledgerActive = false;
        if(ledgerPending){
          scheduleLedgerRender();
        }
      }
    }
    function scheduleLedgerRender(){
      ledgerPending = true;
      if(ledgerTickScheduled) return;
      ledgerTickScheduled = true;
      Promise.resolve().then(drainLedgerRender);
    }

    const LEDGER_LISTENER_KEY = '__COMMISSIONS_LEDGER_HANDLER__';
    const scheduleLedgerFrame = (function(){
      let scheduled = false;
      const raf = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(cb, 16);
      return function(){
        if(scheduled) return;
        scheduled = true;
        raf(() => {
          scheduled = false;
          scheduleLedgerRender();
        });
      };
    })();
    if(!window[LEDGER_LISTENER_KEY]){
      const ledgerHandler = (evt) => {
        const detail = evt && evt.detail;
        if(!hasLedgerAction(detail)) return;
        scheduleLedgerFrame();
      };
      document.addEventListener('app:data:changed', ledgerHandler, {passive:true});
      window[LEDGER_LISTENER_KEY] = ledgerHandler;
    }

  }catch(e){ try{ console.error('commissions_dom_adapter error', e); }catch(_u){} }
})();
 /* === /injected === */
