/* eslint-disable no-console */
import { openMergeModal } from "/js/ui/merge_modal.js";
import { mergeContacts, pickWinnerContact } from "/js/merge/merge_core.js";

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
  // Soft fallback: do nothing (not ideal but avoids crash)
  console.warn("[merge] dbDelete not available; loser not deleted");
  return false;
}

export async function openContactsMergeByIds(idA, idB) {
  const [a, b] = await Promise.all([dbGetSafe("contacts", idA), dbGetSafe("contacts", idB)]);
  if (!a || !b) {
    console.error("[merge] contacts not found", { idA, idB, a: !!a, b: !!b });
    return { status: "error", error: new Error("contacts not found") };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    openMergeModal({
      kind: "contacts",
      recordA: a,
      recordB: b,
      onConfirm: async (picks) => {
        try {
          const winner = pickWinnerContact(a, b); // "A" or "B"
          const winnerRec = winner === "A" ? a : b;
          const loserRec  = winner === "A" ? b : a;
          const winnerId  = winnerRec.id ?? idA;
          const loserId   = loserRec.id  ?? idB;

          const merged = mergeContacts(a, b, picks);
          // Preserve primary key of winner
          merged.id = winnerId;

          await dbPutSafe("contacts", merged, winnerId);
          await dbDeleteSafe("contacts", loserId);

          // Clear selection and repaint once
          try { window.Selection?.clear?.(); } catch(_) {}
          try {
            const evt = new CustomEvent("selection:changed", { detail: { clearedBy: "merge" }});
            window.dispatchEvent(evt);
          } catch(_) {}
          try { window.dispatchAppDataChanged?.("contacts:merge"); } catch(_) {}

          finish({ status: "ok", winnerId, loserId, merged });
        } catch (err) {
          console.error("[merge] failed", err);
          finish({ status: "error", error: err });
        }
      },
      onCancel: () => finish({ status: "cancel" })
    });
  });
}
