
// partners.js — partner modal wiring & selection helpers
import { debounce } from './services/utils.js';

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

(function () {
  if (window.__WIRED_partnersRowClick) return;
  window.__WIRED_partnersRowClick = true;

  const scopeSelectors = [
    '[data-view="partners"]',
    '[data-page="partners"]',
    '#view-partners',
    '#partners',
  ];

  let host = null;
  for (const sel of scopeSelectors) {
    const node = document.querySelector?.(sel);
    if (node) { host = node; break; }
  }

  const table = host?.querySelector?.('#tbl-partners tbody')
    || document.querySelector?.('#tbl-partners tbody')
    || host;

  if (!table) return;

  const resolveId = (el) => {
    if (!el) return null;
    const attrNames = ['data-partner-id', 'data-id', 'data-row-id'];
    for (const name of attrNames) {
      const value = el.getAttribute?.(name);
      if (value) return value;
    }
    const data = el.dataset || {};
    if (data.partnerId) return data.partnerId;
    if (data.id) return data.id;
    if (data.rowId) return data.rowId;
    return null;
  };

  const openEdit = async (id) => {
    if (!id) return;
    try {
      if (typeof window.openPartnerEditModal === 'function') {
        await Promise.resolve(window.openPartnerEditModal(id));
        return;
      }
      if (typeof window.showPartnerModal === 'function') {
        await Promise.resolve(window.showPartnerModal({ id }));
        return;
      }
      if (typeof window.requestPartnerModal === 'function') {
        await Promise.resolve(window.requestPartnerModal(id));
        return;
      }
      console.warn('Partner edit modal function not found');
    } catch (err) {
      console.error('Partner edit open failed', err);
    }
  };

  table.addEventListener('click', (ev) => {
    if (ev.defaultPrevented) return;
    const ignore = ev.target.closest?.('input[type="checkbox"], [data-role="select"], label[for]');
    if (ignore) return;
    const target = ev.target.closest?.('[data-partner-id], tr[data-id], tr[data-row-id]');
    if (!target) return;
    const id = resolveId(target);
    if (!id) return;
    if (target.tagName === 'A') ev.preventDefault();
    openEdit(id);
  });
})();
