/* crm-app/js/boot/boot_hardener.js
 * SafeBoot guard + deterministic module loader + single overlay on fatal.
 * No half-rendered UI. One success path (Boot OK), one fail path (overlay).
 */

const q = new URLSearchParams(location.search);
const LS = window.localStorage;

function ensureDiag() {
  const diag = window.__DIAG__ || {};

  const boot =
    diag.boot && typeof diag.boot === "object" ? diag.boot : (diag.boot = {});
  if (typeof boot.fail !== "number") boot.fail = 0;
  if (typeof boot.ok !== "number") boot.ok = 0;
  if (typeof boot.modulesFail !== "number") boot.modulesFail = 0;

  const render =
    diag.render && typeof diag.render === "object"
      ? diag.render
      : (diag.render = {});
  if (typeof render.paints !== "number") render.paints = 0;
  if (typeof render.jank !== "number") render.jank = 0;

  const importer =
    diag.import && typeof diag.import === "object"
      ? diag.import
      : (diag.import = { runs: 0, contacts: 0, partners: 0 });
  if (typeof importer.runs !== "number") importer.runs = 0;
  if (typeof importer.contacts !== "number") importer.contacts = 0;
  if (typeof importer.partners !== "number") importer.partners = 0;

  return (window.__DIAG__ = diag);
}

// Flags (sticky via localStorage if caller wants):
const STRICT = q.get("strict") === "1" || LS.getItem("crm:strictBoot") === "1";
const PATCHES_ENABLED =
  q.get("patches") === "on" || LS.getItem("crm:patches") === "on";

// Public markers:
window.__BOOT_OK__ = false;
window.__PATCHES_ENABLED__ = !!PATCHES_ENABLED;

// Cosmetic console helpers
const green = (...args) => console.log("%c" + args.join(" "), "color: #16a34a");
const yellow = (...args) => console.log("%c" + args.join(" "), "color: #ca8a04");
const red = (...args) => console.error("%c" + args.join(" "), "color: #dc2626");

// Create or update a fail overlay without requiring HTML changes.
function showFailOverlay(code, detail) {
  let el = document.getElementById("boot-fail");
  const style = `
    position:fixed;inset:0;z-index:99999;background:#0b0f19;color:#fff;
    display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif
  `;
  const box = `
    max-width:900px;width:100%;background:#111827;border:1px solid #374151;
    border-radius:12px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.5)
  `;
  const pre = `
    margin-top:12px;background:#0b1220;color:#93c5fd;border:1px solid #1f2937;
    border-radius:8px;padding:12px;max-height:40vh;overflow:auto;font-size:12px
  `;
  if (!el) {
    el = document.createElement("div");
    el.id = "boot-fail";
    document.body.appendChild(el);
  }
  el.setAttribute("style", style);
  el.innerHTML = `
    <div style="${box}">
      <div style="font-size:18px;margin-bottom:6px">Boot failed</div>
      <div style="opacity:.9">SafeBoot blocked startup due to a fatal error.</div>
      <div style="margin-top:10px;font-weight:600;color:#fca5a5">Error: ${code}</div>
      <pre style="${pre}">${(detail ?? "").toString().slice(0, 8000)}</pre>
      <div style="margin-top:12px;opacity:.8;font-size:12px">
        Tip: Remove <code>?strict=1</code> or set <code>localStorage['crm:strictBoot']='0'</code> to allow SafeBoot recovery.
      </div>
    </div>
  `;
}

function fatal(code, err) {
  try {
    ensureDiag().boot.fail += 1;
  } catch (_err) {}
  red("[BOOT:FATAL]", code, err?.message || err);
  if (STRICT) {
    try { showFailOverlay(code, (err && (err.stack || err.message)) || err); }
    catch (e) { /* ignore secondary failures */ }
    throw err instanceof Error ? err : new Error(code);
  } else {
    // In non-strict, we still render core-only if possible; overlay is suppressed.
    red("[BOOT:RECOVERABLE]", code, "Continuing in SafeBoot (non-strict).");
  }
}

