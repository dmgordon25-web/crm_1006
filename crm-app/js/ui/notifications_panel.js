(function(){
  if(typeof window === 'undefined') return;
  if(window.__WIRED_NOTIF_TAB_COUNT__) return;
  window.__WIRED_NOTIF_TAB_COUNT__ = true;

  function setNotificationsTabCount(n){
    const sel = [
      '[data-tab="notifications"]',
      'a[href="#notifications"]',
      '.tab-notifications',
      '#tab-notifications',
      '[data-nav="notifications"]'
    ];
    const tab = sel.map(s => document.querySelector(s)).find(Boolean);
    if(!tab) return;
    const base = 'Notifications';
    const count = Number.isFinite(n) ? n : 0;
    tab.textContent = count > 0 ? `${base}[${count}]` : base;
    tab.setAttribute('data-count', String(count));
  }

  async function getNotificationsCount(){
    try{
      if(typeof window.getNotificationsCount === 'function'){
        const value = await window.getNotificationsCount();
        if(Number.isFinite(value)) return value;
      }
    }catch(_){ }

    try{
      if(Array.isArray(window.__NOTIF_QUEUE__)){
        return window.__NOTIF_QUEUE__.length;
      }
    }catch(_){ }

    try{
      if(window.Notifier && typeof window.Notifier.unread === 'function'){
        const unread = window.Notifier.unread();
        if(Number.isFinite(unread)) return unread;
      }
      if(window.Notifier && Array.isArray(window.Notifier.queue)){
        return window.Notifier.queue.length;
      }
    }catch(_){ }

    try{
      if(typeof window.dbCount === 'function'){
        const c = await window.dbCount('notifications');
        if(Number.isFinite(c)) return c;
      }
    }catch(_){ }

    try{
      const nodes = document.querySelectorAll('[data-notification-row], .notification-row');
      return nodes.length || 0;
    }catch(_){ }

    return 0;
  }

  const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16));

  async function applyNotifCount(){
    try{
      const count = await getNotificationsCount();
      setNotificationsTabCount(count);
    }catch(_){ }
  }

  try{ window.addEventListener('notifications:changed', applyNotifCount); }catch(_){ }
  try{ window.addEventListener('app:data:changed', applyNotifCount); }catch(_){ }

  raf(() => raf(applyNotifCount));
})();
