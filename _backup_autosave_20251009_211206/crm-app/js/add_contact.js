(function(){
  function looksLikeShim(fn){
    try { const s = Function.prototype.toString.call(fn); return /shim/i.test(s) || /overwrite when ready/i.test(s); }
    catch(e){ return false; }
  }
  async function openFallbackNewContact(){
    try{ await openDB(); }catch(_){}
    const dlg = document.getElementById('contact-modal');
    if(!dlg) return toast('Contact modal missing');
    const selectors = ['#c-id','#c-first','#c-lastname','#c-email','#c-phone','#c-address','#c-city','#c-state','#c-zip','#c-loanType','#c-ref','#c-notes'];
    selectors.forEach(sel => { const el = document.querySelector(sel); if (el) el.value = ''; });
    // defaults
    const stage = document.querySelector('#c-stage'); if(stage) stage.value = 'application';
    const status = document.querySelector('#c-status'); if(status) status.value = 'inprogress';
    if (dlg.showModal) dlg.showModal(); else dlg.classList.remove('hidden');
  }
  function wire(){
    const btn = document.getElementById('btn-add-contact');
    if(!btn || btn.__wired) return; btn.__wired = true;
    btn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const fn = window.renderContactModal;
      if(typeof fn==='function' && !looksLikeShim(fn)) return fn(null);
      if(typeof window.openNewContact==='function') return window.openNewContact();
      return openFallbackNewContact();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();