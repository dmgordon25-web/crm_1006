(function(){
  if (window.__WIRED_AUTO_SEED__) return; window.__WIRED_AUTO_SEED__ = true;
  function run(){
    try{
      const Templates = window.Templates || (window.__modules__?.['js/email/templates_store.js']?.Templates);
      if (!Templates) return;
      const items = Templates.list?.() || [];
      if (!items.length){
        Templates.upsert({ name:'Birthday Greeting', subject:'Happy Birthday, {first}!', body:'Hi {first}, just wanted to wish you a happy birthday! – {loName}' }, { silent:true });
        Templates.upsert({ name:'Loan Milestone: CTC', subject:'Clear to Close 🎉', body:'Congrats {first}! You’re clear to close. Next steps… – {loName}' }, { silent:true });
        Templates.upsert({ name:'Post-Funding Check-in', subject:'How’s the new home?', body:'Hi {first}, checking in after closing. Anything you need? – {loName}' }, { silent:true });
      }
    }catch(e){ console.warn('automation seed skipped', e); }
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();
