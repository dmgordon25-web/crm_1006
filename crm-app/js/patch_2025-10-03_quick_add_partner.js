(function(){
  if (window.__WIRED_QA_PARTNER__) return; window.__WIRED_QA_PARTNER__ = true;

  function idv(){ try{ return crypto.randomUUID() }catch(_){ return 'p-'+Math.random().toString(36).slice(2,11); } }
  function asDialog(){
    let dlg = document.getElementById('quick-add-partner');
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.id='quick-add-partner';
    dlg.innerHTML = `
      <form method="dialog" id="quick-add-partner-form" style="min-width:420px;display:grid;gap:8px">
        <h3 style="margin:0 0 4px 0">Add Partner</h3>
        <input name="name" placeholder="Name" required>
        <input name="company" placeholder="Company">
        <input name="email" placeholder="Email">
        <input name="phone" placeholder="Phone">
        <menu style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button value="cancel">Cancel</button>
          <button class="brand" value="ok">Save</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function onSave(form){
    const fd = new FormData(form);
    const rec = {
      id: idv(),
      name: String(fd.get('name')||'').trim(),
      company: String(fd.get('company')||'').trim(),
      email: String(fd.get('email')||'').trim(),
      phone: String(fd.get('phone')||'').trim(),
      tier: 'Keep in Touch',
      updatedAt: Date.now()
    };
    await openDB(); await dbPut('partners', rec);
    document.dispatchEvent(new CustomEvent('app:data:changed',{detail:{source:'qa:partner'}}));
  }

  function wire(){
    const header = document.querySelector('header.header-bar') || document.getElementById('main-nav')?.parentElement;
    const btn = header?.querySelector('[data-quick-add-partner]');
    if (!btn || btn.__wired) return;
    btn.__wired = true;
    btn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const dlg = asDialog();
      const form = dlg.querySelector('#quick-add-partner-form');
      form.reset();
      dlg.showModal();
      const rv = await new Promise(res=>{ dlg.addEventListener('close', ()=>res(dlg.returnValue), {once:true}); });
      if (rv==='ok') await onSave(form);
    });
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, {once:true}); else wire();
  window.RenderGuard?.registerHook?.(wire);
})();
