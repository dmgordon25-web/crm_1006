import { Templates } from '../email/templates_store.js';
import { compile, sampleData } from '../email/merge_vars.js';

function createTextarea() {
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '120px';
  return textarea;
}

export function renderEmailTemplates(root) {
  if (!root) return;
  root.innerHTML = `
    <section data-emailtpl role="region" aria-label="Email Templates">
      <header style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Email Templates</h3>
        <div>
          <button data-act="new">New</button>
          <button data-act="import">Import</button>
          <button data-act="export">Export</button>
        </div>
      </header>
      <div style="display:grid;grid-template-columns:320px 1fr;gap:16px;margin-top:12px;">
        <div class="list" style="border-right:1px solid rgba(0,0,0,0.06);padding-right:12px;"></div>
        <div class="editor"></div>
      </div>
    </section>
  `;

  const list = root.querySelector('.list');
  const editor = root.querySelector('.editor');

  function paintList(state) {
    const wrapper = document.createElement('div');
    state.items.forEach((item) => {
      const row = document.createElement('div');
      row.style.padding = '8px';
      row.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.gap = '8px';

      const openButton = document.createElement('button');
      openButton.dataset.id = item.id;
      openButton.dataset.act = 'open';
      openButton.style.flex = '1';
      openButton.style.textAlign = 'left';
      openButton.textContent = item.name || 'Untitled';

      const favButton = document.createElement('button');
      favButton.title = 'favorite';
      favButton.dataset.id = item.id;
      favButton.dataset.act = 'fav';
      favButton.textContent = item.fav ? '★' : '☆';

      const deleteButton = document.createElement('button');
      deleteButton.title = 'delete';
      deleteButton.dataset.id = item.id;
      deleteButton.dataset.act = 'del';
      deleteButton.textContent = '×';

      row.append(openButton, favButton, deleteButton);
      wrapper.appendChild(row);
    });
    list.replaceChildren(wrapper);
  }

  function paintEditor(record) {
    if (!record) {
      editor.innerHTML = '<div role="note">Select or create a template.</div>';
      editor.dataset.id = '';
      return;
    }
    editor.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateRows = 'auto auto 1fr auto';
    grid.style.gap = '8px';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.dataset.field = 'name';
    nameInput.placeholder = 'Name';
    nameInput.value = record.name || '';

    const subjectInput = document.createElement('input');
    subjectInput.type = 'text';
    subjectInput.dataset.field = 'subject';
    subjectInput.placeholder = 'Subject (supports {{vars}})';
    subjectInput.value = record.subject || '';

    const bodyWrapper = document.createElement('div');
    bodyWrapper.dataset.field = 'body';
    const textarea = createTextarea();
    textarea.value = record.body || '';
    bodyWrapper.appendChild(textarea);

    const controls = document.createElement('div');
    const saveButton = document.createElement('button');
    saveButton.dataset.act = 'save';
    saveButton.textContent = 'Save';
    const previewButton = document.createElement('button');
    previewButton.dataset.act = 'preview';
    previewButton.textContent = 'Preview';
    controls.append(saveButton, previewButton);

    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.style.marginTop = '8px';
    preview.style.borderTop = '1px solid rgba(0,0,0,0.06)';
    preview.style.paddingTop = '8px';

    grid.append(nameInput, subjectInput, bodyWrapper, controls, preview);
    editor.appendChild(grid);
    editor.dataset.id = record.id;
  }

  let currentId = null;
  const unsubscribe = Templates.subscribe((state) => {
    paintList(state);
    if (currentId) {
      const record = Templates.get(currentId);
      if (record) {
        paintEditor(record);
      } else {
        currentId = null;
        paintEditor(null);
      }
    }
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.act;
    if (action === 'open') {
      currentId = id;
      paintEditor(Templates.get(id));
    }
    if (action === 'del') {
      if (confirm('Delete template?')) {
        Templates.remove(id);
        if (currentId === id) {
          currentId = null;
          paintEditor(null);
        }
      }
    }
    if (action === 'fav') {
      const record = Templates.get(id);
      Templates.markFav(id, !(record && record.fav));
    }
  });

  editor.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.act;
    if (action === 'save') {
      const id = editor.dataset.id || null;
      const name = editor.querySelector('[data-field="name"]').value.trim();
      const subject = editor.querySelector('[data-field="subject"]').value;
      const body = editor.querySelector('[data-field="body"] textarea').value;
      const record = Templates.upsert({ id, name, subject, body });
      currentId = record.id;
      try {
        const { Notifier } = await import('../notifications/notifier.js');
        if (Notifier && typeof Notifier.push === 'function') {
          Notifier.push({ type: 'templates', title: 'Template saved' });
        }
      } catch {}
    }
    if (action === 'preview') {
      const data = await sampleData();
      const subject = editor.querySelector('[data-field="subject"]').value;
      const body = editor.querySelector('[data-field="body"] textarea').value;
      const preview = editor.querySelector('.preview');
      if (!preview) return;
      preview.innerHTML = '';
      const subjectRow = document.createElement('div');
      const subjectLabel = document.createElement('strong');
      subjectLabel.textContent = 'Subject:';
      subjectRow.append(subjectLabel, document.createTextNode(` ${compile(subject, data)}`));
      const bodyRow = document.createElement('div');
      bodyRow.style.whiteSpace = 'pre-wrap';
      bodyRow.style.marginTop = '8px';
      bodyRow.textContent = compile(body, data);
      preview.append(subjectRow, bodyRow);
    }
  });

  root.querySelector('[data-act="new"]').addEventListener('click', () => {
    const record = Templates.upsert({ name: 'Untitled', subject: '', body: '' });
    currentId = record.id;
    paintEditor(record);
  });

  root.querySelector('[data-act="import"]').addEventListener('click', async () => {
    const json = prompt('Paste templates JSON:');
    if (!json) return;
    if (!Templates.importJSON(json)) {
      alert('Import failed. Please check the JSON payload.');
    }
  });

  root.querySelector('[data-act="export"]').addEventListener('click', () => {
    const blob = new Blob([Templates.exportJSON()], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'email_templates.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  });

  paintEditor(null);

  root.addEventListener('DOMNodeRemovedFromDocument', () => unsubscribe(), { once: true });
}

export function initEmailTemplates() {
  const mount = document.getElementById('app-main')
    || document.getElementById('root')
    || document.body;
  renderEmailTemplates(mount);
}

export function render(targetEl) {
  renderEmailTemplates(targetEl);
}
