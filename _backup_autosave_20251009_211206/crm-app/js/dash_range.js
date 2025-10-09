// dash_range.js — Dashboard timeframe toggle
(function(){
  if(!window.__INIT_FLAGS__) window.__INIT_FLAGS__ = {};
  if(window.__INIT_FLAGS__.dash_range) return;
  window.__INIT_FLAGS__.dash_range = true;

  try{ window.DASH_RANGE = localStorage.getItem('dash:range') || 'all'; }
  catch(_){ window.DASH_RANGE = window.DASH_RANGE || 'all'; } // 'all' | 'tm'
  function $(s,r){ return (r||document).querySelector(s); }

  function sync(){
    const btn = $('#dash-range');
    if(btn) btn.textContent = window.DASH_RANGE==='all' ? 'All Time ▾' : 'This Month ▾';
  }

  function cycle(){
    window.DASH_RANGE = (window.DASH_RANGE==='all') ? 'tm' : 'all';
    try{ localStorage.setItem('dash:range', window.DASH_RANGE); }catch(_){}
    sync();
    if(typeof window.renderAll === 'function') window.renderAll();
  }

  const btn = $('#dash-range');
  if(btn && !btn.__wired){
    btn.__wired = true;
    btn.addEventListener('click', cycle);
  }

  sync();
})();
