/* qa/smoke.js — run minimal end-to-end test without altering UI */
(function(){
  if (window.__WIRED_smoke) return; window.__WIRED_smoke = true;

  async function smoke(){
    const out = { bootOk: !!window.__BOOT_OK__, tabs: [], data: {} };
    // 1) Tabs existence (non-clicking): confirm key anchors are present
    ["contacts","partners","pipeline","calendar","documents","reports"].forEach(t=>{
      const el = document.querySelector(`[data-tab="${t}"]`);
      out.tabs.push({ tab:t, present: !!el });
    });
    // 2) Minimal data probes
    try { out.data.contacts = (await window.getAllContacts?.())?.length ?? null; }
    catch { out.data.contacts = null; }
    try { out.data.partners = (await window.getAllPartners?.())?.length ?? null; }
    catch { out.data.partners = null; }
    // 3) Render path sanity
    out.renderPath = (typeof window.renderAll === "function") || (typeof window.dispatchAppDataChanged === "function");
    console.info("[SMOKE]", out);
    return out;
  }

  // Expose publicly but don’t run automatically
  window.runSmoke = smoke;
})();