// Resolve import URLs to work in both http(s) and file:// contexts without HTML edits.
function resolveUrl(u) {
  // Already absolute http(s) — keep as-is.
  if (/^https?:\/\//i.test(u)) return u;

  // If path starts with "/", treat it as app-rooted when on http(s),
  // but when on file:// or custom scheme (app://), convert it to a relative path
  // based on the current script directory (/js/boot/).
  const isAbsoluteRooted = u.startsWith("/");
  const isHttpish = location.protocol === "http:" || location.protocol === "https:";

  if (isAbsoluteRooted && isHttpish) return u;

  // Compute a relative from /js/boot/ to the target /js/... when not http(s)
  // boot_hardener.js lives in /js/boot/, so strip leading "/" and prefix "../"
  const stripped = isAbsoluteRooted ? u.slice(1) : u.replace(/^\.?\/*/, "");
  // If someone passed "js/..." keep it; else assume "js/..."
  const path = stripped.startsWith("js/") ? stripped : ("js/" + stripped);
  return new URL("../" + path, import.meta.url).toString();
}

// Loader helpers: module import with unified error handling
async function importOne(url) {
  try {
    const resolved = resolveUrl(url);
    return await import(resolved);
  } catch (err) {
    try {
      ensureDiag().boot.modulesFail += 1;
    } catch (_err) {}
    fatal("E-MODULE-IMPORT:" + url, err);
  }
}

// Ensure we never load patch_* files unless explicitly allowed
function isPatchUrl(u) {
  return /\/js\/patch_[0-9]{4}-[0-9]{2}-[0-9]{2}_.+\.js$/i.test(u);
}

// Main ensure function
export async function ensureCoreThenPatches({ CORE, PATCHES }) {
  if (!Array.isArray(CORE) || CORE.length === 0) {
    fatal("E-NO-CORE", "Manifest CORE list is empty or invalid");
    return;
  }

  // Guard against accidental patch refs
  if (PATCHES && PATCHES.length && !PATCHES_ENABLED) {
    yellow("Patches listed in manifest but disabled by SafeBoot (expected).");
  }

  // 1) Load CORE deterministically
  for (const url of CORE) {
    if (isPatchUrl(url)) fatal("E-PATCH-IN-CORE", url);
    await importOne(url);
  }

  // 2) Optionally load PATCHES (only when explicitly enabled)
  let patchesLoaded = 0;
  if (PATCHES_ENABLED && Array.isArray(PATCHES) && PATCHES.length) {
    yellow("UNSAFE MODE: patches enabled — this is for developer testing only.");
    for (const url of PATCHES) {
      if (!isPatchUrl(url)) fatal("E-NONPATCH-IN-PATCHES", url);
      await importOne(url);
      patchesLoaded++;
    }
  }

  // 3) Tiny self-test (non-destructive)
  try {
    const { selfTest } = await import("./selftest.js");
    await selfTest();
  } catch (err) {
    fatal("E-SELFTEST", err);
  }

  // 4) Mark Boot OK (single green line) — apps can key off this
  window.__BOOT_OK__ = true;
  const coreCount = CORE.length;
  green(`Boot OK — CORE:${coreCount}, PATCHES:${patchesLoaded}`);

  // Quiet counters for diagnostics (no UI chrome)
  const diag = ensureDiag();
  diag.boot.ok += 1;

  window.__DIAG__ = diag;

  // DEV-only badge (opt-in via ?badge=1 or localStorage['crm:badge']='1')
  const BADGE = q.get("badge") === "1" || LS.getItem("crm:badge") === "1";
  if (BADGE) {
    const b = document.createElement("div");
    b.textContent = "Boot OK";
    b.style.cssText =
      "position:fixed;right:8px;bottom:8px;background:#10b981;color:#071e14;padding:6px 10px;border-radius:999px;font:12px system-ui;z-index:99999";
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2500);
  }

  // Jank sentinel (measure long tasks > 120ms over 3s window; log one WARN)
  (function () {
    if (!("PerformanceObserver" in window)) return;
    try {
      let flagged = false;
      const obs = new PerformanceObserver((list) => {
        let long = 0;
        list.getEntries().forEach((e) => {
          if (e.duration >= 120) long++;
        });
        if (long > 0) {
          try {
            ensureDiag().render.jank += long;
          } catch (_err) {}
          if (!flagged) {
            flagged = true;
            console.warn(
              `[Perf] Long tasks detected: ${long} in recent interval`
            );
          }
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
      setTimeout(() => obs.disconnect(), 3000); // short burst during boot only
    } catch (_err) {}
  })();
}
