// header_ui.js — bell toggle + notif count
(function(){
  function $(s, r){ return (r||document).querySelector(s); }
  function outside(el, e){ return el && !el.contains(e.target); }

  async function computeNotifCount(){
    try{
      if(typeof window.getNotificationBadgeCount === 'function'){
        return await window.getNotificationBadgeCount();
      }
      if(typeof window.computeNotifications === 'function'){
        const list = await window.computeNotifications();
        return Array.isArray(list) ? list.length : 0;
      }
      await openDB();
      const rows = await dbGetAll('notifications');
      return (rows||[]).filter(r => r && r.status !== 'sent').length;
    }catch(_){ return 0; }
  }

  async function refreshNotificationBadge(){
    const badge = $('#notif-badge');
    const count = await computeNotifCount();
    if(badge){
      badge.textContent = String(count);
      badge.style.display = count ? '' : 'none';
    }
    return count;
  }
  window.refreshNotificationBadge = refreshNotificationBadge;

  async function wireBell(){
    const wrap = $('#notif-wrap'); const bell = $('#notif-bell'); const panel = $('#notif-panel'); const badge = $('#notif-badge');
    if(!wrap || !bell || !panel) return;
    if(bell.__wired) return; bell.__wired = true;

    bell.addEventListener('click', async (e)=>{
      e.preventDefault(); e.stopPropagation();
      panel.classList.toggle('hidden');
      await refreshNotificationBadge();
    });
    document.addEventListener('click', (e)=>{ if(outside(wrap, e)) panel.classList.add('hidden'); });
    // initial count
    await refreshNotificationBadge();
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', wireBell); }
  else { wireBell(); }
})();
