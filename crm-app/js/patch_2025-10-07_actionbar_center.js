(() => {
  if (window.__WIRED_ACTIONBAR_CENTER__) return;
  window.__WIRED_ACTIONBAR_CENTER__ = true;

  function center() {
    const bar = document.querySelector('[data-role="actionbar"]');
    if (!bar) return;
    // Non-invasive centering: flex container with gap, applied inline
    const s = bar.style;
    s.display = s.display || "flex";
    s.justifyContent = "center";
    s.alignItems = "center";
    s.gap = s.gap || "8px";
    s.margin = s.margin || "8px auto";
    s.width = s.width || "100%";
  }
  document.addEventListener("DOMContentLoaded", center, { once: true });
  document.addEventListener("app:data:changed", center);
})();
