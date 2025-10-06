export const __esModule = true;
(() => {
  const MODULE_KEY = 'patch_2025_10_02_medium_nice';
  if (!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if (window.__INIT_FLAGS__[MODULE_KEY]) return;
  window.__INIT_FLAGS__[MODULE_KEY] = true;
  const PATCH_PATH = '/js/patch_2025-10-02_medium_nice.js';
  if (Array.isArray(window.__PATCHES_LOADED__) && !window.__PATCHES_LOADED__.includes(PATCH_PATH)) {
    window.__PATCHES_LOADED__.push(PATCH_PATH);
  }

  const TAG = '[patch:2025-10-02-medium-nice]';
  const WIDGET_HOST_SEL = ['#dashboard-widgets', '[data-dash="widgets"]', '#widgets-grid', 'section.widgets'];
  const ACTIONABLE_SELECTOR = 'button:not([disabled]),input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[role="button"],[data-action]';
  const PROFILE_KEY = 'profile:v1';
  const SIGNATURE_KEY = 'signature:v1';
  const LAYOUT_KEY = 'dash:widgets:v1';
  const microtask = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn) => Promise.resolve().then(fn);

  function warn(...args) {
    try { console.warn(TAG, ...args); }
    catch (_err) { /* noop */ }
  }

  function firstExisting(selectors) {
    if (!Array.isArray(selectors)) return null;
    for (const sel of selectors) {
      if (!sel) continue;
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  }

  function doubleRAF(fn) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { fn(); }
        catch (err) { warn(err); }
      }));
      return;
    }
    setTimeout(() => {
      try { fn(); }
      catch (err) { warn(err); }
    }, 16);
  }

  function debounce(fn, wait) {
    let timer = null;
    let lastArgs = [];
    const debounced = function (...args) {
      lastArgs = args;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try { fn.apply(this, lastArgs); }
        catch (err) { warn(err); }
      }, wait);
    };
    debounced.flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      try { fn.apply(null, lastArgs); }
      catch (err) { warn(err); }
    };
    debounced.cancel = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  }

  function safeEl(el, fn) {
    if (!el) return;
    try { fn(el); }
    catch (err) { warn(err); }
  }

  function hideIfEmpty(selectors) {
    if (!Array.isArray(selectors)) return;
    selectors.forEach(sel => {
      if (!sel) return;
      document.querySelectorAll(sel).forEach(node => {
        if (!node || node.__mnHidden) return;
        const actionable = node.querySelector(ACTIONABLE_SELECTOR);
        if (actionable) return;
        hide(node);
        node.__mnHidden = true;
      });
    });
  }

  function readProfileLocal() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_err) {
      return null;
    }
  }

  function readSignatureLocal() {
    try {
      const raw = localStorage.getItem(SIGNATURE_KEY);
      return typeof raw === 'string' ? raw : '';
    } catch (_err) {
      return '';
    }
  }

  function installDataChangedMonitor() {
    let last = 0;
    document.addEventListener('app:data:changed', () => {
      const now = Date.now();
      if (last && now - last < 100) {
        warn('Multiple app:data:changed events detected within 100ms');
      }
      last = now;
    }, true);
  }

  function ensureWidgetDnD() {
    const host = firstExisting(WIDGET_HOST_SEL);
    if (!host || host.__mnDnDWired) return;
    host.__mnDnDWired = true;

    const tiles = () => Array.from(host.children || []).filter(node => node && node.nodeType === 1);

    function ensureKey(tile) {
      if (!tile) return '';
      if (tile.dataset && tile.dataset.widgetKey) return tile.dataset.widgetKey;
      const rawId = tile.getAttribute('data-widget')
        || tile.getAttribute('data-tile')
        || tile.getAttribute('id')
        || (tile.querySelector('h2,h3,h4,strong,[data-title]')?.textContent || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .slice(0, 40);
      const key = rawId && rawId.length ? rawId : `widget-${Math.random().toString(36).slice(2, 10)}`;
      if (tile.dataset) tile.dataset.widgetKey = key;
      return key;
    }

    function readOrder() {
      try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (_err) {
        return [];
      }
    }

    function writeOrder(order) {
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(order)); }
      catch (_err) { /* noop */ }
    }

    function applySavedOrder() {
      const saved = readOrder();
      if (!saved.length) return;
      const list = tiles();
      if (!list.length) return;
      const map = new Map();
      list.forEach(tile => map.set(ensureKey(tile), tile));
      const handled = new Set();
      saved.forEach(id => {
        const tile = map.get(id);
        if (tile) {
          handled.add(tile);
          host.appendChild(tile);
        }
      });
      list.forEach(tile => {
        if (handled.has(tile)) return;
        host.appendChild(tile);
      });
    }

    tiles().forEach(tile => {
      ensureKey(tile);
      try { tile.setAttribute('draggable', 'true'); }
      catch (_err) { /* noop */ }
    });

    doubleRAF(applySavedOrder);

    const persist = debounce(() => {
      const order = tiles().map(tile => ensureKey(tile));
      writeOrder(order);
    }, 200);

    let dragTile = null;
    let sessionActive = false;
    let sessionDirty = false;
    let sessionEmitted = false;

    function tileFromEvent(target) {
      if (!target) return null;
      const candidate = target.closest('[data-widget],[data-tile],section,article,.card,li');
      if (!candidate) return null;
      return candidate.parentElement === host ? candidate : null;
    }

    host.addEventListener('dragstart', (evt) => {
      const tile = tileFromEvent(evt.target);
      if (!tile) return;
      dragTile = tile;
      sessionActive = true;
      sessionDirty = false;
      sessionEmitted = false;
      persist.cancel();
      evt.dataTransfer?.setData('text/plain', ensureKey(tile));
      evt.dataTransfer?.setDragImage?.(tile, 10, 10);
      tile.classList.add('is-dragging');
    });

    host.addEventListener('dragover', (evt) => {
      if (!dragTile) return;
      const overTile = tileFromEvent(evt.target);
      if (!overTile || overTile === dragTile) {
        evt.preventDefault();
        return;
      }
      evt.preventDefault();
      const rect = overTile.getBoundingClientRect();
      const before = (evt.clientY - rect.top) < rect.height / 2;
      if (before) {
        host.insertBefore(dragTile, overTile);
      } else {
        host.insertBefore(dragTile, overTile.nextSibling);
      }
      sessionDirty = true;
    });

    host.addEventListener('drop', (evt) => {
      if (!dragTile) return;
      evt.preventDefault();
      sessionDirty = true;
      persist();
    });

    function dispatchChange(detail) {
      const payload = detail || { source: 'dashboard:widgets', action: 'reorder' };
      if (typeof window.dispatchAppDataChanged === 'function') {
        window.dispatchAppDataChanged(payload);
      } else {
        document.dispatchEvent(new CustomEvent('app:data:changed', { detail: payload }));
      }
    }

    host.addEventListener('dragend', () => {
      if (dragTile) dragTile.classList.remove('is-dragging');
      dragTile = null;
      persist.flush();
      if (sessionActive && sessionDirty && !sessionEmitted) {
        sessionEmitted = true;
        dispatchChange({ source: 'dashboard:widgets', action: 'reorder' });
      }
      sessionActive = false;
      sessionDirty = false;
    });
  }

  function normalizeWidgetVisibility() {
    const list = document.getElementById('dashboard-widget-list');
    if (!list) return;
    const card = list.closest('.card');
    if (!card || card.__mnAligned) return;
    card.__mnAligned = true;
    card.setAttribute('data-align', 'normal');
    safeEl(list, node => {
      if (!node.style.display) node.style.display = 'grid';
      if (!node.style.gap) node.style.gap = '6px';
    });
  }

  function hideFocusModeCard() {
    const cards = document.querySelectorAll('#view-settings .settings-panel[data-panel="dashboard"] .card');
    cards.forEach(card => {
      if (!card || card.__mnFocusChecked) return;
      const heading = card.querySelector('h2,h3,h4,strong');
      if (!heading) return;
      if (/focus\s*mode/i.test(heading.textContent || '')) {
        card.__mnFocusChecked = true;
        const actionable = card.querySelector(ACTIONABLE_SELECTOR);
        if (!actionable) hide(card);
      }
    });
    hideIfEmpty(['#focus-mode', '.focus-mode', '[data-panel="focus-mode"]']);
  }

  function applyDashboardTweaks() {
    normalizeWidgetVisibility();
    hideFocusModeCard();
  }

  function activateSettingsView() {
    const settingsMain = document.getElementById('view-settings');
    if (settingsMain && !settingsMain.classList.contains('hidden')) return;
    const trigger = document.getElementById('btn-open-settings')
      || document.querySelector('#main-nav button[data-nav="settings"]');
    if (trigger && typeof trigger.click === 'function') {
      trigger.click();
      return;
    }
    if (settingsMain) {
      const views = document.querySelectorAll('main[id^="view-"]');
      views.forEach(view => {
        view.classList.toggle('hidden', view !== settingsMain);
      });
    }
  }

  function showSettingsPanel(panel) {
    const nav = document.getElementById('settings-nav');
    if (nav) {
      Array.from(nav.querySelectorAll('button[data-panel]')).forEach(btn => {
        const target = btn.getAttribute('data-panel');
        btn.classList.toggle('active', target === panel);
      });
    }
    const panels = document.querySelectorAll('#view-settings .settings-panel');
    panels.forEach(section => {
      const target = section.getAttribute('data-panel');
      const active = target === panel;
      section.classList.toggle('active', active);
      if (active) section.removeAttribute('hidden');
    });
  }

  function updateHash(hash) {
    if (!hash) return;
    try {
      if (history && typeof history.replaceState === 'function') {
        history.replaceState(null, '', hash);
      } else {
        window.location.hash = hash;
      }
    } catch (_err) {
      window.location.hash = hash;
    }
  }

  function openSettingsPanel(panel, hash) {
    activateSettingsView();
    doubleRAF(() => {
      showSettingsPanel(panel);
      updateHash(hash);
    });
  }

  function applyProfileLocal() {
    const profile = readProfileLocal();
    const signature = readSignatureLocal();
    if (!profile && !signature) return;
    doubleRAF(() => {
      const nameInput = document.getElementById('lo-name');
      const emailInput = document.getElementById('lo-email');
      const phoneInput = document.getElementById('lo-phone');
      const signatureInput = document.getElementById('lo-signature');
      if (profile) {
        if (nameInput && !nameInput.matches(':focus')) nameInput.value = profile.name || '';
        if (emailInput && !emailInput.matches(':focus')) emailInput.value = profile.email || '';
        if (phoneInput && !phoneInput.matches(':focus')) phoneInput.value = profile.phone || '';
      }
      if (signatureInput && !signatureInput.matches(':focus')) {
        signatureInput.value = signature || (profile && profile.signature) || signatureInput.value;
      }
    });
  }

  function setupProfileLink() {
    const chip = document.getElementById('lo-profile-chip');
    if (!chip || chip.__mnProfileNav) return;
    chip.__mnProfileNav = true;
    chip.setAttribute('role', 'button');
    chip.style.cursor = chip.style.cursor || 'pointer';
    chip.addEventListener('click', (evt) => {
      evt.preventDefault();
      openSettingsPanel('profile', '#settings/profiles');
      applyProfileLocal();
    });
  }

  function normalizeValueForChoice(value) {
    if (value == null) return { meaningful: false, tokens: 0, length: 0, text: '' };
    let text;
    if (Array.isArray(value)) {
      text = value.map(item => String(item || '')).join(' ');
    } else if (typeof value === 'object') {
      if (value && typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        text = String(value);
      } else {
        try { text = JSON.stringify(value); }
        catch (_err) { text = ''; }
      }
    } else {
      text = String(value);
    }
    const trimmed = (text || '').trim();
    const tokens = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    return {
      meaningful: !!trimmed,
      tokens,
      length: trimmed.length,
      text: trimmed
    };
  }

  function chooseDefaultValue(valueA, valueB, contacts) {
    const normA = normalizeValueForChoice(valueA);
    const normB = normalizeValueForChoice(valueB);
    if (!normA.meaningful && !normB.meaningful) return 'A';
    if (normA.meaningful && !normB.meaningful) return 'A';
    if (normB.meaningful && !normA.meaningful) return 'B';
    if (normA.tokens !== normB.tokens) return normA.tokens > normB.tokens ? 'A' : 'B';
    if (normA.length !== normB.length) return normA.length > normB.length ? 'A' : 'B';
    const updatedA = Number(contacts[0]?.updatedAt || 0);
    const updatedB = Number(contacts[1]?.updatedAt || 0);
    if (updatedA !== updatedB) return updatedA >= updatedB ? 'A' : 'B';
    return 'A';
  }

  function formatFieldValue(value) {
    if (value == null) return '—';
    if (Array.isArray(value)) return value.map(item => String(item || '')).join(', ') || '—';
    if (typeof value === 'object') {
      if (value && typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        return String(value);
      }
      try {
        return JSON.stringify(value);
      } catch (_err) {
        return '—';
      }
    }
    const text = String(value).trim();
    return text || '—';
  }

  function displayName(contact) {
    if (!contact) return 'Contact';
    const parts = [contact.first, contact.last].map(part => String(part || '').trim()).filter(Boolean);
    if (parts.length) return parts.join(' ');
    return String(contact.displayName || contact.name || contact.email || contact.phone || 'Contact');
  }

  function ensureMergeModule() {
    if (window.__CONTACT_MERGE_TEST__) return Promise.resolve(window.__CONTACT_MERGE_TEST__);
    return import('/js/patch_2025-09-27_merge_ui.js')
      .catch(() => null)
      .then(() => window.__CONTACT_MERGE_TEST__ || null);
  }

  function focusTrap(container) {
    const selector = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    function list() {
      return Array.from(container.querySelectorAll(selector)).filter(el => el.offsetParent !== null);
    }
    function handle(evt) {
      if (evt.key !== 'Tab') return;
      const items = list();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (evt.shiftKey) {
        if (document.activeElement === first) {
          evt.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          evt.preventDefault();
          first.focus();
        }
      }
    }
    container.addEventListener('keydown', handle);
    return () => container.removeEventListener('keydown', handle);
  }

  function setupMergeChooser() {
    const legacy = typeof window.mergeContactsWithIds === 'function' ? window.mergeContactsWithIds : null;

    async function openMergeChooser(ids) {
      try {
        const list = Array.isArray(ids) ? ids.slice(0, 2).map(id => String(id)) : [];
        if (list.length !== 2 || list[0] === list[1]) {
          if (typeof window.toast === 'function') window.toast('Select exactly two contacts to merge.');
          return;
        }
        const kit = await ensureMergeModule();
        if (!kit) {
          if (legacy) return legacy(ids);
          warn('merge kit unavailable');
          return;
        }
        if (typeof openDB === 'function') {
          try { await openDB(); }
          catch (_err) { /* noop */ }
        }
        const [first, second] = await Promise.all([
          typeof dbGet === 'function' ? dbGet('contacts', list[0]) : null,
          typeof dbGet === 'function' ? dbGet('contacts', list[1]) : null
        ]);
        if (!first || !second) {
          if (typeof window.toast === 'function') window.toast('Unable to load both contacts.');
          return;
        }
        const contacts = [kit.cloneContact(first), kit.cloneContact(second)];
        const state = kit.createState ? kit.createState(contacts, {
          dialog: { close() {}, removeAttribute() {}, style: {} },
          nodes: { confirm: { disabled: false } }
        }) : null;
        if (!state) {
          if (legacy) return legacy(ids);
          warn('merge state unavailable');
          return;
        }
        state.dialog = state.dialog || { close() {}, removeAttribute() {}, style: {} };
        state.nodes = state.nodes || {};
        state.nodes.confirm = state.nodes.confirm || { disabled: false };
        state.nodes.error = null;
        state.manual = state.manual instanceof Set ? state.manual : new Set();
        state.selections = state.selections instanceof Map ? state.selections : new Map();

        const fields = Array.isArray(state.fields) ? state.fields.filter(field => !field.hidden) : [];
        if (!fields.length) {
          if (legacy) return legacy(ids);
          warn('no merge fields available');
          return;
        }

        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(15, 23, 42, 0.45)';
        overlay.style.backdropFilter = 'blur(2px)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '2147483646';
        overlay.style.padding = '24px';

        const modal = document.createElement('div');
        modal.style.background = '#ffffff';
        modal.style.borderRadius = '14px';
        modal.style.maxWidth = '960px';
        modal.style.width = '100%';
        modal.style.boxShadow = '0 24px 48px rgba(15, 23, 42, 0.24)';
        modal.style.padding = '20px 24px 18px';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.maxHeight = '90vh';
        modal.style.overflow = 'hidden';
        modal.tabIndex = -1;

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '12px';

        const title = document.createElement('h2');
        title.textContent = 'Merge Contacts';
        title.style.margin = '0';
        title.style.fontSize = '20px';
        title.style.color = '#0f172a';
        title.className = 'grow';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn';
        closeBtn.textContent = 'Close';

        header.appendChild(title);
        header.appendChild(closeBtn);

        const summary = document.createElement('div');
        summary.style.display = 'flex';
        summary.style.flexWrap = 'wrap';
        summary.style.gap = '12px';
        summary.style.marginTop = '12px';
        summary.style.alignItems = 'center';

        function createChip(label, value) {
          const chip = document.createElement('div');
          chip.style.display = 'flex';
          chip.style.flexDirection = 'column';
          chip.style.padding = '8px 12px';
          chip.style.borderRadius = '10px';
          chip.style.background = 'rgba(226,232,240,0.5)';
          const span = document.createElement('span');
          span.style.fontSize = '11px';
          span.style.textTransform = 'uppercase';
          span.style.letterSpacing = '0.04em';
          span.style.color = '#475569';
          span.textContent = label;
          const strong = document.createElement('strong');
          strong.style.fontSize = '15px';
          strong.style.color = '#0f172a';
          strong.textContent = value || '—';
          chip.appendChild(span);
          chip.appendChild(strong);
          return chip;
        }

        summary.appendChild(createChip('Record A', displayName(state.contacts[0])));
        summary.appendChild(createChip('Record B', displayName(state.contacts[1])));

        const keepRow = document.createElement('div');
        keepRow.style.display = 'flex';
        keepRow.style.gap = '12px';
        keepRow.style.alignItems = 'center';
        keepRow.style.marginTop = '8px';

        const keepLabel = document.createElement('strong');
        keepLabel.textContent = 'Keep record:';
        keepLabel.style.fontSize = '13px';
        keepLabel.style.color = '#0f172a';

        const keepA = document.createElement('label');
        keepA.style.display = 'flex';
        keepA.style.alignItems = 'center';
        keepA.style.gap = '6px';
        const keepARadio = document.createElement('input');
        keepARadio.type = 'radio';
        keepARadio.name = 'merge-keep';
        keepARadio.value = 'A';
        const keepAText = document.createElement('span');
        keepAText.textContent = displayName(state.contacts[0]);
        keepA.appendChild(keepARadio);
        keepA.appendChild(keepAText);

        const keepB = document.createElement('label');
        keepB.style.display = 'flex';
        keepB.style.alignItems = 'center';
        keepB.style.gap = '6px';
        const keepBRadio = document.createElement('input');
        keepBRadio.type = 'radio';
        keepBRadio.name = 'merge-keep';
        keepBRadio.value = 'B';
        const keepBText = document.createElement('span');
        keepBText.textContent = displayName(state.contacts[1]);
        keepB.appendChild(keepBRadio);
        keepB.appendChild(keepBText);

        keepRow.appendChild(keepLabel);
        keepRow.appendChild(keepA);
        keepRow.appendChild(keepB);

        const content = document.createElement('div');
        content.style.marginTop = '16px';
        content.style.paddingRight = '8px';
        content.style.overflowY = 'auto';
        content.style.flex = '1 1 auto';

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '180px 1fr 1fr';
        grid.style.columnGap = '12px';
        grid.style.rowGap = '6px';

        function createOption(side, field, rawValue, checked) {
          const wrap = document.createElement('label');
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'flex-start';
          wrap.style.gap = '8px';
          wrap.style.padding = '8px 0';
          wrap.style.borderBottom = '1px solid #e2e8f0';
          wrap.dataset.side = side;
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `merge-field-${field.key}`;
          input.value = side;
          if (checked) input.checked = true;
          const value = document.createElement('div');
          value.style.whiteSpace = 'pre-wrap';
          value.style.fontSize = '13px';
          value.style.color = '#0f172a';
          value.textContent = formatFieldValue(rawValue);
          wrap.appendChild(input);
          wrap.appendChild(value);
          return wrap;
        }

        const fieldMeta = [];
        fields.forEach(field => {
          const label = document.createElement('div');
          label.style.fontWeight = '600';
          label.style.fontSize = '13px';
          label.style.color = '#0f172a';
          label.style.padding = '8px 0';
          label.style.borderBottom = '1px solid #e2e8f0';
          label.textContent = field.label || field.key;

          const valueA = kit.getFieldValue ? kit.getFieldValue(state.contacts[0], field) : state.contacts[0][field.key];
          const valueB = kit.getFieldValue ? kit.getFieldValue(state.contacts[1], field) : state.contacts[1][field.key];
          const defaultChoice = chooseDefaultValue(valueA, valueB, state.contacts);
          const optionA = createOption('A', field, valueA, defaultChoice === 'A');
          const optionB = createOption('B', field, valueB, defaultChoice === 'B');

          grid.appendChild(label);
          grid.appendChild(optionA);
          grid.appendChild(optionB);

          fieldMeta.push({ field, optionA, optionB });
        });

        content.appendChild(grid);

        const status = document.createElement('div');
        status.style.minHeight = '18px';
        status.style.marginTop = '12px';
        status.style.fontSize = '13px';
        status.style.color = '#b91c1c';

        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '12px';
        footer.style.marginTop = '16px';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        const mergeBtn = document.createElement('button');
        mergeBtn.type = 'button';
        mergeBtn.className = 'btn brand';
        mergeBtn.textContent = 'Merge';

        footer.appendChild(cancelBtn);
        footer.appendChild(mergeBtn);

        modal.appendChild(header);
        modal.appendChild(summary);
        modal.appendChild(keepRow);
        modal.appendChild(content);
        modal.appendChild(status);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        modal.focus();

        const releaseTrap = focusTrap(modal);
        let closed = false;

        function closeModal(reason) {
          if (closed) return;
          closed = true;
          if (releaseTrap) releaseTrap();
          document.removeEventListener('keydown', onKeyDown);
          overlay.remove();
          if (previousFocus && typeof previousFocus.focus === 'function') {
            try { previousFocus.focus(); }
            catch (_err) { /* noop */ }
          }
          if (reason === 'merged') {
            microtask(() => {
              document.dispatchEvent(new CustomEvent('selection:changed', { detail: { type: 'contacts', ids: [] } }));
            });
          }
        }

        function onKeyDown(evt) {
          if (evt.key === 'Escape') {
            evt.preventDefault();
            closeModal('esc');
          }
        }

        document.addEventListener('keydown', onKeyDown);

        const defaultBase = typeof state.baseIndex === 'number' ? state.baseIndex : 0;
        if (defaultBase === 0) keepARadio.checked = true; else keepBRadio.checked = true;

        function updateColumnState() {
          fieldMeta.forEach(meta => {
            const activeSide = (keepARadio.checked ? 'A' : 'B');
            meta.optionA.dataset.keep = activeSide === 'A' ? 'true' : 'false';
            meta.optionB.dataset.keep = activeSide === 'B' ? 'true' : 'false';
          });
        }

        keepARadio.addEventListener('change', updateColumnState);
        keepBRadio.addEventListener('change', updateColumnState);
        updateColumnState();

        closeBtn.addEventListener('click', () => closeModal('close'));
        cancelBtn.addEventListener('click', () => closeModal('cancel'));

        async function performMerge() {
          mergeBtn.disabled = true;
          status.textContent = '';
          try {
            if (state.selections && typeof state.selections.clear === 'function') state.selections.clear();
            else state.selections = new Map();
            if (state.manual && typeof state.manual.clear === 'function') state.manual.clear();
            else state.manual = new Set();

            fieldMeta.forEach(meta => {
              const input = modal.querySelector(`input[name="merge-field-${meta.field.key}"]:checked`);
              const choice = input && input.value === 'B' ? 'B' : 'A';
              state.selections.set(meta.field.key, { source: choice });
              state.manual.add(meta.field.key);
            });

            const keepChoice = modal.querySelector('input[name="merge-keep"]:checked');
            state.baseIndex = keepChoice && keepChoice.value === 'B' ? 1 : 0;
            state.dialog.close = () => closeModal('merged');
            state.dialog.removeAttribute = () => {};
            state.nodes.confirm = mergeBtn;
            state.nodes.error = null;
            await kit.executeMerge(state);
            closeModal('merged');
          } catch (err) {
            mergeBtn.disabled = false;
            status.textContent = err && err.message ? err.message : 'Merge failed';
            warn('merge chooser error', err);
          }
        }

        mergeBtn.addEventListener('click', performMerge);
      } catch (err) {
        warn('merge chooser launch failed', err);
        if (legacy) return legacy(ids);
      }
    }

    window.openMergeChooser = openMergeChooser;
    window.mergeContactsWithIds = async function (ids) {
      return openMergeChooser(ids);
    };
    if (legacy && legacy.__linkedRollupWrapped) {
      window.mergeContactsWithIds.__linkedRollupWrapped = true;
    }
  }

  installDataChangedMonitor();
  setupMergeChooser();

  function init() {
    ensureWidgetDnD();
    applyDashboardTweaks();
    setupProfileLink();
    applyProfileLocal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function') {
    try {
      window.RenderGuard.registerHook(() => {
        ensureWidgetDnD();
        applyDashboardTweaks();
        setupProfileLink();
        applyProfileLocal();
      });
    } catch (err) {
      warn(err);
    }
  }
})();
