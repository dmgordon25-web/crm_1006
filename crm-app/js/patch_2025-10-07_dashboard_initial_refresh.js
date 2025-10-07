(() => {
  if (window.__WIRED_DASH_INIT_REFRESH__) return;
  window.__WIRED_DASH_INIT_REFRESH__ = true;

  const raf = window.requestAnimationFrame?.bind(window) || ((fn)=>setTimeout(fn,16));
  let ticks = 0;

  function kick() {
    // Wait a couple of frames for modules to finish their first mounts
    ticks++;
    if (ticks < 3) return raf(kick);
    try {
      window.dispatchAppDataChanged?.("boot:dashboard:init");
    } catch {}
  }

  if (document.readyState === "complete" || document.readyState === "interactive") raf(kick);
  else document.addEventListener("DOMContentLoaded", () => raf(kick), { once: true });
})();
