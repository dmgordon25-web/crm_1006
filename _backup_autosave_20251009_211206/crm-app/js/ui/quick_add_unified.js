/* eslint-disable no-console */
import { STR, text } from './strings.js';

function translate(key, fallback) {
  try {
    if (typeof text === 'function') {
      const value = text(key);
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  } catch (_error) {
    // fall through to STR lookup
  }
  const viaStr = STR && typeof STR[key] === 'string' ? STR[key] : null;
  if (viaStr && viaStr.trim()) {
    return viaStr;
  }
  return fallback;
}

function buildCopy() {
  return {
    modalTitle: translate('modal.add-contact.title', 'Quick Add'),
    closeLabel: translate('general.close', 'Close'),
    contactTab: translate('general.contact', 'Contact'),
    partnerTab: translate('general.partner', 'Partner'),
    firstName: translate('field.first-name', 'First Name'),
    lastName: translate('field.last-name', 'Last Name'),
    email: translate('field.email', 'Email'),
    phone: translate('field.phone', 'Phone'),
    company: translate('general.partner', 'Company'),
    partnerContact: translate('general.contact', 'Primary Contact'),
    cancel: translate('general.close', 'Cancel'),
    contactSave: translate('modal.add-contact.submit', 'Save Contact'),
    partnerSave: translate('general.save', 'Save Partner'),
  };
}

export function wireQuickAddUnified() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  if (window.__WIRED_QUICK_ADD_UNIFIED__) return;
  window.__WIRED_QUICK_ADD_UNIFIED__ = true;

  const copy = buildCopy();

  function html() {
    return `
<div class="qa-overlay" role="dialog" aria-modal="true" style="position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9999;display:flex;align-items:center;justify-content:center;">
  <div class="qa-modal" style="background:#fff;min-width:560px;max-width:720px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
    <div class="qa-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eee;">
      <div style="font-size:18px;font-weight:600;">${copy.modalTitle}</div>
      <button type="button" class="qa-close" aria-label="${copy.closeLabel}" style="border:none;background:transparent;font-size:20px;cursor:pointer;">×</button>
    </div>
    <div class="qa-tabs" style="display:flex;gap:8px;padding:10px 16px;border-bottom:1px solid #f2f2f2;">
      <button class="qa-tab qa-tab-contact" data-tab="contact" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#f9f9f9;cursor:pointer;">${copy.contactTab}</button>
      <button class="qa-tab qa-tab-partner" data-tab="partner" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">${copy.partnerTab}</button>
    </div>
    <div class="qa-body" style="padding:16px;">
      <form class="qa-form qa-form-contact" data-kind="contact" style="display:block;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>${copy.firstName}<input name="firstName" type="text" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
          <label>${copy.lastName}<input name="lastName" type="text" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
          <label>${copy.email}<input name="email" type="email" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
          <label>${copy.phone}<input name="phone" type="tel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button type="button" class="qa-cancel" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">${copy.cancel}</button>
          <button type="submit" class="qa-save" style="padding:8px 12px;border-radius:8px;border:1px solid #2b7;background:#2b7;color:#fff;cursor:pointer;">${copy.contactSave}</button>
        </div>
      </form>
      <form class="qa-form qa-form-partner" data-kind="partner" style="display:none;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label>${copy.company}<input name="company" type="text" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
          <label>${copy.partnerContact}<input name="name" type="text" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
          <label>${copy.email}<input name="email" type="email" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
          <label>${copy.phone}<input name="phone" type="tel" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;"></label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button type="button" class="qa-cancel" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">${copy.cancel}</button>
          <button type="submit" class="qa-save" style="padding:8px 12px;border-radius:8px;border:1px solid #2b7;background:#2b7;color:#fff;cursor:pointer;">${copy.partnerSave}</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
  }

  function close() {
    const el = document.querySelector('.qa-overlay');
    if (el && el.parentElement) el.parentElement.removeChild(el);
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', onKey);
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function open(initialTab) {
    close();
    const tpl = document.createElement('template');
    const markup = html().trim();
    if (!tpl || typeof tpl.innerHTML === 'undefined' || !('content' in tpl)) {
      return;
    }
    tpl.innerHTML = markup;
    const node = tpl.content.firstElementChild;
    if (!node || !document.body || typeof document.body.appendChild !== 'function') {
      return;
    }
    document.body.appendChild(node);
    document?.addEventListener?.('keydown', onKey);

    function selectTab(tab) {
      const isContact = tab === 'contact';
      node.querySelector('.qa-form-contact').style.display = isContact ? 'block' : 'none';
      node.querySelector('.qa-form-partner').style.display = isContact ? 'none' : 'block';
      node.querySelector('.qa-tab-contact').style.background = isContact ? '#f9f9f9' : '#fff';
      node.querySelector('.qa-tab-partner').style.background = isContact ? '#fff' : '#f9f9f9';
    }

    node.querySelector('.qa-close').addEventListener('click', close);
    node.querySelectorAll('.qa-cancel').forEach((btn) => btn.addEventListener('click', close));
    node.querySelector('.qa-tab-contact').addEventListener('click', () => selectTab('contact'));
    node.querySelector('.qa-tab-partner').addEventListener('click', () => selectTab('partner'));

    const contactForm = node.querySelector('.qa-form[data-kind="contact"]');
    const partnerForm = node.querySelector('.qa-form[data-kind="partner"]');

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(contactForm);
      const rec = {
        firstName: String(fd.get('firstName') || '').trim(),
        lastName: String(fd.get('lastName') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        createdAt: Date.now(),
        stage: 'Lead',
        status: 'Active',
      };
      try {
        if (window.Contacts?.createQuick) {
          await window.Contacts.createQuick(rec);
        } else if (typeof window.dbPut === 'function') {
          await window.dbPut('contacts', rec);
        } else {
          console.warn('[quickAdd] no Contacts.createQuick or dbPut; saved to memory only', rec);
        }
      } catch (err) {
        console.error('[quickAdd] contact save failed', err);
      } finally {
        try { window.dispatchAppDataChanged?.('quick-add:contact'); } catch (_err) {}
        close();
      }
    });

    partnerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(partnerForm);
      const rec = {
        company: String(fd.get('company') || '').trim(),
        name: String(fd.get('name') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        createdAt: Date.now(),
        tier: 'Unassigned',
      };
      try {
        if (window.Partners?.createQuick) {
          await window.Partners.createQuick(rec);
        } else if (typeof window.dbPut === 'function') {
          await window.dbPut('partners', rec);
        } else {
          console.warn('[quickAdd] no Partners.createQuick or dbPut; saved to memory only', rec);
        }
      } catch (err) {
        console.error('[quickAdd] partner save failed', err);
      } finally {
        try { window.dispatchAppDataChanged?.('quick-add:partner'); } catch (_err) {}
        close();
      }
    });

    selectTab(initialTab || 'contact');
  }

  function bindTriggers() {
    const selectors = [
      '[data-action="quick-add-contact"]',
      '[data-action="quick-add-partner"]',
      '[data-quick-add]',
      '[data-quick-add-contact]',
      '[data-quick-add-partner]',
      '.quick-add-contact',
      '.quick-add-partner',
      '#btnQuickAddContact',
      '#btnQuickAddPartner',
      '#quick-add'
    ];
    const seen = new Set();
    const nodes = [];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((node) => {
        if (!seen.has(node)) {
          seen.add(node);
          nodes.push(node);
        }
      });
    });
    nodes.forEach((node) => {
      const dataset = node.dataset || {};
      const hints = [
        dataset.quickAdd,
        dataset.quickAddTarget,
        dataset.quickAddKind,
        dataset.quickAddType,
        dataset.action,
        node.getAttribute?.('data-quick-add'),
        node.getAttribute?.('data-quick-add-target'),
        node.getAttribute?.('data-quick-add-kind'),
        node.getAttribute?.('data-quick-add-type'),
        node.getAttribute?.('aria-label'),
        node.getAttribute?.('title'),
        node.getAttribute?.('data-target'),
        node.className,
        node.id,
        node.textContent
      ];
      if (Object.prototype.hasOwnProperty.call(dataset, 'quickAddPartner') || node.hasAttribute?.('data-quick-add-partner')) {
        hints.push('partner');
      }
      if (Object.prototype.hasOwnProperty.call(dataset, 'quickAddContact') || node.hasAttribute?.('data-quick-add-contact')) {
        hints.push('contact');
      }
      const hintText = hints.filter(Boolean).join(' ').toLowerCase();
      const isPartner = hintText.includes('partner');
      node.addEventListener('click', (e) => { e.preventDefault(); open(isPartner ? 'partner' : 'contact'); });
    });
  }

  const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
  const ready = () => {
    if (document.readyState === 'complete') {
      bindTriggers();
    } else {
      raf(bindTriggers);
    }
  };
  raf(ready);

  window.QuickAddUnified = { open };
}
