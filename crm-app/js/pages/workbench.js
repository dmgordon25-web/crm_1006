import { doubleRaf } from '../patch_2025-10-02_baseline_ux_cleanup.js';

let lastMount = null;
let selectionListener = null;
let dataListener = null;
let refreshScheduled = false;
let currentOptions = {};
const tables = { contacts: null, partners: null };
const counts = { contacts: null, partners: null };

function ensureMount(){
  let mount = document.getElementById('view-workbench');
  if(!mount){
    mount = document.createElement('main');
    mount.id = 'view-workbench';
    mount.classList.add('hidden');
    mount.setAttribute('data-view', 'workbench');
    const container = document.querySelector('.container');
    if(container){
      container.appendChild(mount);
    }else{
      document.body.appendChild(mount);
    }
  }
  lastMount = mount;
  return mount;
}

function isWorkbenchActive(){
  const mount = document.getElementById('view-workbench');
  if(!mount) return false;
  if(mount.classList.contains('hidden')) return false;
  return mount.querySelector('[data-wb-section]') != null;
}

function formatDate(value){
  if(!value) return '';
  const ts = typeof value === 'number' ? value : Date.parse(value);
  if(Number.isNaN(ts)) return '';
  try{
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    return fmt.format(new Date(ts));
  }catch(_){
    return '';
  }
}

function contactName(row){
  const first = String(row.first || row.firstName || '').trim();
  const last = String(row.last || row.lastName || '').trim();
  if(first || last) return `${first} ${last}`.trim();
  return String(row.name || row.company || row.email || row.id || '').trim();
}

function partnerName(row){
  return String(row.name || row.company || row.email || row.id || '').trim();
}

async function fetchAllRows(){
  if(typeof window.openDB !== 'function' || typeof window.dbGetAll !== 'function'){
    return { contacts: [], partners: [] };
  }
  await window.openDB();
  const [contactsRaw, partnersRaw] = await Promise.all([
    window.dbGetAll('contacts').catch(()=>[]),
    window.dbGetAll('partners').catch(()=>[])
  ]);
  const contacts = Array.isArray(contactsRaw) ? contactsRaw.slice() : [];
  const partners = Array.isArray(partnersRaw) ? partnersRaw.slice() : [];
  contacts.sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
  partners.sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
  return { contacts, partners };
}

const CONTACT_COLUMNS = [
  { key: 'name', label: 'Name', value: contactName },
  { key: 'email', label: 'Email', value: row => String(row.email || '').trim() },
  { key: 'phone', label: 'Phone', value: row => String(row.phone || '').trim() },
  { key: 'stage', label: 'Stage', value: row => String(row.stage || row.status || '').trim() },
  { key: 'updated', label: 'Updated', value: row => formatDate(row.updatedAt || row.modifiedAt) }
];

const PARTNER_COLUMNS = [
  { key: 'name', label: 'Name', value: partnerName },
  { key: 'company', label: 'Company', value: row => String(row.company || '').trim() },
  { key: 'email', label: 'Email', value: row => String(row.email || '').trim() },
  { key: 'phone', label: 'Phone', value: row => String(row.phone || '').trim() },
  { key: 'tier', label: 'Tier', value: row => String(row.tier || row.partnerTier || '').trim() },
  { key: 'updated', label: 'Updated', value: row => formatDate(row.updatedAt) }
];

