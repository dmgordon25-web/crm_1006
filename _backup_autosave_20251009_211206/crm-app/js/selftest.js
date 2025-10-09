import { CORE, PATCHES } from "./boot/manifest.js";

const DEV = window.__DEV__ === true;
let bannerLogged = false;

function ensureDiagCounters() {
  const diag = window.__DIAG__ || (window.__DIAG__ = {});
  const boot = typeof diag.boot === 'object' && diag.boot !== null ? diag.boot : (diag.boot = {});
  if (typeof boot.ok !== 'number') boot.ok = boot.ok || 0;
  if (typeof boot.fail !== 'number') boot.fail = boot.fail || 0;
  const render = typeof diag.render === 'object' && diag.render !== null ? diag.render : (diag.render = {});
  if (typeof render.paints !== 'number') render.paints = render.paints || 0;
  if (typeof render.jank !== 'number') render.jank = render.jank || 0;
  return diag;
}

function logDev(message, ...args) {
  if (!DEV) return;
  console.info(message, ...args);
}

function resolveLoadedPatches() {
  const loaded = Array.isArray(window.__PATCHES_LOADED__) ? window.__PATCHES_LOADED__ : [];
  if (!Array.isArray(window.__PATCHES_LOADED__)) {
    window.__PATCHES_LOADED__ = loaded;
  }
  return loaded;
}

export async function runSelfTest() {
  ensureDiagCounters();

  const coreCount = Array.isArray(CORE) ? CORE.length : 0;
  const manifestPatches = Array.isArray(PATCHES) ? PATCHES.filter(Boolean) : [];
  const patchesEnabled = window.__PATCHES_ENABLED__ === true;
  const loadedPatches = resolveLoadedPatches();
  const summary = typeof window.__BOOT_SUMMARY__ === 'object' ? window.__BOOT_SUMMARY__ : null;
  const patchCount = patchesEnabled ? loadedPatches.length : 0;
  const finalCore = typeof summary?.core === 'number' ? summary.core : coreCount;
  const finalPatches = typeof summary?.patches === 'number' ? summary.patches : patchCount;

  logDev('[selftest] CORE modules:', coreCount);
  if (patchesEnabled) {
    logDev('[selftest] PATCHES loaded:', patchCount);
    if (DEV) {
      const missing = manifestPatches.filter((url) => !loadedPatches.includes(url));
      if (missing.length) {
        console.warn('[selftest] Missing patches:', missing.join(', '));
      }
    }
  } else {
    logDev('[selftest] SafeBoot: patches disabled');
  }

  if (!bannerLogged && !window.__BOOT_BANNER__) {
    console.log('%cBoot OK — CORE:%d, PATCHES:%d', 'color: #02b302', finalCore, finalPatches);
    bannerLogged = true;
    window.__BOOT_BANNER__ = true;
  } else if (!bannerLogged) {
    console.log('%cBoot OK — CORE:%d, PATCHES:%d', 'color: #02b302', finalCore, finalPatches);
    bannerLogged = true;
  }
}

ensureDiagCounters();
Promise.resolve().then(runSelfTest).catch((err) => {
  if (DEV) console.error('[selftest] execution failed', err);
});

if (typeof window !== 'undefined') {
  window.runSelfTest = runSelfTest;
}

export default { runSelfTest };
