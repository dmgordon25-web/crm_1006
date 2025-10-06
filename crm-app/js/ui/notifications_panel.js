(function(){
  if(typeof window === 'undefined') return;
  const TYPE_LABELS = {
    taskDue: 'Task Due',
    missingDocs: 'Missing Docs',
    birthday: 'Birthday',
    anniversary: 'Anniversary',
    closingSoon: 'Closing Soon'
  };
  async function refreshNotificationsPanel(){
    try{
      const compute = typeof window.computeNotifications === 'function'
        ? window.computeNotifications
        : (typeof window.buildNotificationQueue === 'function' ? window.buildNotificationQueue : null);
      const queue = compute ? await compute() : [];
      const host = document.getElementById('notif-bell-list');
      if(host){
        if(!queue || !queue.length){
          host.innerHTML = '<li class="muted">No queued notifications. You are all caught up.</li>';
        }else{
          host.innerHTML = queue.slice(0, 5).map(item => {
            const type = item && item.type ? String(item.type) : '';
            const label = TYPE_LABELS[type] || type || 'notification';
            const when = item && item.due ? item.due : (item && item.meta && item.meta.due) || '';
            const name = item && item.name ? item.name : '—';
            return `<li><strong>${label}</strong> · ${name}${when ? ` <span class="muted">(${when})</span>` : ''}</li>`;
          }).join('');
        }
      }
      return queue;
    }catch(err){
      if(console && console.warn){ console.warn('[notifications_panel] refresh failed', err); }
      return [];
    }
  }

  window.refreshNotificationsPanel = refreshNotificationsPanel;

  function handleDataChanged(evt){
    const detail = evt && evt.detail;
    if(detail && detail.scope === 'notifications'){
      refreshNotificationsPanel();
    }
  }

  document.addEventListener('app:data:changed', handleDataChanged, { passive: true });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { refreshNotificationsPanel(); });
  }else{
    refreshNotificationsPanel();
  }
})();
