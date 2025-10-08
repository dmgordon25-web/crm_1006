import { wireQuickAddUnified } from './ui/quick_add_unified.js';

(function bootstrapQuickAdd(){
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {};
  if (window.__INIT_FLAGS__.quickAddLegacyShim) {
    return;
  }
  window.__INIT_FLAGS__.quickAddLegacyShim = true;

  wireQuickAddUnified();

  const trigger = typeof document.querySelector === 'function'
    ? document.querySelector('[data-quick-add]')
    : null;

  if (trigger && typeof trigger.addEventListener === 'function') {
    const element = trigger;
    if (!element.dataset) {
      element.dataset = {};
    }
    if (element.dataset.quickAddUnifiedShim === 'true') {
      return;
    }
    element.dataset.quickAddUnifiedShim = 'true';
    const handleClick = (event) => {
      event?.preventDefault?.();
      wireQuickAddUnified();
      const api = window.QuickAddUnified;
      if (api && typeof api.open === 'function') {
        api.open();
      }
    };
    element.addEventListener('click', handleClick);
  }
})();
