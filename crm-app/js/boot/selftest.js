/* crm-app/js/boot/selftest.js
 * Quiet, non-destructive probes to ensure basic services exist.
 * In strict mode, failures will be surfaced by boot_hardener.
 */

export async function selfTest() {
  // 1) Required globals (render path)
  if (typeof window !== "object") throw new Error("window missing");
  if (typeof window.requestAnimationFrame !== "function") {
    throw new Error("rAF missing");
  }

  // 2) Render path contract (presence checks only — no UI mutation here)
  if (typeof window.renderAll !== "function" &&
      typeof window.dispatchAppDataChanged !== "function") {
    throw new Error("render pipeline entrypoint missing");
  }

  // 3) selectionService (presence only)
  if (typeof window.selectionService === "undefined") {
    // Not fatal to boot if core intentionally defers this; mark soft warning.
    console.info("[Self-Test] selectionService not found (ok if deferred)");
  }

  // 4) IndexedDB availability (feature detect only)
  if (!("indexedDB" in window)) {
    throw new Error("IndexedDB not available");
  }

  // 5) Tiny async tick to ensure event loop is healthy
  await new Promise((r) => setTimeout(r, 0));

  console.info("Self-Test OK");
}
