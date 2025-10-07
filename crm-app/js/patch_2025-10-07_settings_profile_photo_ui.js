import { SettingsPhoto } from "/js/settings_profile_photo.js";

(() => {
  if (typeof window === "undefined") return;
  if (window.__WIRED_SETTINGS_PHOTO_UI__) return;
  window.__WIRED_SETTINGS_PHOTO_UI__ = true;

  function updatePreview(refs, dataUrl) {
    if (!refs) return;
    const value = typeof dataUrl === "string" ? dataUrl : "";
    if (value) {
      refs.preview.src = value;
      refs.preview.style.display = "inline-block";
      refs.preview.hidden = false;
      refs.remove.hidden = false;
    } else {
      refs.preview.removeAttribute("src");
      refs.preview.style.display = "none";
      refs.preview.hidden = true;
      refs.remove.hidden = true;
    }
  }

  function readCurrentRefs(field) {
    if (!field) return null;
    if (field.__profilePhotoRefs) return field.__profilePhotoRefs;
    const input = field.querySelector('input[type="file"]');
    const preview = field.querySelector('img[data-role="profile-photo-preview"]');
    const remove = field.querySelector('button[data-action="remove-photo"]');
    if (!input || !preview || !remove) return null;
    field.__profilePhotoRefs = { field, input, preview, remove };
    return field.__profilePhotoRefs;
  }

  function ensureUploader() {
    if (typeof document === "undefined") return null;
    const card = document.getElementById("lo-profile-settings");
    if (!card) return null;
    const grid = card.querySelector(".grid");
    let field = card.querySelector('[data-role="profile-photo-uploader"]');
    if (!field) {
      field = document.createElement("label");
      field.setAttribute("data-role", "profile-photo-uploader");
      field.style.display = "block";
      field.style.padding = "4px 0";

      const title = document.createElement("span");
      title.textContent = "Profile Photo";
      title.style.display = "block";
      title.style.marginBottom = "4px";
      title.style.fontWeight = "500";

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.alignItems = "center";
      controls.style.gap = "12px";

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.maxWidth = "100%";

      const preview = document.createElement("img");
      preview.setAttribute("data-role", "profile-photo-preview");
      preview.alt = "Profile photo preview";
      preview.style.width = "48px";
      preview.style.height = "48px";
      preview.style.borderRadius = "50%";
      preview.style.objectFit = "cover";
      preview.style.display = "none";
      preview.loading = "lazy";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("data-action", "remove-photo");
      remove.textContent = "Remove";
      remove.style.background = "none";
      remove.style.border = "0";
      remove.style.padding = "0";
      remove.style.fontSize = "0.85rem";
      remove.style.color = "var(--link-color, #1a73e8)";
      remove.style.cursor = "pointer";
      remove.style.textDecoration = "underline";
      remove.hidden = true;

      controls.appendChild(input);
      controls.appendChild(preview);
      controls.appendChild(remove);

      field.appendChild(title);
      field.appendChild(controls);

      if (grid) {
        grid.appendChild(field);
      } else {
        card.appendChild(field);
      }
    }

    const refs = readCurrentRefs(field);
    if (!refs) return null;

    if (!refs.__wired) {
      refs.__wired = true;
      refs.input.addEventListener("change", (event) => {
        const file = event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;
        if (file.type && !/^image\//i.test(file.type)) {
          event.target.value = "";
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : "";
          if (!dataUrl) return;
          SettingsPhoto.saveDataUrl(dataUrl);
          updatePreview(refs, dataUrl);
          try { event.target.value = ""; }
          catch (_) {}
        });
        reader.addEventListener("error", () => {
          try { event.target.value = ""; }
          catch (_) {}
        });
        reader.readAsDataURL(file);
      });

      refs.remove.addEventListener("click", () => {
        SettingsPhoto.saveDataUrl("", { notifyApp: true });
        updatePreview(refs, "");
      });
    }

    updatePreview(refs, SettingsPhoto.loadDataUrl());
    return refs;
  }

  function renderHeaderAvatar() {
    if (typeof document === "undefined") return;
    const chip = document.getElementById("lo-profile-chip");
    if (!chip) return;
    const nameEl = chip.querySelector('[data-role="lo-name"]');
    if (!nameEl) return;
    const dataUrl = SettingsPhoto.loadDataUrl();
    if (dataUrl) {
      if (!nameEl.__photoOriginal) {
        nameEl.__photoOriginal = {
          display: nameEl.style.display || "",
          alignItems: nameEl.style.alignItems || "",
          gap: nameEl.style.gap || "",
        };
      }
      nameEl.style.display = "flex";
      nameEl.style.alignItems = "center";
      nameEl.style.gap = "8px";
      let img = nameEl.querySelector('img[data-role="lo-photo"]');
      if (!img) {
        img = document.createElement("img");
        img.dataset.role = "lo-photo";
        img.alt = "Profile photo";
        img.style.width = "28px";
        img.style.height = "28px";
        img.style.borderRadius = "50%";
        img.style.objectFit = "cover";
        img.style.flexShrink = "0";
        nameEl.insertBefore(img, nameEl.firstChild);
      }
      img.src = dataUrl;
      nameEl.__photoFlexApplied = true;
    } else {
      const existing = nameEl.querySelector('img[data-role="lo-photo"]');
      if (existing) existing.remove();
      if (nameEl.__photoFlexApplied) {
        const original = nameEl.__photoOriginal || {};
        nameEl.style.display = original.display || "";
        nameEl.style.alignItems = original.alignItems || "";
        nameEl.style.gap = original.gap || "";
        nameEl.__photoOriginal = null;
      }
      nameEl.__photoFlexApplied = false;
    }
  }

  function syncAll() {
    ensureUploader();
    renderHeaderAvatar();
  }

  function handleStored(event) {
    const detail = event && event.detail ? event.detail : {};
    const dataUrl = typeof detail.dataUrl === "string" ? detail.dataUrl : "";
    const refs = ensureUploader();
    updatePreview(refs, dataUrl);
    renderHeaderAvatar();
  }

  function handleAppDataChanged(event) {
    const scope = event && event.detail && event.detail.scope;
    if (scope && scope !== "settings") return;
    syncAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncAll, { once: true });
  } else {
    syncAll();
  }

  document.addEventListener("settings:profile-photo:stored", handleStored);
  document.addEventListener("app:data:changed", handleAppDataChanged);
  window.RenderGuard?.registerHook?.(syncAll);
})();
