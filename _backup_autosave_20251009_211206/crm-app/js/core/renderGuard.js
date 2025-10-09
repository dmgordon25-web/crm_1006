(function(global){
  if (!global) return;

  const bridgeKey = '__appDataChangedWindowBridge__';
  const legacyBridgeKey = '__AD_BRIDGE__';
  if (!global[bridgeKey] && global[legacyBridgeKey]){
    global[bridgeKey] = global[legacyBridgeKey];
    return;
  }
  if (!global[bridgeKey] && typeof global.addEventListener === 'function'){
    const reemit = function(event){
      const doc = global.document || null;
      if (!event || !doc || event.target === doc) return;
      if (typeof global.dispatchAppDataChanged === 'function'){
        global.dispatchAppDataChanged(event.detail);
      } else if (doc && typeof doc.dispatchEvent === 'function'){
        doc.dispatchEvent(new CustomEvent('app:data:changed', { detail: event && event.detail }));
      }
    };
    global.addEventListener('app:data:changed', reemit, true);
    global[bridgeKey] = {
      handler: reemit,
      remove(){
        try { global.removeEventListener('app:data:changed', reemit, true); }
        catch(_err){}
      }
    };
    if (!global[legacyBridgeKey]) global[legacyBridgeKey] = true;
  } else if (global[bridgeKey] && !global[legacyBridgeKey]){
    global[legacyBridgeKey] = true;
  }

  const isDebug = Boolean(global.__ENV__ && global.__ENV__.DEBUG === true);
  const subscribers = new Set();
  const afterRender = new Set();
  let scheduled = false;
  let depth = 0;

  function enter(){
    depth += 1;
    global.__RENDERING__ = depth > 0;
  }

  function exit(){
    if (depth > 0) depth -= 1;
    global.__RENDERING__ = depth > 0;
  }

  function isRendering(){
    return depth > 0;
  }

  function safeCall(fn){
    if (typeof fn !== 'function') return null;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.catch(err => {
          if (isDebug && typeof console !== 'undefined' && console.warn) {
            console.warn('[renderGuard] subscriber rejected', err);
          }
        });
      }
      return null;
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[renderGuard] subscriber failed', err);
      }
      return null;
    }
  }

  function runAfterRender(){
    afterRender.forEach(fn => {
      try { fn(); }
      catch (err) {
        if (isDebug && typeof console !== 'undefined' && console.warn) {
          console.warn('[renderGuard] after-render hook failed', err);
        }
      }
    });
  }

  function flush(){
    scheduled = false;
    enter();
    const pending = [];
    subscribers.forEach(fn => {
      const maybe = safeCall(fn);
      if (maybe) pending.push(maybe);
    });
    const finalize = () => {
      runAfterRender();
      exit();
    };
    if (pending.length){
      Promise.allSettled(pending).finally(finalize);
    } else {
      finalize();
    }
  }

  function requestRender(){
    if (scheduled) return;
    scheduled = true;
    const raf = typeof global.requestAnimationFrame === 'function'
      ? global.requestAnimationFrame.bind(global)
      : (cb) => setTimeout(cb, 16);
    raf(() => {
      flush();
    });
  }

  function subscribeRender(fn){
    if (typeof fn === 'function') subscribers.add(fn);
  }

  function unsubscribeRender(fn){
    if (typeof fn === 'function') subscribers.delete(fn);
  }

  function registerHook(fn){
    if (typeof fn === 'function') afterRender.add(fn);
  }

  function unregisterHook(fn){
    afterRender.delete(fn);
  }

  function reset(){
    subscribers.clear();
    afterRender.clear();
    scheduled = false;
    depth = 0;
    global.__RENDERING__ = false;
  }

  const api = {
    subscribeRender,
    unsubscribeRender,
    requestRender,
    registerHook,
    unregisterHook,
    enter,
    exit,
    isRendering,
    __reset: reset,
    __getSubscriberCount(){ return subscribers.size; },
    __getHookCount(){ return afterRender.size; }
  };

  const existing = global.RenderGuard && typeof global.RenderGuard === 'object'
    ? global.RenderGuard
    : {};
  const merged = Object.assign({}, existing, api);
  Object.defineProperty(global, 'RenderGuard', {
    value: merged,
    configurable: true,
    enumerable: false,
    writable: true
  });

  if (typeof global.registerRenderHook !== 'function'){
    global.registerRenderHook = registerHook;
  }

  if (typeof global.dispatchAppDataChanged !== 'function'){
    global.dispatchAppDataChanged = function(detail){
      if (isRendering()) return;
      const meter = global.__METER__ = global.__METER__ || {};
      const bucket = meter.dataChanged = meter.dataChanged || { count: 0, lastSource: '' };
      bucket.count += 1;
      const source = detail && typeof detail === 'object' && typeof detail.source === 'string'
        ? detail.source
        : '';
      bucket.lastSource = source;
      const doc = global.document;
      if (doc && typeof doc.dispatchEvent === 'function'){
        doc.dispatchEvent(new CustomEvent('app:data:changed', { detail }));
        return;
      }
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function'){
        global.dispatchEvent(new global.CustomEvent('app:data:changed', { detail }));
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = merged;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
