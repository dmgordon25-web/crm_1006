const BUTTON_ID = 'actionbar-merge-partners';

function injectActionBarStyle(){
  if (typeof document === 'undefined') return;
  if (document.getElementById('ab-inline-style')) return;
  const s = document.createElement('style'); s.id = 'ab-inline-style';
  s.textContent = `
      #actionbar{
        position:fixed; left:50%; transform:translateX(-50%);
        bottom:16px; z-index:9999;
        max-width:960px; width:auto; padding:8px 12px;
        border-radius:12px; background:rgba(20,22,28,0.88); color:#fff;
        box-shadow:0 8px 24px rgba(0,0,0,.25);
      }
      #actionbar .actionbar-actions{ display:flex; gap:8px; align-items:center; justify-content:center; }
      #actionbar .btn{ padding:6px 10px; font-size:0.95rem; border-radius:10px; }
      #actionbar .btn.disabled{ opacity:.45; pointer-events:none; }
      #actionbar .btn.active{ outline:2px solid rgba(255,255,255,.35); transform:translateY(-1px); }
    `;
  document.head.appendChild(s);
}

function getActionsHost() {
  const bar = typeof document !== 'undefined' ? document.getElementById('actionbar') : null;
  return bar ? bar.querySelector('.actionbar-actions') : null;
}

export function ensurePartnersMergeButton() {
  injectActionBarStyle();
  const host = getActionsHost();
  if (!host) return null;
  let btn = document.getElementById(BUTTON_ID);
  if (btn) return btn;
  btn = document.createElement('button');
  btn.className = 'btn';
  btn.id = BUTTON_ID;
  btn.type = 'button';
  btn.textContent = 'Merge (Partners)';
  btn.disabled = true;
  btn.style.display = 'none';
  const mergeBtn = host.querySelector('[data-act="merge"]');
  if (mergeBtn && mergeBtn.nextSibling) {
    host.insertBefore(btn, mergeBtn.nextSibling);
  } else {
    host.appendChild(btn);
  }
  return btn;
}

export function setPartnersMergeState(options) {
  const btn = ensurePartnersMergeButton();
  if (!btn) return;
  const visible = !!(options && options.visible);
  const enabled = !!(options && options.enabled);
  btn.style.display = visible ? '' : 'none';
  btn.disabled = !enabled;
  if (visible) {
    btn.classList.toggle('disabled', !enabled);
    if (btn.classList && typeof btn.classList.toggle === 'function') {
      btn.classList.toggle('active', enabled);
    }
  } else if (btn.classList && typeof btn.classList.remove === 'function') {
    btn.classList.remove('active');
  }
}

export function onPartnersMerge(handler) {
  const btn = ensurePartnersMergeButton();
  if (!btn) return;
  if (btn.__partnersMergeWired) {
    btn.__partnersMergeHandler = handler;
    return;
  }
  btn.__partnersMergeWired = true;
  btn.__partnersMergeHandler = handler;
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    if (typeof btn.__partnersMergeHandler === 'function') {
      btn.__partnersMergeHandler();
    }
  });
}
