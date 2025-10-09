
// partners.js — partner modal wiring & selection helpers
import { debounce } from './services/utils.js';
import * as selection from './services/selection.js';

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

  function partnerRows(){
    const table = document.getElementById('tbl-partners');
    if(!table) return [];
    return Array.from(table.querySelectorAll('tbody tr[data-id]'));
  }

  function updatePartnerSelectionView(){
    const svc = selection || window.selectionService || window.SelectionService || window.Selection;
    const type = typeof svc?.getSelectionType === 'function' ? svc.getSelectionType() : svc?.type || 'contacts';
    const active = type === 'partners' ? new Set((svc?.getSelection?.() || []).map(String)) : new Set();
    partnerRows().forEach(row => {
      const id = row.getAttribute('data-id');
      if(!id) return;
      const checkbox = row.querySelector('[data-role="select"]');
      const shouldCheck = active.has(String(id));
      if(checkbox && checkbox.checked !== shouldCheck){
        checkbox.checked = shouldCheck;
      }
      row.classList.toggle('is-selected', shouldCheck);
    });
  }

  function ensureSelectionBridge(){
    if(ensureSelectionBridge.__wired) return;
    const svc = selection || window.selectionService || window.SelectionService || window.Selection;
    if(!svc || typeof svc.subscribe !== 'function') return;
    ensureSelectionBridge.__wired = true;
    ensureSelectionBridge.__unsubscribe = svc.subscribe((payload)=>{
      if(payload && (payload.type === 'partners' || payload.scope === 'partners')){
        updatePartnerSelectionView();
      }else if(!payload || payload.type !== 'partners'){
        updatePartnerSelectionView();
      }
    });
    document.addEventListener('app:data:changed', updatePartnerSelectionView);
    updatePartnerSelectionView();
  }

  ensureSelectionBridge();
  document.addEventListener('DOMContentLoaded', ensureSelectionBridge);

  const partnersTable = document.getElementById('tbl-partners');
  if(partnersTable && !partnersTable.__selectionWire){
    partnersTable.__selectionWire = true;
    partnersTable.addEventListener('change', (event)=>{
      const checkbox = event.target && event.target.closest?.('input[type="checkbox"][data-role="select"]');
      if(!checkbox) return;
      const row = checkbox.closest('tr[data-id]');
      const id = row?.getAttribute('data-id') || checkbox.getAttribute('data-id');
      if(!id) return;
      if(checkbox.checked){
        selection.select?.(id, 'partners', 'partners:checkbox');
      }else{
        selection.deselect?.(id, 'partners', 'partners:checkbox');
      }
    });
  }
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
    const editLink = ev.target.closest?.('.partner-name, [data-partner-edit]');
    if (editLink) {
      ev.preventDefault();
      const row = editLink.closest?.('tr[data-id]');
      const id = resolveId(row || editLink);
      if (id) openEdit(id);
      return;
    }
    const ignore = ev.target.closest?.('input[type="checkbox"], [data-role="select"], label[for], [data-act]');
    if (ignore) return;
    const row = ev.target.closest?.('tr[data-id]');
    if (!row) return;
    const id = resolveId(row);
    if (!id) return;
    selection.toggle?.(id, 'partners', 'partners:row');
  });
})();
