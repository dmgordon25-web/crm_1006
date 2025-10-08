/* eslint-disable no-console */
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

    const CORE = Array.isArray(manifest.CORE) ? manifest.CORE : [];
    const PATCHES = Array.isArray(manifest.PATCHES) ? manifest.PATCHES : [];

    // CORE → PATCHES (strict order)
    await importSeq(CORE);
    if (!corePrereqsReady() && CORE.length) {
      console.warn("[boot] core prereqs missing after pass 1; retrying CORE once");
      await importSeq(CORE);
    }

    // === Forced-Reliable Patch Loader (Safe Mode + Hard-Fail) ===
    (() => {
      if (window.__PATCH_LOADER_WIRED__) return;
      window.__PATCH_LOADER_WIRED__ = true;

      // ---- runtime toggles ----
      function q(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }
      const WANT_PATCHES = (q("patches")==="on") || (localStorage.getItem("crm:patches")==="on");
      const STRICT_FAIL  = (q("strict")==="1") || (localStorage.getItem("crm:strictBoot")==="1");

      // ---- normalize lists from possible sources ----
      const manifestPatches = (typeof PATCHES !== "undefined" && Array.isArray(PATCHES)) ? PATCHES : [];
      const legacy          = Array.isArray(window.LEGACY_PATCHES) ? window.LEGACY_PATCHES : [];
      const extras          = Array.isArray(window.__EXTRA_PATCHES__) ? window.__EXTRA_PATCHES__ : [];

      // Prefer manifest; legacy/extras often contain stale entries
      let rawList = [...manifestPatches, ...extras, ...legacy];

      // path normalize: ensure /js/ prefix for .js; make absolute; trim
      function norm(u){
        if (!u) return null;
        let s = String(u).trim();
        if (!s) return null;
        if (!s.startsWith("/")) s = s.startsWith("js/") ? "/" + s : s.replace(/^\.?\/*/, "/");
        if (/\.js($|\?)/.test(s) && !s.startsWith("/js/")) {
          if (s === "/calendar_actions.js") s = "/js/calendar_actions.js";
        }
        return s;
      }

      // de-dupe and normalize
      const seen = new Set();
      const list = [];
      for (const r of rawList) {
        const n = norm(r);
        if (!n) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        list.push(n);
      }

      // telemetry
      console.info("[patch-loader] sources: manifest=%d extras=%d legacy=%d", manifestPatches.length, extras.length, legacy.length);
      console.debug("[patch-loader] manifest:", manifestPatches);
      if (extras.length) console.debug("[patch-loader] extras:", extras);
      if (legacy.length) console.debug("[patch-loader] legacy:", legacy);
      console.info("[patch-loader] normalized unique list size =", list.length);

      // Helpers
      async function headOk(url){
        try {
          const r = await fetch(url, { method:"HEAD", cache:"no-store" });
          return !!(r && r.ok);
        } catch { return false; }
      }
      async function exists(url){
        // HEAD first; some static servers don’t implement HEAD—fallback GET
        if (await headOk(url)) return true;
        try {
          const r = await fetch(url, { method:"GET", cache:"no-store" });
          return !!(r && r.ok && (r.headers.get("content-type")||"").includes("javascript"));
        } catch { return false; }
      }

      async function importSequential(urls){
        let ok=0, fail=0, missing=0;
        for (const base of urls){
          const u = base + (base.includes("?") ? "&" : "?") + "v=" + (window.APP_VERSION || window.__BUILD_ID__ || Date.now());
          const has = await exists(u);
          if (!has){
            missing++;
            const msg = `[patch-loader] missing → ${base}`;
            if (STRICT_FAIL){
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
            if (STRICT_FAIL){
              throw new Error(`[patch-loader] import failed → ${base} :: ${em}`);
            } else {
              console.warn("[patch-loader] import failed (continuing) →", base, em);
            }
          }
        }
        return {ok, fail, missing};
      }

      async function run(){
        // If user didn’t explicitly enable patches, run completely in Safe Mode.
        if (!WANT_PATCHES){
          console.warn("[patch-loader] Safe Mode: skipping all patches (enable with ?patches=on or localStorage crm:patches=on).");
          window.__PATCHES_SUMMARY__ = { ok:0, fail:0, skipped:list.length, mode:"safe" };
          try { window.dispatchAppDataChanged?.("boot:safe-mode"); } catch {}
          return true;
        }

        // Try to import; if anything is missing and not STRICT_FAIL, fall back to Safe Mode (one-time) to guarantee boot.
        try {
          const res = await importSequential(list);
          console.info("[boot] patches completed: ok:%d fail:%d missing:%d mode:%s", res.ok, res.fail, res.missing, "patches-on");
          window.__PATCHES_SUMMARY__ = { ...res, mode:"patches-on" };

          // Auto fallback to Safe Mode if anything is missing and we’re not in strict mode
          if ((res.missing > 0 || res.fail > 0) && !STRICT_FAIL){
            console.warn("[patch-loader] Detected missing/failing patches → enabling Safe Mode and re-running without patches.");
            // Mark Safe Mode for this session only
            sessionStorage.setItem("crm:safeOnce", "1");
            // Re-run quickly by skipping patches but without a full reload
            window.__PATCHES_SUMMARY__ = { ok:0, fail:0, skipped:list.length, mode:"safe" };
          }
          try { window.dispatchAppDataChanged?.("boot:patches-loaded"); } catch {}
          return true;
        } catch (e) {
          // STRICT_FAIL path: stop boot hard and loud.
          console.error("[boot] ABORT (strict):", e?.message || e);
          alert("CRM failed to boot (strict mode). Check console for the first missing/failed patch. Disable strict with ?strict=0 or localStorage crm:strictBoot=0.");
          // Throw again to ensure upstream aborts; caller should catch to present a clean shutdown UI if available
          throw e;
        }
      }

      // Execute and expose a promise for diagnostics
      window.__PATCH_LOADER_PROMISE__ = run();
    })();

    await window.__PATCH_LOADER_PROMISE__;

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
