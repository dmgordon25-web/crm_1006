// Purpose: Hard-wire diagnostics_quiet (prod-only) and contact_stage_tracker (always) with guards.
// Invariants: JS-only, idempotent, respects DEBUG env, never blocks boot, never throws.

(() => {
  if (window.__WIRED_WIRE_DIAG_STAGE__) return;
  window.__WIRED_WIRE_DIAG_STAGE__ = true;

  // Small scheduler that waits for app readiness without assumptions.
  const whenAppReady = (fn) => {
    // Prefer an explicit app event if your app emits one.
    if (!window.__APP_READY_LISTENED__) {
      window.__APP_READY_LISTENED__ = true;
      window.addEventListener?.("app:ready", () => { try { fn(); } catch (_) {} }, { once: true });
    }
    // Fallback: wait for DOM + a few rAFs so core mounts and globals settle.
    const onDom = () => {
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame.bind(window) : null;
      if (!raf) {
        try { fn(); } catch (_) {}
        return;
      }
      let ticks = 0;
      const tick = () => {
        ticks++;
        if (ticks >= 3) { try { fn(); } catch (_) {} return; }
        raf(tick);
      };
      raf(tick);
    };
    if (document.readyState === "complete" || document.readyState === "interactive") onDom();
    else document.addEventListener("DOMContentLoaded", onDom, { once: true });
  };

  const safeImport = async (path) => {
    try {
      return await import(path);
    } catch (err) {
      // Quietly log once in dev only
      if (window.__ENV__?.DEBUG) console.warn("[wire] failed import:", path, err);
      return null;
    }
  };

  whenAppReady(async () => {
    const DEBUG = !!(window.__ENV__?.DEBUG || (typeof localStorage !== "undefined" && localStorage.DEBUG === "1"));

    // 1) diagnostics_quiet: enable in prod only (skip in dev so you still see logs)
    if (!DEBUG && !window.__DIAGNOSTICS_QUIET_ACTIVE__) {
      const dq = await safeImport("/js/diagnostics_quiet.js");
      try {
        if (dq?.enableQuiet) dq.enableQuiet();
        else if (typeof dq?.default === "function") dq.default();
        else if (typeof window.DIAGNOSTICS_QUIET?.enable === "function") window.DIAGNOSTICS_QUIET.enable();
        window.__DIAGNOSTICS_QUIET_ACTIVE__ = true;
        if (window.__ENV__?.DEBUG) console.log("[wire] diagnostics_quiet enabled");
      } catch (e) {
        if (window.__ENV__?.DEBUG) console.warn("[wire] diagnostics_quiet error (non-fatal)", e);
      }
    }

    // 2) contact_stage_tracker: wire into Contacts UI
    if (!window.__CONTACT_STAGE_TRACKER_WIRED__) {
      const cst = await safeImport("/js/contact_stage_tracker.js");
      try {
        // Preferred modern export
        if (cst?.wire) cst.wire(window.App || window);
        else if (typeof cst?.default === "function") cst.default(window.App || window);
        // Legacy global adapter (if the module exposes a global hook)
        else if (window.ContactStageTracker?.wire) window.ContactStageTracker.wire(window.App || window);

        window.__CONTACT_STAGE_TRACKER_WIRED__ = true;

        // Optional: if the tracker exposes a small sanity check, call it safely
        if (typeof cst?.selfTest === "function") {
          try { cst.selfTest?.(); } catch {}
        }

        // Log in dev only
        if (window.__ENV__?.DEBUG) console.log("[wire] contact_stage_tracker wired");
      } catch (e) {
        if (window.__ENV__?.DEBUG) console.warn("[wire] contact_stage_tracker error (non-fatal)", e);
      }
    }
  });
})();
