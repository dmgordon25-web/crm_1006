// reports.js — Safe KPI & Sidebar (2025-09-17)
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.reports_safe) return;
  window.__INIT_FLAGS__.reports_safe = true;

  function $(s,r){ return (r||document).querySelector(s); }
  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(d){ const x=new Date(d); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; }
  function inThisMonth(ts){
    const d=new Date(ts), now=new Date();
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  }

  function money(n){
    try{
      return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));
    }catch(_){
      return '$'+(Number(n||0).toFixed(0));
    }
  }
  function safe(v){
    return String(v==null?'':v).replace(/[&<>]/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch]));
  }
  function initials(name){
    const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '—';
    const first = parts[0][0]||'';
    const last = parts.length>1 ? parts[parts.length-1][0]||'' : '';
    return (first+last).toUpperCase() || first.toUpperCase() || '—';
  }
  function toDate(value){
    if(!value) return null;
    const d = new Date(value);
    if(!Number.isNaN(d.getTime())) return d;
    if(typeof value==='string' && value.length===10){
      const alt = new Date(value+'T00:00:00');
      if(!Number.isNaN(alt.getTime())) return alt;
    }
    return null;
  }
  const stageLabels = {
    application:'Application',
    processing:'Processing',
    underwriting:'Underwriting',
    approved:'Approved',
    'cleared-to-close':'Cleared to Close',
    funded:'Funded',
    'post-close':'Post-Close',
    nurture:'Nurture',
    lost:'Lost',
    denied:'Denied',
    'long shot':'Long Shot'
  };
  const stageColors = {
    application:'#6366f1',
    processing:'#f97316',
    underwriting:'#f59e0b',
    approved:'#10b981',
    'cleared-to-close':'#0ea5e9',
    funded:'#0f172a',
    'post-close':'#0284c7',
    nurture:'#0ea5e9',
    lost:'#ef4444',
    denied:'#ef4444',
    'long shot':'#94a3b8'
  };
  const tierColors = {
    core:'#0f766e',
    preferred:'#047857',
    strategic:'#5b21b6',
    developing:'#92400e',
    partner:'#4f46e5'
  };
  const NONE_PARTNER_ID = '00000000-0000-none-partner-000000000000';
  function colorForStage(key){
    const norm = String(key||'').toLowerCase();
    return stageColors[norm] || '#6366f1';
  }
  function colorForTier(label){
    const norm = String(label||'').toLowerCase();
    if(norm.includes('core')) return tierColors.core;
    if(norm.includes('preferred')) return tierColors.preferred;
    if(norm.includes('strategic')) return tierColors.strategic;
    if(norm.includes('develop')) return tierColors.developing;
    return tierColors.partner;
  }
  function html(el, value){ if(el) el.innerHTML = value; }

  async function compute(){
    await openDB();
    const [contacts, partners, tasks, documents] = await Promise.all([
      dbGetAll('contacts'), dbGetAll('partners'), dbGetAll('tasks'), dbGetAll('documents')
    ]);
    const R = (window.DASH_RANGE==='tm') ? (x=> inThisMonth(x)) : (_=>true);

    const contactById = new Map((contacts||[]).map(c=>[String(c.id), c]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const total = contacts.length;
    const funded = contacts.filter(c=> c.fundedDate && R(c.fundedDate)).length;
    const loanVol = contacts.filter(c=> c.fundedDate && R(c.fundedDate)).reduce((a,c)=> a + Number(c.amount||c.loanAmount||0), 0);
    const pipelineAmt = contacts.filter(c=> !c.fundedDate && (c.status||'inprogress')!=='lost' && R(c.updatedAt||Date.now()))
                              .reduce((a,c)=> a + Number(c.amount||c.loanAmount||0), 0);
    const commRate = 0.005; // conservative placeholder unless configured elsewhere
    const commEarned = Math.round(loanVol * commRate);
    const commReceived = contacts.filter(c=> c.fundedDate && R(c.fundedDate)).reduce((a,c)=> a + Number(c.commissionReceived||0), 0);
    const commProjected = pipelineAmt * commRate;
    const conv = total? Math.round((funded/Math.max(total,1))*100):0;

    // KPIs
    $('#kpi-total') && ($('#kpi-total').textContent = String(total));
    $('#kpi-funded') && ($('#kpi-funded').textContent = String(funded));
    $('#kpi-loanvol') && ($('#kpi-loanvol').textContent = '$'+loanVol.toLocaleString());
    $('#kpi-conv') && ($('#kpi-conv').textContent = `${conv}%`);
    $('#kpi-comm-pipeline') && ($('#kpi-comm-pipeline').textContent = '$'+pipelineAmt.toLocaleString());
    $('#kpi-comm-earned') && ($('#kpi-comm-earned').textContent = '$'+commEarned.toLocaleString());
    $('#kpi-comm-received') && ($('#kpi-comm-received').textContent = '$'+commReceived.toLocaleString());
    $('#kpi-comm-proj') && ($('#kpi-comm-proj').textContent = '$'+commProjected.toLocaleString());

    // In-progress/longshot/clients counts
    const inprog = contacts.filter(c=> (c.status||'inprogress')==='inprogress').length;
    const longshot = contacts.filter(c=> (c.status||'')==='longshot').length;
    const clients = contacts.filter(c=> (c.status||'')==='client' || c.fundedDate).length;
    $('#kpi-inprog') && ($('#kpi-inprog').textContent = String(inprog));
    $('#kpi-longshot') && ($('#kpi-longshot').textContent = String(longshot));
    $('#kpi-clients') && ($('#kpi-clients').textContent = String(clients));

    // Partner Tier Breakdown (enhanced)
    const tierCounts = partners.reduce((acc, partner)=>{
      const tier = partner.tier || 'Developing';
      acc[tier] = (acc[tier]||0)+1;
      return acc;
    },{});
    const tierEntries = Object.entries(tierCounts).sort((a,b)=>b[1]-a[1]);
    const tierTotal = tierEntries.reduce((sum,[,count])=> sum+count, 0);
    const tierEl = $('#partner-tier-breakdown');
    if(tierEl){
      if(!tierEntries.length){
        tierEl.innerHTML = '<div class="mini-bar-chart portfolio-chart"><div class="mini-bar-row empty">Add partners to see portfolio mix.</div></div>';
      }else{
        const rows = tierEntries.map(([tier,count])=>{
          const pct = tierTotal ? Math.round((count/tierTotal)*100) : 0;
          const color = colorForTier(tier);
          return `<div class="mini-bar-row"><div class="mini-bar-label"><span class="mini-bar-dot" style="background:${color}"></span>${safe(tier)}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.max(pct,3)}%"></div></div><div class="mini-bar-value">${count} • ${pct}%</div></div>`;
        }).join('');
        tierEl.innerHTML = `<div class="mini-bar-chart portfolio-chart">${rows}</div>`;
      }
    }

    // Top referral partners
    const referralStats = new Map();
    contacts.forEach(contact=>{
      const pid = contact.buyerPartnerId || contact.listingPartnerId || contact.partnerId;
      if(!pid || pid===NONE_PARTNER_ID) return;
      const stat = referralStats.get(pid) || {count:0, volume:0, contacts:[]};
      stat.count += 1;
      stat.volume += Number(contact.loanAmount||0)||0;
      stat.contacts.push(contact);
      referralStats.set(pid, stat);
    });
    const totalReferrals = Array.from(referralStats.values()).reduce((sum, stat)=> sum + (stat.count||0), 0) || 0;
    const top3 = Array.from(referralStats.entries()).sort((a,b)=> (b[1]?.count||0) - (a[1]?.count||0)).slice(0,3);
    html($('#top3'), top3.length ? top3.map(([pid, stat])=>{
      const partner = partners.find(x=> String(x.id)===String(pid)) || {name:'—'};
      const share = totalReferrals ? Math.round((stat.count/totalReferrals)*100) : 0;
      const tier = partner.tier ? `<span class="insight-tag light">${safe(partner.tier)}</span>` : '';
      const details = [partner.company, partner.phone, partner.email].filter(Boolean).map(val=>safe(val)).join(' • ');
      const stageCounts = stat.contacts.reduce((acc, contact)=>{
        const key = String(contact.stage||'').toLowerCase();
        acc[key] = (acc[key]||0)+1;
        return acc;
      },{});
      const topStage = Object.entries(stageCounts).sort((a,b)=> b[1]-a[1])[0];
      const focus = topStage ? `${stageLabels[topStage[0]] || topStage[0]} (${topStage[1]})` : '';
      const focusLine = focus ? `<div class="insight-sub">Focus: ${safe(focus)}</div>` : '';
      const detailLine = details ? `<div class="insight-sub">${details}</div>` : '';
      const volumeLine = stat.volume ? `<div class="insight-sub">Loan Volume: ${money(stat.volume)}</div>` : '';
      return `<li>
        <div class="list-main">
          <span class="insight-avatar">${initials(partner.name||'')}</span>
          <div>
            <div class="insight-title">${safe(partner.name||'—')}</div>
            <div class="insight-sub">${stat.count} referrals • ${share}% share</div>
            ${focusLine}
            ${volumeLine}
            ${detailLine}
          </div>
        </div>
        <div class="insight-meta">${tier || ''}</div>
      </li>`;
    }).join('') : '<li class="empty">Recruit or tag partners to surface leaders.</li>');

    // Needs Your Attention — overdue & soon tasks
    const openTasks = (tasks||[]).filter(task=> task && task.due && !task.done).map(task=>{
      const dueDate = toDate(task.due);
      const contact = contactById.get(String(task.contactId||''));
      const stage = contact ? String(contact.stage||'').replace(/-/g,' ') : '';
      const diff = dueDate ? Math.floor((dueDate.getTime()-today.getTime())/86400000) : null;
      let status = 'ready';
      if(diff!=null){
        if(diff < 0) status = 'overdue';
        else if(diff <= 3) status = 'soon';
      }
      const dueLabel = dueDate ? dueDate.toISOString().slice(0,10) : 'No date';
      return {
        raw: task,
        title: task.title || task.text || 'Follow up',
        dueDate,
        dueLabel,
        status,
        diffFromToday: diff,
        contact,
        name: contact ? `${(contact.first||'').trim()} ${(contact.last||'').trim()}`.trim() || contact.name || 'General Task' : 'General Task',
        stage
      };
    }).sort((a,b)=>{
      const ad = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
      return ad-bd;
    });

    const attention = openTasks.filter(task=> task.status==='overdue' || task.status==='soon').slice(0,6);
    html($('#needs-attn'), attention.length ? attention.map(task=>{
      const cls = task.status==='overdue' ? 'bad' : (task.status==='soon' ? 'warn' : 'good');
      const phr = task.status==='overdue' ? `${Math.abs(task.diffFromToday||0)}d overdue` : (task.status==='soon' ? `Due in ${task.diffFromToday}d` : 'Scheduled');
      return `<li class="${task.status}">
        <div class="list-main">
          <span class="status-dot ${task.status}"></span>
          <div>
            <div class="insight-title">${safe(task.title)}</div>
            <div class="insight-sub">${safe(task.name)}${task.stage?` • ${safe(task.stage)}`:''}</div>
          </div>
        </div>
        <div class="insight-meta ${cls}">${phr} · ${task.dueLabel}</div>
      </li>`;
    }).join('') : '<li class="empty">No urgent follow-ups — nice work!</li>');

    const timeline = openTasks.filter(task=> task.status!=='overdue').slice(0,6);
    html($('#upcoming'), timeline.length ? timeline.map(task=>{
      const cls = task.status==='soon' ? 'warn' : 'good';
      const phr = task.status==='soon' ? `Due in ${task.diffFromToday}d` : 'Scheduled';
      return `<li>
        <div class="list-main">
          <span class="status-dot ${task.status}"></span>
          <div>
            <div class="insight-title">${safe(task.title)}</div>
            <div class="insight-sub">${safe(task.name)}${task.stage?` • ${safe(task.stage)}`:''}</div>
          </div>
        </div>
        <div class="insight-meta ${cls}">${phr} · ${task.dueLabel}</div>
      </li>`;
    }).join('') : '<li class="empty">No events scheduled. Add tasks to stay proactive.</li>');

    // Pipeline stage breakdown
    const stageCounts = contacts.reduce((map, contact)=>{
      const stage = String(contact.stage||'').toLowerCase();
      map[stage] = (map[stage]||0)+1;
      return map;
    },{});
    const orderedStages = ['application','processing','underwriting','approved','cleared-to-close','funded','post-close','nurture','lost','denied','long shot'];
    const stageTotal = Object.values(stageCounts).reduce((sum,val)=> sum+val, 0);
    const stageSet = new Set(orderedStages);
    const extras = Object.keys(stageCounts).filter(key=> !stageSet.has(key) && stageCounts[key]);
    const stageOrder = orderedStages.filter(key=> stageCounts[key]).concat(extras);
    const pb = $('#pipeline-breakdown');
    if(pb){
      if(!stageTotal){
        pb.innerHTML = '<div class="mini-bar-chart momentum-chart"><div class="mini-bar-row empty">Add contacts to chart pipeline momentum.</div></div>';
      }else{
        const rows = stageOrder.map(key=>{
          const count = stageCounts[key]||0;
          const pct = stageTotal ? Math.round((count/stageTotal)*100) : 0;
          const label = stageLabels[key] || (key ? key.replace(/-/g,' ') : 'Stage');
          const color = colorForStage(key);
          return `<div class="mini-bar-row"><div class="mini-bar-label"><span class="mini-bar-dot" style="background:${color}"></span>${safe(label)}</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.max(pct,3)}%"></div></div><div class="mini-bar-value">${count} • ${pct}%</div></div>`;
        }).join('');
        pb.innerHTML = `<div class="mini-bar-chart momentum-chart">${rows}</div>`;
      }
    }

    // Document status summary
    const docHost = $('#doc-status-summary');
    if(docHost){
      const docs = documents||[];
      if(!docs.length){
        docHost.innerHTML = '<div class="empty muted">Add documents to begin tracking checklist progress.</div>';
      }else{
        const normalizeStatus = (value)=>{
          const raw = String(value||'').trim().toLowerCase();
          if(!raw) return 'requested';
          if(raw==='followup' || raw==='follow-up') return 'follow up';
          if(raw.includes('follow')) return 'follow up';
          if(raw.includes('receive')) return 'received';
          if(raw.includes('waive')) return 'waived';
          if(raw.includes('request')) return 'requested';
          return raw;
        };
        const counts = docs.reduce((acc, doc)=>{
          const key = normalizeStatus(doc.status);
          acc[key] = (acc[key]||0)+1;
          return acc;
        },{});
        const totalDocs = docs.length;
        const updatedAt = docs.reduce((max, doc)=> Math.max(max, Number(doc.updatedAt||0)||0), 0);
        const lastUpdated = updatedAt ? new Date(updatedAt) : null;
        const statusOrder = [
          {key:'requested', label:'Requested', tone:'pending', color:'#f97316', helper:'Awaiting borrower upload'},
          {key:'follow up', label:'Follow Up', tone:'follow', color:'#ef4444', helper:'Needs outreach'},
          {key:'received', label:'Received', tone:'ok', color:'#10b981', helper:'Filed and ready'},
          {key:'waived', label:'Waived', tone:'waived', color:'#64748b', helper:'No longer required'}
        ];
        const outstanding = statusOrder
          .filter(s=> s.key==='requested' || s.key==='follow up')
          .reduce((sum, s)=> sum + (counts[s.key]||0), 0);
        const pendingLabel = outstanding===1 ? '1 item pending' : `${outstanding} items pending`;
        const overviewMetaParts = [`${totalDocs} total docs`];
        if(lastUpdated && !Number.isNaN(lastUpdated.getTime())){
          overviewMetaParts.push(`Updated ${lastUpdated.toLocaleDateString()}`);
        }
        const rows = statusOrder.map(entry=>{
          const count = counts[entry.key]||0;
          const pct = totalDocs ? Math.round((count/totalDocs)*100) : 0;
          const barWidth = count ? Math.max(pct, 6) : 0;
          return `<div class="doc-status-row">
            <span class="status-pill" data-tone="${entry.tone}">${safe(entry.label)}</span>
            <div class="bar" style="--bar-color:${entry.color}"><span style="width:${barWidth}%"></span></div>
            <div class="count">${count}</div>
            <div class="meta">${pct}% • ${safe(entry.helper)}</div>
          </div>`;
        }).join('');
        docHost.innerHTML = `<div class="doc-status-overview"><strong>${pendingLabel}</strong><span>${safe(overviewMetaParts.join(' • '))}</span></div>${rows}`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', compute);

  window.renderReports = compute;

  // === Reports view (tab) ===
  let __reportsFunded = [];

  function downloadFile(name, text){
    try{
      const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 500);
    }catch(err){ console.error('downloadFile', err); }
  }

  function computeRange(kind, startEl, endEl){
    const today = new Date();
    let start = null;
    let end = null;
    if(kind==='tm'){
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth()+1, 0, 23, 59, 59, 999);
    }else if(kind==='lm'){
      start = new Date(today.getFullYear(), today.getMonth()-1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
    }else if(kind==='tq'){
      const q = Math.floor(today.getMonth()/3);
      start = new Date(today.getFullYear(), q*3, 1);
      end = new Date(today.getFullYear(), q*3 + 3, 0, 23, 59, 59, 999);
    }else if(kind==='ytd'){
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }else if(kind==='all'){
      start = null;
      end = null;
    }else if(kind==='custom'){
      const sv = startEl?.value;
      const ev = endEl?.value;
      start = sv ? new Date(sv + 'T00:00:00') : null;
      end = ev ? new Date(ev + 'T23:59:59') : null;
    }
    if(start && Number.isNaN(start.getTime())) start = null;
    if(end && Number.isNaN(end.getTime())) end = null;
    return {start, end};
  }

  function dateInRange(dateValue, start, end){
    if(!dateValue) return false;
    const dt = new Date(dateValue);
    if(Number.isNaN(dt.getTime())) return false;
    if(start && dt < start) return false;
    if(end && dt > end) return false;
    return true;
  }

  async function renderReportsView(){
    const rangeSel = document.getElementById('rep-range');
    if(!rangeSel) return;
    const startEl = document.getElementById('rep-start');
    const endEl = document.getElementById('rep-end');
    const {start, end} = computeRange(rangeSel.value, startEl, endEl);

    await openDB();
    const [contacts, partners] = await Promise.all([dbGetAll('contacts'), dbGetAll('partners')]);
    const partnerById = new Map((partners||[]).map(p => [String(p.id), p]));

    const fundedRaw = (contacts||[]).filter(c => dateInRange(c.fundedDate, start, end));
    const enrichedDeals = fundedRaw.map(c => {
      const partner = partnerById.get(String(c.partnerId||c.buyerPartnerId||c.listingPartnerId)) || {};
      const amountValue = Number(c.loanAmount||c.amount||0)||0;
      const loanType = c.loanType || c.loanProgram || '—';
      const partnerName = partner.name || partner.company || '—';
      return Object.assign({}, c, {
        __amountValue: amountValue,
        __loanType: loanType,
        __partnerName: partnerName
      });
    });
    const fundedCount = enrichedDeals.length;
    const fundedVolume = enrichedDeals.reduce((sum, c)=> sum + (c.__amountValue||0), 0);

    const openPipeline = (contacts||[]).filter(c => {
      const stage = String(c.stage||'').toLowerCase();
      const status = String(c.status||'').toLowerCase();
      const isOpen = stage!=='funded' && stage!=='closed' && status!=='lost';
      if(!isOpen) return false;
      if(!start && !end) return true;
      const updated = c.updatedAt ? new Date(c.updatedAt) : null;
      if(updated && Number.isNaN(updated.getTime())) return true;
      if(start && updated && updated < start) return false;
      if(end && updated && updated > end) return false;
      return true;
    });
    const pipelineVolume = openPipeline.reduce((sum, c)=> sum + (Number(c.loanAmount||c.amount||0)||0), 0);

    const fundedEl = document.getElementById('rep-funded-count');
    if(fundedEl) fundedEl.textContent = String(fundedCount);
    const fundedSumEl = document.getElementById('rep-funded-sum');
    if(fundedSumEl) fundedSumEl.textContent = money(fundedVolume);
    const pipelineEl = document.getElementById('rep-pipeline-open');
    if(pipelineEl){
      pipelineEl.textContent = money(pipelineVolume);
      pipelineEl.dataset.count = String(openPipeline.length);
      pipelineEl.title = `${openPipeline.length} open deals`;
    }

    const tbody = document.querySelector('#tbl-funded tbody');
    if(tbody){
      if(!enrichedDeals.length){
        tbody.innerHTML = '<tr><td class="muted" colspan="5">No funded deals within this range.</td></tr>';
      }else{
        const rows = enrichedDeals
          .slice()
          .sort((a,b)=>{
            const da = new Date(a.fundedDate||0).getTime();
            const db = new Date(b.fundedDate||0).getTime();
            return db-da;
          })
          .map(c => {
            const name = `${(c.first||'').trim()} ${(c.last||'').trim()}`.trim() || safe(c.name||'—');
            const loanType = c.__loanType || '—';
            const amt = money(c.__amountValue||0);
            const fundedDate = c.fundedDate ? String(c.fundedDate).slice(0,10) : '—';
            const partnerName = c.__partnerName || '—';
            return `<tr>
              <td>${safe(name)}</td>
              <td>${safe(loanType)}</td>
              <td>${safe(amt)}</td>
              <td>${safe(fundedDate)}</td>
              <td>${safe(partnerName)}</td>
            </tr>`;
          }).join('');
        tbody.innerHTML = rows;
      }
    }

    __reportsFunded = enrichedDeals;
  }

  function exportReportsCsv(){
    if(!Array.isArray(__reportsFunded) || !__reportsFunded.length){
      if(typeof window.toast==='function') window.toast('No funded deals to export for this range.');
      return;
    }
    const headers = ['contactId','name','loanType','amount','fundedDate','partner'];
    const rows = __reportsFunded.map(c => {
      const name = `${(c.first||'').trim()} ${(c.last||'').trim()}`.trim() || c.name || '';
      const loanType = c.__loanType || '';
      const amount = c.__amountValue || 0;
      const fundedDate = c.fundedDate || '';
      const partner = c.__partnerName || '';
      return [c.id||'', name, loanType, amount, fundedDate, partner];
    });
    const csv = [headers.map(h=>`"${h}"`).join(','), ...rows.map(r => r.map(value => {
      const s = String(value??'');
      if(/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
      return s;
    }).join(','))].join('\n');
    downloadFile(`funded_${Date.now()}.csv`, csv);
  }

  function wireReportsView(){
    const rangeSel = document.getElementById('rep-range');
    const startEl = document.getElementById('rep-start');
    const endEl = document.getElementById('rep-end');
    if(rangeSel && !rangeSel.__wired){
      rangeSel.__wired = true;
      rangeSel.addEventListener('change', ()=>{
        const isCustom = rangeSel.value==='custom';
        if(startEl){ startEl.disabled = !isCustom; if(!isCustom) startEl.value = ''; }
        if(endEl){ endEl.disabled = !isCustom; if(!isCustom) endEl.value = ''; }
        if(!isCustom) renderReportsView();
      });
      const isCustomInit = rangeSel.value==='custom';
      if(startEl) startEl.disabled = !isCustomInit;
      if(endEl) endEl.disabled = !isCustomInit;
    }
    if(startEl && !startEl.__wired){
      startEl.__wired = true;
      startEl.addEventListener('change', ()=>{ if(rangeSel?.value==='custom') renderReportsView(); });
    }
    if(endEl && !endEl.__wired){
      endEl.__wired = true;
      endEl.addEventListener('change', ()=>{ if(rangeSel?.value==='custom') renderReportsView(); });
    }
    const applyBtn = document.getElementById('rep-apply');
    if(applyBtn && !applyBtn.__wired){
      applyBtn.__wired = true;
      applyBtn.addEventListener('click', ()=> renderReportsView());
    }
    const exportBtn = document.getElementById('rep-export');
    if(exportBtn && !exportBtn.__wired){
      exportBtn.__wired = true;
      exportBtn.addEventListener('click', exportReportsCsv);
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    wireReportsView();
    renderReportsView();
  });

  window.renderReportsView = renderReportsView;
})();

// __WRAP_SENTINEL__ — ensure module participates in central repaint

(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.reports_wrap) return; window.__INIT_FLAGS__.reports_wrap = true;
  const _ra = window.renderAll;
  window.renderAll = async function(){
    const r = (typeof _ra==='function') ? await _ra.apply(this, arguments) : undefined;
    try{ if(typeof window.renderReports==='function') await window.renderReports(); }catch(_e){}
    try{ if(typeof window.renderReportsView==='function') await window.renderReportsView(); }catch(_er){}
    return r;
  };
})();
