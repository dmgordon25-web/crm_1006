(function () {
  if (window.__WIRED_snapshot) return;
  window.__WIRED_snapshot = true;

  async function getAll(kind) {
    if (kind === "contacts" && typeof window.getAllContacts === "function") {
      return window.getAllContacts();
    }
    if (kind === "partners" && typeof window.getAllPartners === "function") {
      return window.getAllPartners();
    }
    if (kind === "settings" && typeof window.getSettings === "function") {
      return window.getSettings();
    }
    return [];
  }

  async function setAll(kind, rows) {
    if (!rows) return;
    if (kind === "contacts" && typeof window.saveContactsBulk === "function") {
      return window.saveContactsBulk(rows);
    }
    if (kind === "partners" && typeof window.savePartnersBulk === "function") {
      return window.savePartnersBulk(rows);
    }
    if (kind === "settings" && typeof window.saveSettings === "function") {
      return window.saveSettings(rows);
    }
  }

  async function exportSnapshot() {
    const [contacts, partners, settings] = await Promise.all([
      getAll("contacts"),
      getAll("partners"),
      getAll("settings"),
    ]);
    return {
      version: "snapshot/v1",
      at: new Date().toISOString(),
      contacts,
      partners,
      settings,
    };
  }

  async function downloadSnapshot() {
    const data = await exportSnapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const ymd = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `CRM_snapshot_${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  async function restoreSnapshot(obj) {
    if (!obj || obj.version !== "snapshot/v1") {
      throw new Error("Bad snapshot version");
    }
    // Partners-first; contacts-second to allow link resolution.
    await setAll("partners", obj.partners || []);
    await setAll("contacts", obj.contacts || []);
    await setAll("settings", obj.settings || {});
    if (typeof window.dispatchAppDataChanged === "function") {
      window.dispatchAppDataChanged("restoreSnapshot");
    }
  }

  // File picker helper
  async function pickAndRestore() {
    return new Promise((resolve, reject) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/json";
      inp.onchange = async () => {
        try {
          const file = inp.files?.[0];
          if (!file) return reject(new Error("no file"));
          const text = await file.text();
          const json = JSON.parse(text);
          await restoreSnapshot(json);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      };
      inp.click();
    });
  }

  // Optional global buttons by data-act (if present)
  document
    .querySelector?.('[data-act="snapshot-export"]')
    ?.addEventListener("click", downloadSnapshot);
  document
    .querySelector?.('[data-act="snapshot-restore"]')
    ?.addEventListener("click", () =>
      pickAndRestore().catch((e) => console.error("Restore failed", e))
    );

  window.snapshotService = {
    exportSnapshot,
    downloadSnapshot,
    restoreSnapshot,
    pickAndRestore,
  };
})();
