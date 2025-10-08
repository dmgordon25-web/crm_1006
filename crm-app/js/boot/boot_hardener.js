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

    /* ===== Loader Hardening Helpers ===== */
    if (!window.__LOADER_HARDEN__) {
      window.__LOADER_HARDEN__ = true;
      const patchVersionToken = window.APP_VERSION || window.__BUILD_ID__ || Date.now();

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
      const defaultOrigin = baseUrl?.origin || loc?.origin || "";
      const defaultProtocol = loc?.protocol || "https:";
      const resolveRelative = (input) => {
        if (!input) return null;
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input)) return input;
        if (input.startsWith("//")) return `${defaultProtocol}${input}`;
        const trimmed = input.replace(/^\/+/, "");
        if (baseDir) {
          return new URL(trimmed, baseDir).href;
        }
        if (defaultOrigin) {
          return new URL(trimmed, defaultOrigin + "/").href;
        }
        return new URL(trimmed, "/").href;
      };

      window.__normalizePatchUrl = function(u) {
        if (!u) return null;
        let s = String(u).trim();
        if (!s) return null;
        const absoluteLike = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(s) || s.startsWith("//");
        if (!absoluteLike) {
          s = s.replace(/^\.?\/*/, "");
          if (!s.startsWith("js/") && /\.js($|\?)/.test(s)) {
            if (s === "calendar_actions.js") s = "js/calendar_actions.js";
          }
        }
        if (s.includes("?")) {
          s += "&v=" + patchVersionToken;
        } else {
          s += "?v=" + patchVersionToken;
        }
        return s;
      };

      window.__resolvePatchUrl = function(url) {
        if (!url) return null;
        return resolveRelative(url);
      };

      window.__headOk = async function(url) {
        try {
          const res = await fetch(url, { method: "HEAD", cache: "no-store" });
          return res && res.ok;
        } catch { return false; }
      };

      window.__listExisting = async function(list) {
        const seen = new Set();
        const ok = [];
        const miss = [];
        for (const raw of (list || [])) {
          const normalized = window.__normalizePatchUrl(raw);
          const url = window.__resolvePatchUrl(normalized);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          let exists = await window.__headOk(url);
          if (!exists) {
            try {
              const res = await fetch(url, { method: "GET", cache: "no-store" });
              exists = res && res.ok && (res.headers.get("content-type") || "").includes("javascript");
            } catch { exists = false; }
          }
          (exists ? ok : miss).push({ raw, url });
        }
        return { ok, miss };
      };
    }

    /* ===== Identify Patch Sources ===== */
    const manifestPatches = PATCHES;
    const legacy = (window.LEGACY_PATCHES || window.__PATCHES_FALLBACK__ || []);
    const extras = (window.__EXTRA_PATCHES__ || []);
    console.info("[loader] patch sources: manifest=%d legacy=%d extras=%d",
      manifestPatches.length, legacy.length, extras.length);
    console.debug("[loader] manifest PATCHES =", manifestPatches);
    if (legacy.length) console.debug("[loader] LEGACY_PATCHES =", legacy);
    if (extras.length) console.debug("[loader] __EXTRA_PATCHES__ =", extras);

    const rawPatches = [...manifestPatches, ...legacy, ...extras];

    /* ===== Filter + Import Patches ===== */
    const { ok, miss } = await window.__listExisting(rawPatches);
    if (miss.length) {
      console.warn("[loader] %d missing/404 patches will be skipped (showing first 10):", miss.length);
      miss.slice(0, 10).forEach(m => console.warn("  - missing:", m.raw, "→", m.url));
    }

    let okCount = 0, failCount = 0;
    for (const item of ok) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await import(item.url);
        okCount++;
        acc.loaded.push(item.url);
        if (!window.__PATCHES_LOADED__.includes(item.url)) window.__PATCHES_LOADED__.push(item.url);
      } catch (e) {
        failCount++;
        acc.failed.push(item.url);
        if (!window.__PATCHES_FAILED__.includes(item.url)) window.__PATCHES_FAILED__.push(item.url);
        console.warn("[loader] import failed but continuing:", item.raw, "→", item.url, e?.message || e);
      }
    }

    console.info("[boot] patches completed: ok:%d fail:%d (skipped missing:%d)", okCount, failCount, miss.length);
    window.__PATCHES_SUMMARY__ = { ok: okCount, fail: failCount, skipped: miss.length };

    try { window.dispatchAppDataChanged?.("boot:patches-loaded"); } catch {}

    window.__BOOT_DONE__ = {
      loaded: Array.from(new Set(acc.loaded)),
      failed: Array.from(new Set(acc.failed)),
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
