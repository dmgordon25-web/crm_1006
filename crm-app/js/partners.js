
// partners.js — partner modal wiring & selection helpers
import { debounce } from './patch_2025-10-02_baseline_ux_cleanup.js';

(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.partners_plus) return;
  window.__INIT_FLAGS__.partners_plus = true;

  function $$(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function $(sel, root){ return (root||document).querySelector(sel); }

  [
    '#adv-query',
    '#query-builder',
    '.query-shell[data-query-scope="partners"]',
    '#view-partners .query-save-row'
  ].forEach(selector => {
    const n = document.querySelector(selector);
    if(n){
      n.remove();
    }
  });

  function applyFilter(value){
    if(typeof document === 'undefined') return;
    const query = String(value == null ? '' : value).toLowerCase();
    const table = document.getElementById('tbl-partners');
    if(!table || !table.tBodies || !table.tBodies[0]) return;
    const rows = Array.from(table.tBodies[0].querySelectorAll('tr[data-id]'));
    rows.forEach(row => {
      const text = (row.textContent || '').toLowerCase();
      row.style.display = query && !text.includes(query) ? 'none' : '';
    });
  }

  function wireFilter(){
    if(typeof document === 'undefined') return;
    const input = document.querySelector('#view-partners input[data-table-search="#tbl-partners"], #view-partners input[data-role="partner-search"]');
    if(!input || input.__simpleFilter) return;
    input.__simpleFilter = true;
    const run = () => applyFilter(input.value || '');
    const handler = debounce(run, 150);
    input.addEventListener('input', handler);
    run();
  }

  wireFilter();
  if(typeof document !== 'undefined'){
    document.addEventListener('DOMContentLoaded', wireFilter);
    document.addEventListener('app:data:changed', () => {
      const input = document.querySelector('#view-partners input[data-table-search="#tbl-partners"], #view-partners input[data-role="partner-search"]');
      if(input && input.value){
        applyFilter(input.value);
      }
    }, { passive: true });
  }


  function requestPartnerModal(partnerId){
    if(typeof window.renderPartnerModal==='function'){
      return window.renderPartnerModal(partnerId);
    }
    const queue = window.__PARTNER_MODAL_QUEUE__ = window.__PARTNER_MODAL_QUEUE__ || [];
    queue.push(partnerId);
    return Promise.resolve();
  }

  window.requestPartnerModal = requestPartnerModal;

  const addBtn = document.getElementById('btn-add-partner');
  if(addBtn && !addBtn.__wired){
    addBtn.__wired = true;
    addBtn.addEventListener('click', async ()=>{
      await requestPartnerModal();
    });
  }

  // Selection sync (ensures checkboxes reflect store state)
  function syncSelectionCheckboxes(scope, ids){
    const scopeKey = scope && scope.trim() ? scope.trim() : 'partners';
    const idSet = ids instanceof Set
      ? ids
      : new Set(Array.isArray(ids) ? ids.map(String) : []);
    $$("[data-selection-scope='"+scopeKey+"']").forEach(table => {
      table.querySelectorAll('tbody tr[data-id]').forEach(row => {
        const id = row.getAttribute('data-id');
        if(!id) return;
        const checkbox = row.querySelector('[data-role="select"]');
        if(!checkbox) return;
        const shouldCheck = idSet.has(String(id));
        if(checkbox.checked !== shouldCheck){
          checkbox.checked = shouldCheck;
        }
      });
    });
  }

  function handleSelectionSnapshot(snapshot){
    if(!snapshot || snapshot.scope !== 'partners') return;
    const ids = snapshot.ids instanceof Set
      ? snapshot.ids
      : new Set(Array.from(snapshot.ids || [], value => String(value)));
    syncSelectionCheckboxes('partners', ids);
  }

  function initSelectionMirror(){
    if(initSelectionMirror.__wired) return;
    const store = window.SelectionStore || null;
    if(!store) return;
    initSelectionMirror.__wired = true;
    store.subscribe(handleSelectionSnapshot);
  }

  initSelectionMirror();
  document.addEventListener('DOMContentLoaded', initSelectionMirror);
})();
