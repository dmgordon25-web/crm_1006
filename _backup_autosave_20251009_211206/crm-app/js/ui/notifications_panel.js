import { getNotificationsCount, onNotificationsChanged } from '/js/notifications/notifier.js';

if (!window.__WIRED_NOTIF_TAB_COUNT__) {
  window.__WIRED_NOTIF_TAB_COUNT__ = true;

  function setTab(n) {
    const sel = ['[data-nav="notifications"]','[data-tab="notifications"]','a[href="#notifications"]','.tab-notifications','#tab-notifications'];
    const tab = sel.map(s => document.querySelector(s)).find(Boolean);
    if (!tab) return;
    const base = "Notifications";
    tab.textContent = (n > 0) ? `${base}[${n}]` : base;
    tab.setAttribute("data-count", String(n || 0));
  }

  const raf = window.requestAnimationFrame || (cb => setTimeout(cb,16));
  const apply = () => { try { setTab(getNotificationsCount()); } catch(_) {} };

  // Listen to our API event and general app updates
  onNotificationsChanged(apply);
  try { window.addEventListener("app:data:changed", apply); } catch(_) {}
  raf(() => raf(apply));
}
