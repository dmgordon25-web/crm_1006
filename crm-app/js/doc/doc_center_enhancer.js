(function(){
  if (window.__DOC_CENTER_ENH__) return; window.__DOC_CENTER_ENH__ = true;

  const LS_KEY = 'doccenter:filters:v1';

  const ROW_SELECTOR = '[data-doc-row], .doc-row, [role="row"], li[data-id], tr[data-id], [data-id][data-doc]';

  function loadFilters(){
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  function saveFilters(f){
    try { localStorage.setItem(LS_KEY, JSON.stringify(f||{})); } catch {}
  }

  function findHost(){
    // Be flexible: Settings may render Doc Center into various containers.
    return document.querySelector('[data-doc-center]') ||
           document.getElementById('doc-center') ||
           document.querySelector('#settings-docs, .doc-center, [data-panel="doc-center"]');
  }

  function statusColor(s){
    const k = (s||'').toLowerCase();
    return ({
      draft:'#7f8c8d', pending:'#d35400', signed:'#27ae60', uploaded:'#2980b9', error:'#c0392b'
    })[k] || '#8395a7';
  }

  function chip(text, color){
    const el = document.createElement('span');
    el.textContent = text;
    el.setAttribute('data-chip','1');
    el.style.cssText = `display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;line-height:1;background:${color}1A;color:${color};border:1px solid ${color}33;margin-left:6px;`;
    return el;
  }

  function decorateRow(row){
    if (!row || row.__decorated) return;
    row.__decorated = true;

    // Expect dataset on row or its children
    const nameEl = row.querySelector('[data-doc-name]') || row.querySelector('.doc-name') || row.querySelector('strong, .name');
    const status = (row.dataset.status || row.getAttribute('data-doc-status') || (row.querySelector('[data-doc-status]')?.textContent) || '').trim();
    const type = (row.dataset.type || row.getAttribute('data-doc-type') || (row.querySelector('[data-doc-type]')?.textContent) || '').trim();

    // Add status chip next to name
    if (nameEl && status) {
      nameEl.appendChild(chip(status, statusColor(status)));
    }

    // Wire buttons if present
    const openBtn = row.querySelector('[data-action="open"], .btn-open, a[download][href], a[href*="blob:"]');
    const dlBtn   = row.querySelector('[data-action="download"], .btn-download');
    const delBtn  = row.querySelector('[data-action="delete"], .btn-delete');

    // Be conservative: if href exists, let default nav happen; otherwise attach handler hooks
    if (openBtn && !openBtn.__wired) {
      openBtn.__wired = true;
      openBtn.addEventListener('click', (e)=>{
        const href = openBtn.getAttribute('href');
        if (!href) e.preventDefault();
        // No-op if natural link exists; otherwise emit a soft event for any existing listener
        if (!href) document.dispatchEvent(new CustomEvent('doc:open',{ detail:{ row } }));
      });
    }

    if (dlBtn && !dlBtn.__wired) {
      dlBtn.__wired = true;
      dlBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('doc:download',{ detail:{ row }}));
      });
    }

    if (delBtn && !delBtn.__wired) {
      delBtn.__wired = true;
      delBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        const id = row.dataset.id || row.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Delete this document?')) return;
        // Prefer existing app delete API if available
        const api = window.deleteDocument || window.Documents?.remove;
        if (typeof api === 'function'){
          Promise.resolve(api(id)).then(()=>{
            row.remove();
            document.dispatchEvent(new CustomEvent('app:data:changed', { detail:{ scope:'docs', ids:[id] }}));
          }).catch(()=>{});
        } else {
          // Fallback: hide row to keep UI honest
          row.remove();
        }
      });
    }

    // Attach searchable metadata for the filter bar
    row.dataset.search = [
      (nameEl && nameEl.textContent || '').toLowerCase(),
      status.toLowerCase(),
      type.toLowerCase()
    ].filter(Boolean).join(' ');
  }

  function ensureFilterBar(host){
    if (!host || host.__filterbar) return;
    host.__filterbar = true;

    const bar = document.createElement('div');
    bar.setAttribute('data-doc-filters','');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0 12px 0;';

    bar.innerHTML = `
      <input type="search" placeholder="Search documents..." data-f="q" style="flex:1;min-width:180px;">
      <select data-f="type">
        <option value="">All types</option>
        <option value="pdf">PDF</option>
        <option value="image">Image</option>
        <option value="doc">Doc</option>
        <option value="other">Other</option>
      </select>
      <select data-f="status">
        <option value="">All status</option>
        <option>Uploaded</option>
        <option>Pending</option>
        <option>Signed</option>
        <option>Draft</option>
        <option>Error</option>
      </select>
      <button data-f="clear">Clear</button>
    `;
    host.prepend(bar);

    const state = Object.assign({ q:'', type:'', status:'' }, loadFilters());
    bar.querySelector('[data-f="q"]').value = state.q || '';
    bar.querySelector('[data-f="type"]').value = state.type || '';
    bar.querySelector('[data-f="status"]').value = state.status || '';

    function read(){ return {
      q: bar.querySelector('[data-f="q"]').value.trim().toLowerCase(),
      type: bar.querySelector('[data-f="type"]').value.trim().toLowerCase(),
      status: bar.querySelector('[data-f="status"]').value.trim().toLowerCase()
    };}

    function apply(){
      const f = read();
      saveFilters(f);
      const rows = host.querySelectorAll(ROW_SELECTOR);
      rows.forEach(r=>{
        decorateRow(r);
        const hay = (r.dataset.search || '').toLowerCase();
        const rType = (r.dataset.type || '').toLowerCase();
        const rStatus = (r.dataset.status || '').toLowerCase();
        const match = (!f.q || hay.includes(f.q))
                   && (!f.type || rType===f.type)
                   && (!f.status || rStatus===f.status);
        r.hidden = !match;
        if (r.hidden) r.setAttribute('aria-hidden','true'); else r.removeAttribute('aria-hidden');
      });
      // coalesce a repaint
      try { window.RenderGuard?.requestRender?.(); } catch {}
    }

    bar.addEventListener('input', apply);
    bar.querySelector('[data-f="clear"]').addEventListener('click', ()=>{
      bar.querySelector('[data-f="q"]').value = '';
      bar.querySelector('[data-f="type"]').value = '';
      bar.querySelector('[data-f="status"]').value = '';
      apply();
    });

    // initial apply after bar mounts
    setTimeout(apply, 0);
  }

  function sweep(){
    const host = findHost();
    if(!host) return;
    // decorate existing rows
    host.querySelectorAll(ROW_SELECTOR).forEach(decorateRow);
    ensureFilterBar(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweep, { once:true });
  } else {
    sweep();
  }

  // Re-run after renders
  try {
    if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function'){
      window.RenderGuard.registerHook(() => setTimeout(sweep, 0));
    }
  } catch {}

  // Refresh when docs change
  document.addEventListener('app:data:changed', (e)=>{
    const scope = e && e.detail && e.detail.scope;
    if (scope === 'docs' || scope === 'import' || scope === 'seed') setTimeout(sweep, 0);
  });
})();
