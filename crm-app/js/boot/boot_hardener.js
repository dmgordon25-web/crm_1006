/* eslint-disable no-console */
/* ===== Safe Boot: disable runtime patch imports, guarantee app boot ===== */
(() => {
  if (window.__SAFEBOOT_WIRED__) return;
  window.__SAFEBOOT_WIRED__ = true;

  // Default to Safe Boot unless explicitly turned on via URL/localStorage.
  function q(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }
  const enablePatches = (q("patches")==="on") || (localStorage.getItem("crm:patches")==="on");

  // Hard disable known globals that feed patch loaders
  window.PATCHES = enablePatches ? (window.PATCHES || []) : [];
  window.LEGACY_PATCHES = enablePatches ? (window.LEGACY_PATCHES || []) : [];
  window.__EXTRA_PATCHES__ = enablePatches ? (window.__EXTRA_PATCHES__ || []) : [];

  // Monkeypatch a common loader function name if present
  const noOpLoader = async () => {
    console.warn("[SafeBoot] Runtime patch importing is disabled. Enable with ?patches=on");
    return { ok:0, fail:0, skipped: (window.PATCHES||[]).length };
  };
  if (!enablePatches) {
    if (typeof window.loadPatches === "function") window.loadPatches = noOpLoader;
    if (typeof window.loadAllPatches === "function") window.loadAllPatches = noOpLoader;
    // Guard dynamic loops if code calls them directly later
    window.__IMPORT_PATCHES__ = noOpLoader;
  }

  // Single repaint to keep contract
  try { window.dispatchAppDataChanged?.("boot:safemode"); } catch {}
})();