function buildTable(type, columns){
  const table = document.createElement('table');
  table.className = 'wb-table';
  table.setAttribute('data-selection-scope', type);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const selectTh = document.createElement('th');
  selectTh.style.width = '32px';
  headerRow.appendChild(selectTh);
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  const tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function toggleRow(row, type){
  if(!row) return;
  const id = row.getAttribute('data-id');
  if(!id) return;
  if(window.Selection && typeof window.Selection.toggle === 'function'){
    window.Selection.toggle(id, type);
  }else if(window.SelectionService && typeof window.SelectionService.toggle === 'function'){
    window.SelectionService.toggle(id, type);
  }else if(window.SelectionService && typeof window.SelectionService.add === 'function'){
    const hasSet = window.SelectionService.ids && typeof window.SelectionService.ids.has === 'function'
      ? window.SelectionService.ids.has(String(id))
      : false;
    let exists = hasSet;
    if(!exists && typeof window.SelectionService.getIds === 'function'){
      try{
        const ids = window.SelectionService.getIds();
        if(Array.isArray(ids)) exists = ids.map(String).includes(String(id));
      }catch(_){ exists = false; }
    }
    if(exists) window.SelectionService.remove(id);
    else window.SelectionService.add(id, type);
  }
}

function wireTable(table, type){
  if(!table || table.__wbWired) return;
  table.__wbWired = true;
  const body = table.tBodies[0];
  body.addEventListener('click', evt => {
    const cell = evt.target && evt.target.closest('td,th');
    if(cell && cell.closest('thead')) return;
    const row = evt.target && evt.target.closest('tr[data-id]');
    if(!row) return;
    if(evt.target && evt.target.closest('button,a')) return;
    evt.preventDefault();
    evt.stopPropagation();
    toggleRow(row, type);
  });
  body.addEventListener('change', evt => {
    const cb = evt.target && evt.target.closest('input[type="checkbox"][data-role="select"]');
    if(!cb) return;
    const row = cb.closest('tr[data-id]');
    if(!row) return;
    evt.preventDefault();
    evt.stopPropagation();
    toggleRow(row, type);
  });
}

function paintRows(table, rows, columns, type){
  if(!table) return;
  const body = table.tBodies[0];
  body.innerHTML = '';
  const list = Array.isArray(rows) ? rows : [];
  if(!list.length){
    const empty = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columns.length + 1;
    cell.textContent = 'No records yet.';
    cell.style.fontStyle = 'italic';
    cell.style.color = '#64748b';
    empty.appendChild(cell);
    body.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(row => {
    const tr = document.createElement('tr');
    const id = row && row.id != null ? String(row.id) : null;
    if(id) tr.setAttribute('data-id', id);
    const selectCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('data-role', 'select');
    checkbox.setAttribute('aria-label', 'Select row');
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    columns.forEach(col => {
      const td = document.createElement('td');
      let value;
      try{ value = col.value(row); }
      catch(_){ value = ''; }
      td.textContent = value == null ? '' : String(value);
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  body.appendChild(frag);
}

function syncSelectionState(){
  const selected = { ids: [], type: 'contacts' };
  if(window.Selection && typeof window.Selection.get === 'function'){
    const snap = window.Selection.get();
    if(snap && Array.isArray(snap.ids)){
      selected.ids = snap.ids.map(String);
      selected.type = snap.type || 'contacts';
    }
  }else if(window.SelectionService && typeof window.SelectionService.getIds === 'function'){
    selected.ids = Array.from(window.SelectionService.getIds() || []).map(String);
    selected.type = window.SelectionService.type || 'contacts';
  }
  const typeKey = selected.type || 'contacts';
  const idSet = new Set(selected.ids.map(String));
  Object.entries(tables).forEach(([scope, table]) => {
    if(!table) return;
    table.querySelectorAll('tbody tr[data-id]').forEach(row => {
      const id = row.getAttribute('data-id');
      const active = scope === typeKey && id && idSet.has(String(id));
      row.classList.toggle('is-selected', active);
      row.setAttribute('aria-selected', active ? 'true' : 'false');
      if(row.style){
        row.style.backgroundColor = active ? 'rgba(148, 163, 184, 0.18)' : '';
      }
      const cb = row.querySelector('input[type="checkbox"][data-role="select"]');
      if(cb && cb.checked !== active){
        cb.checked = active;
      }
    });
  });
}

function ensureSelectionListener(){
  if(selectionListener){
    document.removeEventListener('selection:changed', selectionListener);
  }
  selectionListener = () => syncSelectionState();
  document.addEventListener('selection:changed', selectionListener);
}

function createSection(label, type){
  const section = document.createElement('section');
  section.setAttribute('data-wb-section', type);
  section.style.marginTop = '16px';
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';
  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'baseline';
  titleWrap.style.gap = '12px';
  const heading = document.createElement('h3');
  heading.textContent = label;
  heading.style.margin = '0';
  heading.style.fontWeight = '600';
  const count = document.createElement('span');
  count.dataset.role = 'count';
  count.style.fontSize = '13px';
  count.style.color = '#64748b';
  titleWrap.appendChild(heading);
  titleWrap.appendChild(count);
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn';
  refreshBtn.textContent = 'Refresh';
  actions.appendChild(refreshBtn);
  head.appendChild(titleWrap);
  head.appendChild(actions);
  const body = document.createElement('div');
  body.className = 'wb-body';
  body.style.marginTop = '8px';
  section.appendChild(head);
  section.appendChild(body);
  return { section, body, refreshBtn, countEl: count };
}

async function renderData(mount, options){
  const { contacts, partners } = await fetchAllRows();
  paintRows(tables.contacts, contacts, CONTACT_COLUMNS, 'contacts');
  paintRows(tables.partners, partners, PARTNER_COLUMNS, 'partners');
  if(counts.contacts) counts.contacts.textContent = `${contacts.length} records`;
  if(counts.partners) counts.partners.textContent = `${partners.length} records`;
  syncSelectionState();
  return { contacts, partners };
}

function scheduleRefresh(){
  if(refreshScheduled) return;
  refreshScheduled = true;
  doubleRaf(() => {
    refreshScheduled = false;
    if(!isWorkbenchActive()) return;
    if(lastMount) renderData(lastMount, currentOptions);
  });
}

function attachDataListener(){
  if(dataListener){
    document.removeEventListener('app:data:changed', dataListener);
  }
  dataListener = () => {
    if(!isWorkbenchActive()) return;
    scheduleRefresh();
  };
  document.addEventListener('app:data:changed', dataListener);
}

export async function renderWorkbench(root, options = {}){
  const mount = root || ensureMount();
  if(!mount) return;
  currentOptions = options || {};
  mount.classList.remove('hidden');
  mount.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'wb-shell';
  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';
  shell.style.gap = '20px';

  const header = document.createElement('section');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.marginTop = '12px';
  const title = document.createElement('h2');
  title.textContent = 'Workbench';
  title.style.margin = '0';
  title.style.fontWeight = '700';
  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.gap = '8px';
  const refreshAll = document.createElement('button');
  refreshAll.type = 'button';
  refreshAll.className = 'btn';
  refreshAll.textContent = 'Refresh All';
  refreshAll.addEventListener('click', () => {
    if(lastMount) renderData(lastMount, currentOptions);
  });
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'btn brand';
  runBtn.textContent = 'Run Self-Test';
  if(typeof options.onRunSelfTest === 'function'){
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      runBtn.setAttribute('aria-busy', 'true');
      try{ await options.onRunSelfTest(); }
      catch(err){ console && console.error && console.error('[workbench] self-test failed', err); }
      finally{
        runBtn.removeAttribute('aria-busy');
        runBtn.disabled = false;
      }
    });
  }else{
    runBtn.disabled = true;
    runBtn.setAttribute('aria-disabled', 'true');
  }
  headerActions.appendChild(refreshAll);
  headerActions.appendChild(runBtn);
  header.appendChild(title);
  header.appendChild(headerActions);
  shell.appendChild(header);

  const contactsSection = createSection('Contacts', 'contacts');
  const contactsTable = buildTable('contacts', CONTACT_COLUMNS);
  contactsSection.body.appendChild(contactsTable);
  wireTable(contactsTable, 'contacts');
  contactsSection.refreshBtn.addEventListener('click', () => {
    if(lastMount) renderData(lastMount, currentOptions);
  });
  tables.contacts = contactsTable;
  counts.contacts = contactsSection.countEl;
  shell.appendChild(contactsSection.section);

  const partnersSection = createSection('Partners', 'partners');
  const partnersTable = buildTable('partners', PARTNER_COLUMNS);
  partnersSection.body.appendChild(partnersTable);
  wireTable(partnersTable, 'partners');
  partnersSection.refreshBtn.addEventListener('click', () => {
    if(lastMount) renderData(lastMount, currentOptions);
  });
  tables.partners = partnersTable;
  counts.partners = partnersSection.countEl;
  shell.appendChild(partnersSection.section);

  mount.appendChild(shell);
  ensureSelectionListener();
  attachDataListener();
  return renderData(mount, currentOptions);
}

export function initWorkbench(target, options = {}){
  const mount = target || ensureMount();
  if(!mount) return;
  mount.classList.remove('hidden');
  return renderWorkbench(mount, options);
}

if(typeof window !== 'undefined'){
  window.renderWorkbench = function(opts){
    const mount = lastMount && document.contains(lastMount) ? lastMount : ensureMount();
    return renderWorkbench(mount, opts || currentOptions);
  };
}

attachDataListener();
