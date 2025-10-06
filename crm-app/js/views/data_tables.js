export async function fetchContacts(opts = {}) {
  const { openDB, dbAllContacts } = await import('../db.js');
  await openDB();
  const rows = await dbAllContacts();
  return Array.isArray(rows) ? rows : [];
}

export async function fetchPartners(opts = {}) {
  const { openDB, dbAllPartners } = await import('../db.js');
  await openDB();
  const rows = await dbAllPartners();
  return Array.isArray(rows) ? rows : [];
}

function el(html){
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function rowCheckboxCell(id){
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('data-id', String(id));
  input.setAttribute('data-role', 'select');
  input.setAttribute('aria-label', 'select row');
  td.appendChild(input);
  return td;
}

function textCell(value){
  const td = document.createElement('td');
  td.textContent = value;
  return td;
}

function safeText(value){
  return value == null ? '' : String(value);
}

export function renderContactsTable(rows){
  const table = el(`
    <table class="wb-table" data-table="contacts" data-selection-scope="contacts">
      <thead>
        <tr>
          <th style="width:32px;"></th>
          <th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Stage</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `);
  const tb = table.querySelector('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const id = r.id || r.contactId || '';
    tr.setAttribute('data-id', id);

    const name = [safeText(r.firstName), safeText(r.lastName)].filter(Boolean).join(' ');

    tr.appendChild(rowCheckboxCell(id));
    tr.appendChild(textCell(name));
    tr.appendChild(textCell(safeText(r.email)));
    tr.appendChild(textCell(safeText(r.phone)));
    tr.appendChild(textCell(safeText(r.status)));
    tr.appendChild(textCell(safeText(r.stage)));
    tb.appendChild(tr);
  });
  return table;
}

export function renderPartnersTable(rows){
  const table = el(`
    <table class="wb-table" data-table="partners" data-selection-scope="partners">
      <thead>
        <tr>
          <th style="width:32px;"></th>
          <th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Tier</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `);
  const tb = table.querySelector('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const id = r.id || r.partnerId || '';
    tr.setAttribute('data-id', id);

    tr.appendChild(rowCheckboxCell(id));
    tr.appendChild(textCell(safeText(r.name)));
    tr.appendChild(textCell(safeText(r.company)));
    tr.appendChild(textCell(safeText(r.email)));
    tr.appendChild(textCell(safeText(r.phone)));
    tr.appendChild(textCell(safeText(r.tier)));
    tb.appendChild(tr);
  });
  return table;
}

export function wireSelection(table, type='contacts'){
  try{
    const { Selection } = window;
    if (!Selection || typeof Selection.syncChecks!=='function') return;
    table.addEventListener('change', evt => {
      const cb = evt.target && evt.target.closest('input[type="checkbox"][data-id]');
      if(!cb) return;
      const id = cb.getAttribute('data-id');
      if(cb.checked) Selection.add(id, type); else Selection.remove(id, type);
    });
    Selection.syncChecks();
  }catch(_){ }
}
