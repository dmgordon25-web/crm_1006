/* eslint-disable no-console */
import { openMergeModal } from "/js/ui/merge_modal.js";
import { mergePartners, pickWinnerPartner } from "/js/merge/merge_core.js";

// ---- Minimal DB helpers (match contacts orchestrator patterns) ----
async function dbGetSafe(store, id) {
  if (typeof window.dbGet === "function") return window.dbGet(store, id);
  if (typeof window.withStore === "function" && typeof window.openDB === "function") {
    return new Promise(async (resolve, reject) => {
      try {
        await window.withStore(store, "readonly", (st) => {
          const req = st.get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = (e) => reject(e);
        });
      } catch (e) { reject(e); }
    });
  }
  throw new Error("dbGet not available");
}
async function dbPutSafe(store, value, key) {
  if (typeof window.dbPut === "function") return window.dbPut(store, value, key);
  if (typeof window.withStore === "function" && typeof window.openDB === "function") {
    return new Promise(async (resolve, reject) => {
      try {
        await window.withStore(store, "readwrite", (st) => {
          const req = key != null ? st.put(value, key) : st.put(value);
          req.onsuccess = () => resolve(req.result);
          req.onerror = (e) => reject(e);
        });
      } catch (e) { reject(e); }
    });
  }
  throw new Error("dbPut not available");
}
async function dbDeleteSafe(store, key) {
  if (typeof window.dbDelete === "function") return window.dbDelete(store, key);
  if (typeof window.withStore === "function" && typeof window.openDB === "function") {
    return new Promise(async (resolve, reject) => {
      try {
        await window.withStore(store, "readwrite", (st) => {
          const req = st.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = (e) => reject(e);
        });
      } catch (e) { reject(e); }
    });
  }
  return false;
}

// Update partnerId references in any store that uses it
async function relinkPartnerReferences(winnerId, loserId) {
  const candidateStores = ["contacts", "deals", "opportunities", "activities", "notes", "documents"]; // will filter to real ones
  const exists = [];
  if (typeof window.openDB !== "function") return;

  // Discover which stores actually exist
  try {
    await window.withStore(null, "readonly", (st) => {}); // no-op but ensures DB open
    const db = window.__DB__ || window.__db__ || null; // if code exposes DB; otherwise we try blindly
    // If we can’t introspect, proceed with candidateStores and catch per-store failures
  } catch(_) {}

  for (const store of candidateStores) {
    try {
      await window.withStore(store, "readonly", () => {});
      exists.push(store);
    } catch (_) { /* store not present; skip */ }
  }

  for (const store of exists) {
    try {
      await window.withStore(store, "readwrite", (st) => {
        const req = st.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const val = cursor.value || {};
          if (val.partnerId === loserId) {
            val.partnerId = winnerId;
            const putReq = cursor.update(val);
            putReq.onsuccess = () => {};
          }
          cursor.continue();
        };
      });
    } catch (e) {
      console.warn("[partners:relink] failed store", store, e);
    }
  }
}

export async function openPartnersMergeByIds(idA, idB) {
  const [a, b] = await Promise.all([dbGetSafe("partners", idA), dbGetSafe("partners", idB)]);
  if (!a || !b) {
    const error = new Error("partners not found");
    console.error("[merge] partners not found", { idA, idB, a: !!a, b: !!b });
    return { status: "error", error };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    openMergeModal({
      kind: "partners",
      recordA: a,
      recordB: b,
      onConfirm: async (picks) => {
        try {
          const winner = pickWinnerPartner(a, b); // "A" or "B"
          const winnerRec = winner === "A" ? a : b;
          const loserRec  = winner === "A" ? b : a;
          const winnerId  = winnerRec.id ?? idA;
          const loserId   = loserRec.id  ?? idB;

          const merged = mergePartners(a, b, picks);
          merged.id = winnerId;

          await dbPutSafe("partners", merged, winnerId);
          await relinkPartnerReferences(winnerId, loserId);
          await dbDeleteSafe("partners", loserId);

          try { window.Selection?.clear?.(); } catch(_) {}
          try {
            const evt = new CustomEvent("selection:change", { detail: { clearedBy: "merge-partners" }});
            window.dispatchEvent(evt);
          } catch(_) {}
          try { window.dispatchAppDataChanged?.("partners:merge"); } catch(_) {}

          finish({ status: "ok", winnerId, loserId, merged });
        } catch (err) {
          console.error("[merge] partners failed", err);
          finish({ status: "error", error: err });
        }
      },
      onCancel: () => finish({ status: "cancel" })
    });
  });
}