// Deterministic boot hardener — top-level export, no conditional exports.
export async function ensureCoreThenPatches(manifest = {}) {
  // De-dup concurrent callers
  if (window.__BOOT_HARDENER_PROMISE__) return window.__BOOT_HARDENER_PROMISE__;
  window.__BOOT_HARDENER_PROMISE__ = (async () => {
    // Normalize telemetry arrays; tolerate legacy {ok,fail}
    const tl = window.__PATCHES_LOADED__;
    const tf = window.__PATCHES_FAILED__;
    window.__PATCHES_LOADED__ = Array.isArray(tl) ? tl.slice()
      : (tl && typeof tl === "object" && Array.isArray(tl.ok)) ? tl.ok.slice() : [];
    window.__PATCHES_FAILED__ = Array.isArray(tf) ? tf.slice()
      : (tf && typeof tf === "object" && Array.isArray(tf.fail)) ? tf.fail.slice() : [];

    const acc = { loaded: [], failed: [] };

    function corePrereqsReady() {
      return typeof window.openDB === "function" && !!(window.Selection || window.SelectionService);
    }

    async function importOne(path) {
      if (!path || typeof path !== "string") return;
      try {
        const baseEl = typeof document !== "undefined"
          ? document.querySelector?.("base")
          : null;
        const loc = typeof window !== "undefined" ? window.location : undefined;
        const baseHint = (baseEl?.href)
          || (typeof document !== "undefined" ? document.baseURI : null)
          || (loc?.href)
          || "/";
        let baseUrl = null;
        try {
          baseUrl = new URL(baseHint, loc?.href || undefined);
        } catch (_) {
          try {
            const origin = loc?.origin;
            baseUrl = origin ? new URL(baseHint, origin + "/") : null;
          } catch (__){
            baseUrl = null;
          }
        }
        const baseDir = baseUrl ? new URL(".", baseUrl).href : null;
        const resolveRelative = (input) => {
          if (baseDir) {
            return new URL(input, baseDir).href;
          }
          const origin = loc?.origin;
          if (origin) {
            return new URL(input, origin + "/").href;
          }
          return new URL(input, "/").href;
        };
        let spec;
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(path)) {
          spec = path;
        } else if (path.startsWith("//")) {
          const protocol = loc?.protocol || "https:";
          spec = `${protocol}${path}`;
        } else if (path.startsWith("/")) {
          const trimmed = path.replace(/^\/+/, "");
          spec = resolveRelative(trimmed);
        } else {
          spec = resolveRelative(path);
        }
        await import(spec);
        acc.loaded.push(spec);
        if (!window.__PATCHES_LOADED__.includes(spec)) window.__PATCHES_LOADED__.push(spec);
      } catch (err) {
        acc.failed.push(path);
        if (!window.__PATCHES_FAILED__.includes(path)) window.__PATCHES_FAILED__.push(path);
        console.error("[boot] failed to import", path, err);
      }
    }

    async function importSeq(list) {
      for (const p of (list || [])) {
        // eslint-disable-next-line no-await-in-loop
        await importOne(p);
      }
    }

    async function headOk(url){
      try {
        const r = await fetch(url, { method:"HEAD", cache:"no-store" });
        return !!(r && r.ok);
      } catch { return false; }
    }

    async function exists(url){
      if (await headOk(url)) return true;
      try {
        const r = await fetch(url, { method:"GET", cache:"no-store" });
        return !!(r && r.ok && (r.headers.get("content-type")||"").includes("javascript"));
      } catch { return false; }
    }

    async function importPatchList(urls, strictFail){
      let ok = 0;
      let fail = 0;
      let missing = 0;
      for (const base of urls){
        const u = base + (base.includes("?") ? "&" : "?") + "v=" + (window.APP_VERSION || window.__BUILD_ID__ || Date.now());
        const has = await exists(u);
        if (!has){
          missing++;
          const msg = `[patch-loader] missing → ${base}`;
          if (strictFail){
            console.error(msg);
            throw new Error(msg);
          } else {
            console.warn(msg);
            continue;
          }
        }
        try {
          await import(u);
          ok++;
        } catch (e) {
          fail++;
          const em = e && (e.message || e.toString());
          if (strictFail){
            throw new Error(`[patch-loader] import failed → ${base} :: ${em}`);
          } else {
            console.warn("[patch-loader] import failed (continuing) →", base, em);
          }
        }
      }
      return { ok, fail, missing };
    }

    const CORE = Array.isArray(manifest.CORE) ? manifest.CORE : [];
    const PATCHES = Array.isArray(manifest.PATCHES) ? manifest.PATCHES : [];

    // CORE → PATCHES (strict order)
    await importSeq(CORE);
    if (!corePrereqsReady() && CORE.length) {
      console.warn("[boot] core prereqs missing after pass 1; retrying CORE once");
      await importSeq(CORE);
    }

    // === Forced-Reliable Patch Loader (Safe Mode + Hard-Fail) ===
    if (typeof window.__IMPORT_PATCHES__ === "function") {
      await window.__IMPORT_PATCHES__();
    } else {
      const runPatchLoader = () => {
        if (window.__PATCH_LOADER_PROMISE__) return window.__PATCH_LOADER_PROMISE__;
        window.__PATCH_LOADER_PROMISE__ = (async () => {
          window.__PATCH_LOADER_WIRED__ = true;

          function q(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }
          const WANT_PATCHES = (q("patches")==="on") || (localStorage.getItem("crm:patches")==="on");
          const STRICT_FAIL  = (q("strict")==="1") || (localStorage.getItem("crm:strictBoot")==="1");

          const manifestPatches = Array.isArray(PATCHES) ? PATCHES : [];
          const legacy          = Array.isArray(window.LEGACY_PATCHES) ? window.LEGACY_PATCHES : [];
          const extras          = Array.isArray(window.__EXTRA_PATCHES__) ? window.__EXTRA_PATCHES__ : [];

          const rawList = [...manifestPatches, ...extras, ...legacy];
          const seen = new Set();
          const list = [];
          const norm = (u) => {
            if (!u) return null;
            let s = String(u).trim();
            if (!s) return null;
            if (!s.startsWith("/")) s = s.startsWith("js/") ? "/" + s : s.replace(/^\.?\/*/, "/");
            if (/\.js($|\?)/.test(s) && !s.startsWith("/js/")) {
              if (s === "/calendar_actions.js") s = "/js/calendar_actions.js";
            }
            return s;
          };
          for (const r of rawList) {
            const n = norm(r);
            if (!n || seen.has(n)) continue;
            seen.add(n);
            list.push(n);
          }

          console.info("[patch-loader] sources: manifest=%d extras=%d legacy=%d", manifestPatches.length, extras.length, legacy.length);
          console.debug("[patch-loader] manifest:", manifestPatches);
          if (extras.length) console.debug("[patch-loader] extras:", extras);
          if (legacy.length) console.debug("[patch-loader] legacy:", legacy);
          console.info("[patch-loader] normalized unique list size =", list.length);

          if (!WANT_PATCHES){
            console.warn("[patch-loader] Safe Mode: skipping all patches (enable with ?patches=on or localStorage crm:patches=on).");
            window.__PATCHES_SUMMARY__ = { ok:0, fail:0, skipped:list.length, mode:"safe" };
            try { window.dispatchAppDataChanged?.("boot:safe-mode"); } catch {}
            return true;
          }

          try {
            const res = await importPatchList(list, STRICT_FAIL);
            console.info("[boot] patches completed: ok:%d fail:%d missing:%d mode:%s", res.ok, res.fail, res.missing, "patches-on");
            window.__PATCHES_SUMMARY__ = { ...res, mode:"patches-on" };

            if ((res.missing > 0 || res.fail > 0) && !STRICT_FAIL){
              console.warn("[patch-loader] Detected missing/failing patches → enabling Safe Mode and re-running without patches.");
              sessionStorage.setItem("crm:safeOnce", "1");
              window.__PATCHES_SUMMARY__ = { ok:0, fail:0, skipped:list.length, mode:"safe" };
            }
            try { window.dispatchAppDataChanged?.("boot:patches-loaded"); } catch {}
            return true;
          } catch (e) {
            console.error("[boot] ABORT (strict):", e?.message || e);
            alert("CRM failed to boot (strict mode). Check console for the first missing/failed patch. Disable strict with ?strict=0 or localStorage crm:strictBoot=0.");
            throw e;
          }
        })();
        return window.__PATCH_LOADER_PROMISE__;
      };

      window.__IMPORT_PATCHES__ = () => runPatchLoader();
      await runPatchLoader();
    }

    window.__BOOT_DONE__ = {
      loaded: Array.from(new Set(acc.loaded)),
      failed: Array.from(new Set(acc.failed)),
      patches: window.__PATCHES_SUMMARY__ || null,
    };

    // Expose diagnostics helper without side effects
    window.__BOOT_HARDENER__ = Object.assign(window.__BOOT_HARDENER__ || {}, { corePrereqsReady });

    // Double-rAF repaint
    try {
      const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
      raf(() => raf(() => window.renderAll?.()));
    } catch (_) {}

    if (window.__BOOT_DONE__.failed.length) {
      console.warn("[boot] completed with failures:", window.__BOOT_DONE__.failed);
    } else {
      console.log("[boot] ok:", window.__BOOT_DONE__.loaded.length, "fail:0");
    }

    return window.__BOOT_DONE__;
  })();
  return window.__BOOT_HARDENER_PROMISE__;
}
