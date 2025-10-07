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

async function dbBulkPutSafe(store, list = []) {
  if (typeof window.dbBulkPut === "function") return window.dbBulkPut(store, list);
  if (typeof window.withStore === "function" && typeof window.openDB === "function") {
    const items = Array.isArray(list) ? list : [];
    return window.withStore(store, "readwrite", (st) => new Promise((resolve, reject) => {
      if (!items.length) { resolve(true); return; }
      let index = 0;
      const next = () => {
        if (index >= items.length) { resolve(true); return; }
        const entry = items[index++];
        try {
          const req = st.put(entry);
          req.onsuccess = next;
          req.onerror = (e) => reject(e);
        } catch (err) { reject(err); }
      };
      next();
    }));
  }
  throw new Error("dbBulkPut not available");
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

async function dbGetAllSafe(store) {
  if (typeof window.dbGetAll === "function") return window.dbGetAll(store);
  if (typeof window.withStore === "function" && typeof window.openDB === "function") {
    return window.withStore(store, "readonly", (st) => new Promise((resolve, reject) => {
      try {
        const req = st.getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result) ? req.result : [];
          resolve(list);
        };
        req.onerror = (e) => reject(e);
      } catch (err) { reject(err); }
    }));
  }
  throw new Error("dbGetAll not available");
}

function normalizeId(value) {
  return value == null ? "" : String(value);
}

async function reassignDependentRecords(winnerId, loserId) {
  const outcome = { tasks: 0, documents: 0 };
  const winnerKey = normalizeId(winnerId);
  const loserKey = normalizeId(loserId);
  if (!winnerKey || !loserKey || winnerKey === loserKey) return outcome;
  try {
    const [tasks, docs] = await Promise.all([
      dbGetAllSafe("tasks").catch(() => []),
      dbGetAllSafe("documents").catch(() => [])
    ]);
    const now = Date.now();
    const rewrite = (rows) => rows
      .filter(row => normalizeId(row?.contactId) === loserKey)
      .map(row => Object.assign({}, row, { contactId: winnerKey, updatedAt: now }));
    const taskUpdates = rewrite(Array.isArray(tasks) ? tasks : []);
    const docUpdates = rewrite(Array.isArray(docs) ? docs : []);
    if (taskUpdates.length) {
      await dbBulkPutSafe("tasks", taskUpdates);
      outcome.tasks = taskUpdates.length;
    }
    if (docUpdates.length) {
      await dbBulkPutSafe("documents", docUpdates);
      outcome.documents = docUpdates.length;
    }
  } catch (err) {
    console.warn("[merge] failed to reassign dependent records", err);
  }
  return outcome;
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
          const rewired = await reassignDependentRecords(winnerId, loserId);
          await dbDeleteSafe("contacts", loserId);

          // Clear selection and repaint once
          try {
            if (typeof window.Selection?.clear === "function") window.Selection.clear("merge");
          } catch (_) {}
          try {
            if (typeof window.SelectionService?.clear === "function") window.SelectionService.clear("merge");
          } catch (_) {}
          try {
            const evt = new CustomEvent("selection:changed", { detail: { clearedBy: "merge" }});
            window.dispatchEvent(evt);
          } catch (_) {}
          try {
            const detail = { source: "contacts:merge", winnerId, loserId, rewired };
            window.dispatchAppDataChanged?.(detail);
          } catch (_) {}

          finish({ status: "ok", winnerId, loserId, merged, rewired });
        } catch (err) {
          console.error("[merge] failed", err);
          finish({ status: "error", error: err });
        }
      },
      onCancel: () => finish({ status: "cancel" })
    });
  });
}
