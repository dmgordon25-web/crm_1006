const doc = typeof document !== 'undefined' ? document : null;

function resolveElement(target){
  if(!doc) return null;
  if(!target) return null;
  if(typeof target === 'string'){
    try{ return doc.querySelector(target); }
    catch(_err){ return null; }
  }
  if(typeof Element !== 'undefined' && target instanceof Element) return target;
  if(typeof target === 'object' && target.nodeType === 1) return target;
  return null;
}

export function hide(target){
  const el = resolveElement(target);
  if(!el) return;
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  if(el.style){
    el.style.display = 'none';
  }
}

export function setDisabled(target, off){
  const el = resolveElement(target);
  if(!el) return;
  const disabled = Boolean(off);
  if(disabled){
    el.setAttribute('disabled', '');
  }else{
    el.removeAttribute('disabled');
  }
  el.setAttribute('aria-disabled', String(disabled));
}

export function debounce(fn, wait = 150){
  let timer = null;
  return function debounced(...args){
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}

export function resolveElements(selectors){
  if(!doc) return [];
  const list = Array.isArray(selectors) ? selectors : [selectors];
  return list
    .map(sel => resolveElement(sel))
    .filter(Boolean);
}

export function doubleRaf(callback){
  const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : null;
  const run = typeof callback === 'function' ? callback : ()=>{};
  if(raf){
    raf(() => raf(run));
  }else{
    setTimeout(run, 32);
  }
}
