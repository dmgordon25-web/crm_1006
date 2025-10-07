import { listNotifications, clearNotifications, removeNotification, onNotificationsChanged } from '/js/notifications/notifier.js';

function fmt(ts){
  if (!ts && ts !== 0) return '';
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return String(ts || '');
    return date.toLocaleString();
  } catch (_) {
    return String(ts || '');
  }
}

function createLayout(){
  const section = document.createElement('section');
  section.setAttribute('data-notifs', '');
  section.setAttribute('role', 'region');
  section.setAttribute('aria-label', 'Notifications');

  const header = document.createElement('header');
  header.style.display = 'flex';
  header.style.gap = '8px';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';

  const heading = document.createElement('h3');
  heading.style.margin = '0';
  heading.textContent = 'Notifications';
  header.appendChild(heading);

  const controls = document.createElement('div');
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.setAttribute('data-act', 'clear-notifications');
  clearBtn.textContent = 'Clear All';
  controls.appendChild(clearBtn);
  header.appendChild(controls);

  const list = document.createElement('div');
  list.className = 'list';
  list.style.marginTop = '12px';
  list.setAttribute('data-list', 'notifications');

  section.append(header, list);
  return { section, list, clearBtn };
}

function renderList(listEl){
  const items = listNotifications();
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement('div');
    empty.setAttribute('role', 'note');
    empty.textContent = 'No notifications yet.';
    listEl.replaceChildren(empty);
    return;
  }

  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  ul.style.margin = '0';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.style.padding = '8px 0';
    li.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
    li.setAttribute('data-id', item.id || '');

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.gap = '12px';
    header.style.alignItems = 'center';

    const titleWrap = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title || '(untitled notification)';
    titleWrap.appendChild(title);

    const actionsWrap = document.createElement('div');
    actionsWrap.style.display = 'flex';
    actionsWrap.style.gap = '8px';
    actionsWrap.style.alignItems = 'center';

    const time = document.createElement('div');
    time.style.opacity = '0.7';
    time.textContent = fmt(item.ts);
    actionsWrap.appendChild(time);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('data-act', 'notif-remove');
    removeBtn.setAttribute('data-id', item.id || '');
    removeBtn.textContent = 'Remove';
    actionsWrap.appendChild(removeBtn);

    header.append(titleWrap, actionsWrap);

    const metaLine = document.createElement('div');
    metaLine.style.fontSize = '12px';
    metaLine.style.opacity = '0.8';
    metaLine.textContent = item.type || 'info';

    li.append(header, metaLine);
    ul.appendChild(li);
  });

  listEl.replaceChildren(ul);
}

export function renderNotifications(root){
  if (!root) return;

  if (typeof root.__notifCleanup === 'function') {
    try { root.__notifCleanup(); } catch (_) {}
  }

  const { section, list, clearBtn } = createLayout();
  root.replaceChildren(section);

  const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
  const cancelRaf = window.cancelAnimationFrame || window.clearTimeout || clearTimeout;
  let frame = null;
  const apply = () => {
    if (frame !== null) return;
    frame = raf(() => {
      frame = null;
      try { renderList(list); } catch (_) {}
    });
  };

  const unsub = onNotificationsChanged(apply);
  const clearHandler = () => {
    try { clearNotifications(); } catch (_) {}
  };
  clearBtn.addEventListener('click', clearHandler);

  const clickHandler = (event) => {
    const btn = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-act="notif-remove"]')
      : null;
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;
    removeNotification(id);
  };
  section.addEventListener('click', clickHandler);

  const cleanup = () => {
    if (typeof unsub === 'function') {
      try { unsub(); } catch (_) {}
    }
    clearBtn.removeEventListener('click', clearHandler);
    section.removeEventListener('click', clickHandler);
    if (frame !== null) {
      try { cancelRaf(frame); } catch (_) {}
    }
    frame = null;
  };

  root.__notifCleanup = cleanup;
  section.addEventListener('DOMNodeRemovedFromDocument', cleanup, { once: true });

  apply();
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
