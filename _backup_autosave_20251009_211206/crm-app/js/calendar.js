(function(){
  if(!window.__CALENDAR_STATE__) window.__CALENDAR_STATE__ = {anchor:new Date(), view:'month'};
  if(window.__CALENDAR_WIRED__) return; window.__CALENDAR_WIRED__ = true;

  let queued = false;
  let domReady = document.readyState !== 'loading';
  let pendingUntilDomReady = false;
  let implReady = false;
  let implReadyPromise = null;

  function calendarRoot(){
    return document.getElementById('calendar-root');
  }

  function showPlaceholder(){
    const root = calendarRoot();
    if(!root) return;
    if(root.querySelector('[data-cal-loading]')) return;
    root.innerHTML = '<div data-cal-loading class="muted" style="padding:16px;text-align:center;font-size:13px">Loading calendar...</div>';
  }

  function clearPlaceholder(){
    const root = calendarRoot();
    if(!root) return;
    const placeholder = root.querySelector('[data-cal-loading]');
    if(!placeholder) return;
    if(placeholder.parentNode === root && root.childNodes.length === 1){
      root.innerHTML = '';
    }else{
      placeholder.remove();
    }
  }

  function ensureImplReady(){
    if(implReady) return Promise.resolve(true);
    if(implReadyPromise) return implReadyPromise;
    const ready = window.__CALENDAR_READY__;
    if(ready && typeof ready.then === 'function'){
      implReadyPromise = Promise.resolve(ready).then(()=>{
        implReady = true;
        clearPlaceholder();
        return true;
      }).catch(err=>{
        implReady = true;
        clearPlaceholder();
        if(console && console.warn) console.warn('calendar ready failed', err);
        return false;
      });
    }else{
      implReady = true;
      implReadyPromise = Promise.resolve(true);
    }
    return implReadyPromise;
  }

  function normalizeView(v){ return (v==='week' || v==='day') ? v : 'month'; }
  async function renderNow(){
    await ensureImplReady();
    const impl = window.__CALENDAR_IMPL__;
    if(impl && typeof impl.render==='function'){
      clearPlaceholder();
      return impl.render(window.__CALENDAR_STATE__.anchor, window.__CALENDAR_STATE__.view);
    }
    return undefined;
  }
  function updateControls(){
    const view = window.__CALENDAR_STATE__.view;
    document.querySelectorAll('[data-calview]').forEach(btn => {
      const current = btn.getAttribute('data-calview');
      const active = current === view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function queueRender(){
    if(!domReady){
      pendingUntilDomReady = true;
      return;
    }
    pendingUntilDomReady = false;
    if(queued) return; queued = true;
    if(!implReady) ensureImplReady().catch(err=>{ if(console && console.warn) console.warn('calendar gate failed', err); });
    requestAnimationFrame(async ()=>{
      queued = false;
      try{ await renderNow(); }
      catch(err){ console && console.warn && console.warn('calendar render failed', err); }
      finally { updateControls(); }
    });
    if(!implReady) showPlaceholder();
  }
  window.renderCalendar = function(){ queueRender(); };
  window.setCalendarView = function(v){ window.__CALENDAR_STATE__.view = normalizeView(v); queueRender(); };
  window.setCalendarAnchor = function(d){ window.__CALENDAR_STATE__.anchor = new Date(d||Date.now()); queueRender(); };

  function adjust(offset){
    const state = window.__CALENDAR_STATE__;
    const anchor = new Date(state.anchor);
    if(state.view==='day'){ anchor.setDate(anchor.getDate()+offset); }
    else if(state.view==='week'){ anchor.setDate(anchor.getDate()+(offset*7)); }
    else { anchor.setMonth(anchor.getMonth()+offset); }
    state.anchor = anchor;
    queueRender();
  }

  window.calToday = function(){ window.__CALENDAR_STATE__.anchor = new Date(); queueRender(); };
  window.calPrev = function(){ adjust(-1); };
  window.calNext = function(){ adjust(1); };

  function bindControls(){
    document.querySelectorAll('[data-calview]').forEach(btn => {
      if(btn.__calViewWired) return; btn.__calViewWired = true;
      btn.addEventListener('click', (evt)=>{
        evt.preventDefault();
        const view = btn.getAttribute('data-calview');
        window.setCalendarView(view);
      });
    });
    const prev = document.getElementById('cal-prev');
    if(prev && !prev.__calNav){ prev.__calNav = true; prev.addEventListener('click', (evt)=>{ evt.preventDefault(); window.calPrev(); }); }
    const next = document.getElementById('cal-next');
    if(next && !next.__calNav){ next.__calNav = true; next.addEventListener('click', (evt)=>{ evt.preventDefault(); window.calNext(); }); }
    const today = document.getElementById('cal-today');
    if(today && !today.__calNav){ today.__calNav = true; today.addEventListener('click', (evt)=>{ evt.preventDefault(); window.calToday(); }); }
    updateControls();
  }
  function register(){
    if(window.__CALENDAR_LISTENER__) return;
    const listener = (evt)=>{
      if(window.__RENDERING__) return;
      if(evt && evt.type!=='app:data:changed') return;
      queueRender();
    };
    document.addEventListener('app:data:changed', listener, {passive:true});
    window.__CALENDAR_LISTENER__ = listener;
  }

  register();
  function init(){
    domReady = true;
    bindControls();
    queueRender();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
