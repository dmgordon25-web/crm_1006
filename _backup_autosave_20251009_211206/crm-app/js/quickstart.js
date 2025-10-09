/* quickstart.js — tiny help text for devs (no UI) */
(function(){
  if (window.__WIRED_quickstart) return; window.__WIRED_quickstart = true;
  const msg = [
    "CRM Quickstart:",
    "1) Open crm-app/index.html (file:// or http) — SafeBoot is default.",
    "2) Run runSmoke() in console for a fast sanity check.",
    "3) Import JSON via [data-act='import-json'] or snapshotService.pickAndRestore().",
    "4) Export data: CSV/ICS buttons; snapshotService.downloadSnapshot().",
    "5) Dev toggles: ?strict=1 (fail overlay), ?badge=1 (Boot OK chip)."
  ].join("\n");
  window.showQuickstart = () => console.info(msg);
})();
