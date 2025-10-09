(function(){
  if(typeof window === 'undefined') return;
  if(window.Toast && typeof window.Toast.show === 'function') return;

  const DEFAULT_DURATION = 2600;
  const COALESCE_WINDOW = 500;

  function createHost(){
    const doc = window.document;
    if(!doc || !doc.createElement) return null;
    const host = doc.createElement('div');
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.dataset.toastHost = 'true';
    const style = host.style;
    style.position = 'fixed';
    style.right = '24px';
    style.bottom = '24px';
    style.padding = '10px 14px';
    style.borderRadius = '8px';
    style.background = 'rgba(15, 23, 42, 0.92)';
    style.color = '#f8fafc';
    style.font = '13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
    style.boxShadow = '0 12px 32px rgba(15, 23, 42, 0.24)';
    style.opacity = '0';
    style.transform = 'translateY(6px)';
    style.transition = 'opacity 140ms ease, transform 140ms ease';
    style.pointerEvents = 'none';
    style.maxWidth = '320px';
    style.textAlign = 'left';
    style.letterSpacing = '0.01em';
    style.zIndex = '2147483647';
    style.display = 'flex';
    style.gap = '12px';
    style.alignItems = 'center';
    host.hidden = true;
    const body = doc.body;
    if(body && typeof body.appendChild === 'function'){
      body.appendChild(host);
    }
    return host;
  }

  function ToastController(){
    this.host = null;
    this.hideTimer = null;
    this.lastMessage = '';
    this.lastShownAt = 0;
    this.currentAction = null;
  }

  ToastController.prototype.ensureHost = function ensureHost(){
    const doc = window.document;
    if(!doc) return null;
    if(this.host && doc.body && typeof doc.body.contains === 'function' && doc.body.contains(this.host)){
      return this.host;
    }
    this.host = createHost();
    return this.host;
  };

  ToastController.prototype.show = function show(message, options){
    const text = String(message == null ? '' : message).trim() || 'Saved';
    const action = options && options.action;
    const hasAction = action && typeof action === 'object' && typeof action.onClick === 'function';
    const now = Date.now();
    if(!hasAction && text === this.lastMessage && now - this.lastShownAt <= COALESCE_WINDOW){
      return;
    }
    this.lastMessage = text;
    this.lastShownAt = now;
    const host = this.ensureHost();
    if(!host) return;
    host.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = text;
    label.style.flex = '1';
    host.appendChild(label);
    host.style.pointerEvents = 'none';
    this.currentAction = null;
    if(hasAction){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(action.label || 'Undo');
      btn.style.border = '1px solid rgba(248, 250, 252, 0.65)';
      btn.style.background = 'transparent';
      btn.style.color = '#f8fafc';
      btn.style.fontWeight = '600';
      btn.style.padding = '4px 12px';
      btn.style.borderRadius = '999px';
      btn.style.cursor = 'pointer';
      btn.style.flexShrink = '0';
      btn.addEventListener('click', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        this.hide();
        try{ action.onClick(); }
        catch(err){ console && console.warn && console.warn('toast action', err); }
      }, { once: true });
      host.appendChild(btn);
      host.style.pointerEvents = 'auto';
      this.currentAction = action.onClick;
    }
    host.hidden = false;
    host.style.opacity = '1';
    host.style.transform = 'translateY(0)';
    if(this.hideTimer){
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const duration = options && Number.isFinite(options.duration)
      ? Math.max(0, Number(options.duration))
      : DEFAULT_DURATION;
    const controller = this;
    this.hideTimer = setTimeout(function(){
      controller.hide();
    }, duration);
  };

  ToastController.prototype.hide = function hide(){
    if(this.hideTimer){
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const host = this.host;
    if(!host) return;
    host.style.pointerEvents = 'none';
    host.style.opacity = '0';
    host.style.transform = 'translateY(6px)';
    const finalize = function(){ host.hidden = true; };
    if(typeof host.addEventListener === 'function'){
      const onTransitionEnd = function(){
        host.removeEventListener('transitionend', onTransitionEnd);
        finalize();
      };
      host.addEventListener('transitionend', onTransitionEnd, { once: true });
      setTimeout(function(){
        host.removeEventListener('transitionend', onTransitionEnd);
        finalize();
      }, 200);
    }else{
      finalize();
    }
  };

  const controller = new ToastController();
  const api = {
    show: controller.show.bind(controller),
    hide: controller.hide.bind(controller)
  };

  window.Toast = api;
  window.toast = function(message, options){
    if(message && typeof message === 'object' && !Array.isArray(message)){
      const payload = Object.assign({}, message);
      const text = 'message' in payload ? payload.message : '';
      delete payload.message;
      api.show(text, payload);
      return;
    }
    api.show(message, options);
  };
})();
