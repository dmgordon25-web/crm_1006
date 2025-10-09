// header_ui.js — remove deprecated header chrome
(function(){
  if(typeof document === 'undefined') return;

  function removeNode(el){
    if(!el) return;
    if(typeof el.remove === 'function'){ el.remove(); return; }
    if(el.parentNode){ el.parentNode.removeChild(el); }
  }

  function cleanHeader(){
    removeNode(document.getElementById('notif-wrap'));
    const diagHost = document.getElementById('diagnostics');
    if(diagHost){
      diagHost.innerHTML = '';
      diagHost.hidden = true;
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', cleanHeader, { once:true });
  }else{
    cleanHeader();
  }
})();
