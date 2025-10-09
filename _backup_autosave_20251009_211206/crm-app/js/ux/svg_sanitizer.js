(function(){
  if (window.__SVG_SANITIZER__) return; window.__SVG_SANITIZER__ = true;

  const pct = /%$/;

  function fixViewBox(svg){
    const vb = svg.getAttribute('viewBox');
    if (!vb || vb.indexOf('%') === -1) return false;
    const parts = vb.split(/\s+|,/).filter(Boolean);
    if (parts.length !== 4) return false;
    const nums = parts.map((t,i) => {
      t = String(t).trim();
      if (pct.test(t)) {
        const v = parseFloat(t.replace('%',''));
        if (Number.isFinite(v)) return String(v);
        // fallback: 0 for minX/minY, 100 for width/height
        return (i < 2) ? '0' : '100';
      }
      return t;
    });
    svg.setAttribute('viewBox', nums.join(' '));
    return true;
  }

  function sweep(root = document){
    let fixed = 0;
    root.querySelectorAll('svg[viewBox*="%"]').forEach(el => { if (fixViewBox(el)) fixed++; });
    return fixed;
  }

  // Run now (or on DOM ready) and after each render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sweep(), { once:true });
  } else {
    sweep();
  }

  // Catch future inserts/attribute changes (e.g., extensions or late UI)
  try {
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'viewBox' && m.target.tagName === 'SVG' && m.target.getAttribute('viewBox')?.includes('%')) {
          fixViewBox(m.target);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach(n => {
            if (n.nodeType === 1) {
              if (n.tagName === 'SVG' && n.getAttribute('viewBox')?.includes('%')) fixViewBox(n);
              if (n.querySelectorAll) n.querySelectorAll('svg[viewBox*="%"]').forEach(fixViewBox);
            }
          });
        }
      }
    });
    mo.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['viewBox'] });
  } catch(_) {}

  // Hook into our render loop if available
  if (window.RenderGuard && typeof window.RenderGuard.registerHook === 'function') {
    try { window.RenderGuard.registerHook(() => Promise.resolve().then(sweep)); } catch(_) {}
  } else {
    setTimeout(sweep, 0);
  }
})();
