// utils.js
window.$ = (sel, root=document) => root.querySelector(sel);
window.$all = (sel, root=document) => Array.from(root.querySelectorAll(sel));
window.toast = (input, opts) => {
  const hasToastApi = window.Toast && typeof window.Toast.show === 'function';
  if(hasToastApi){
    if(input && typeof input === 'object' && !Array.isArray(input)){
      const payload = Object.assign({}, input);
      const message = 'message' in payload ? payload.message : '';
      delete payload.message;
      window.Toast.show(message, payload);
      return;
    }
    window.Toast.show(input, opts);
    return;
  }
  const payload = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const message = typeof input === 'string' ? input : String(payload.message || '');
  if(!message){ return; }
  const t = $('#toast');
  if(!t){
    if(typeof alert === 'function') alert(message);
    return;
  }
  t.textContent = message;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), Number(payload.duration)||2000);
};
window.money = (n) => {
  const v = Number(n||0);
  return v.toLocaleString(undefined, {style:'currency', currency:'USD', maximumFractionDigits:0});
};
window.fullName = (c) => [c.first||'', c.last||''].filter(Boolean).join(' ').trim();
window.lc = (s) => String(s||'').toLowerCase();
window.uuid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);


// --- Shims (safe no-ops if modules haven't loaded yet) ---
// Provide a temporary renderContactModal to avoid early load errors; the real one will overwrite this.
if (typeof window.renderContactModal !== 'function') {
  window.renderContactModal = async function(id){ console.warn('renderContactModal shim invoked; module will overwrite when ready.', id); };
}
