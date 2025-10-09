/* services/version.js — central version stamp */
(function(){
  if (window.__WIRED_version) return; window.__WIRED_version = true;
  const dt = new Date();
  const ymd = dt.toISOString().slice(0,10);
  // Update this semver tag when we cut a release; keep date always fresh at boot time
  const tag = "vFinal-0.6";              // <— bump when shipping a new package
  window.__APP_VERSION__ = { tag, ymd, toString(){ return `${tag}-${ymd}`; } };
})();
