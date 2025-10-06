import { Notifier } from '../notifications/notifier.js';

function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function fmt(ts){ try{ return new Date(ts).toLocaleString(); }catch(_){ return String(ts||''); } }

export function renderNotifications(root){
  if(!root) return;
  root.innerHTML = `
    <section data-notifs role="region" aria-label="Notifications">
      <header style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Notifications</h3>
        <div>
          <button data-act="markread">Mark all read</button>
          <button data-act="clear">Clear</button>
        </div>
      </header>
      <div class="list" style="margin-top:12px;"></div>
    </section>
  `;
  const list = root.querySelector('.list');

  function paint(state){
    const items = state.items;
    if (!items.length){ list.innerHTML = `<div role="note">No notifications yet.</div>`; return; }
    const ul = el(`<ul style="list-style:none;padding:0;margin:0;"></ul>`);
    items.forEach(n => {
      const li = el(`<li style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);"></li>`);
      li.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <div><strong>${n.title}</strong></div>
          <div style="opacity:0.7;">${fmt(n.at)}</div>
        </div>
        <div style="font-size:12px;opacity:${n.read?0.5:0.9};">${n.type}</div>
      `;
      ul.appendChild(li);
    });
    list.replaceChildren(ul);
  }

  const unsub = Notifier.subscribe(paint);

  root.querySelector('[data-act="markread"]').addEventListener('click', () => Notifier.markAllRead());
  root.querySelector('[data-act="clear"]').addEventListener('click', () => Notifier.clearAll());

  // Clean up if the page gets unmounted
  root.addEventListener('DOMNodeRemovedFromDocument', () => unsub(), { once:true });
}

export function initNotifications(){
  const mount = document.getElementById('notif-center-list')
    || document.getElementById('notifications-shell')
    || document.getElementById('view-notifications')
    || document.getElementById('app-main')
    || document.getElementById('root');
  const view = mount?.closest('main');
  if (view && typeof view.classList?.remove === 'function') {
    view.classList.remove('hidden');
  }
  renderNotifications(mount);
}
