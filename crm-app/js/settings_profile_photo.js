const PROFILE_KEY = "profile:v1";
const PHOTO_KEY = "profile.photoDataUrl";
const PHOTO_CLEARED_KEY = "profile.photoCleared";

function normalizeDataUrl(dataUrl) {
  return typeof dataUrl === "string" ? dataUrl : "";
}

function cloneProfile(source) {
  return source && typeof source === "object" ? Object.assign({}, source) : {};
}

function readProfileLocal() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeProfileLocal(profile) {
  try {
    if (profile && typeof profile === "object" && Object.keys(profile).length) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }
  } catch (_) {}
}

function applyPhotoValue(profile, dataUrl) {
  const next = cloneProfile(profile);
  if (dataUrl) {
    next.photoDataUrl = dataUrl;
  } else {
    delete next.photoDataUrl;
  }
  return next;
}

function updateSettingsStore(dataUrl) {
  if (typeof window === "undefined") return;
  try {
    const getter = window.SettingsStore?.get;
    const setter = window.SettingsStore?.set;
    if (typeof getter !== "function" || typeof setter !== "function") return;
    const current = getter() || {};
    const next = Object.assign({}, current);
    if (current.profile || current.loProfile) {
      if (current.profile) {
        next.profile = applyPhotoValue(current.profile, dataUrl);
      }
      if (current.loProfile) {
        next.loProfile = applyPhotoValue(current.loProfile, dataUrl);
      }
    } else {
      next.profile = applyPhotoValue({}, dataUrl);
      next.loProfile = applyPhotoValue({}, dataUrl);
    }
    setter(next);
  } catch (_) {}
}

function updateLocalProfile(dataUrl) {
  const localProfile = readProfileLocal();
  if (!localProfile && !dataUrl) return;
  const next = applyPhotoValue(localProfile || {}, dataUrl);
  writeProfileLocal(next);
}

function updateGlobalProfile(dataUrl) {
  if (typeof window === "undefined") return;
  try {
    if (window.__LO_PROFILE__ && typeof window.__LO_PROFILE__ === "object") {
      window.__LO_PROFILE__ = applyPhotoValue(window.__LO_PROFILE__, dataUrl);
    }
  } catch (_) {}
}

function readFallbackPhoto() {
  try {
    const stored = localStorage.getItem(PHOTO_KEY);
    return typeof stored === "string" ? stored : "";
  } catch (_) {
    return "";
  }
}

function writeFallbackPhoto(dataUrl) {
  try {
    if (dataUrl) {
      localStorage.setItem(PHOTO_KEY, dataUrl);
    } else {
      localStorage.removeItem(PHOTO_KEY);
    }
  } catch (_) {}
}

function writeClearedFlag(dataUrl) {
  try {
    if (dataUrl) {
      localStorage.removeItem(PHOTO_CLEARED_KEY);
    } else {
      localStorage.setItem(PHOTO_CLEARED_KEY, "1");
    }
  } catch (_) {}
}

function readClearedFlag() {
  try {
    return localStorage.getItem(PHOTO_CLEARED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function dispatchStoredEvent(dataUrl, broadcastOptions) {
  if (typeof document === "undefined") return;
  try {
    const detail = { dataUrl };
    document.dispatchEvent(new CustomEvent("settings:profile-photo:stored", { detail }));
    if (broadcastOptions?.notifyApp !== false) {
      const scopeDetail = { scope: "settings", source: "profile:photo", dataUrl };
      const globalWindow = typeof window !== "undefined" ? window : undefined;
      if (globalWindow && typeof globalWindow.dispatchAppDataChanged === "function") {
        try {
          globalWindow.dispatchAppDataChanged(scopeDetail);
        } catch (_) {
          document.dispatchEvent(new CustomEvent("app:data:changed", { detail: scopeDetail }));
        }
      } else {
        document.dispatchEvent(new CustomEvent("app:data:changed", { detail: scopeDetail }));
      }
    }
  } catch (_) {}
}

function resolvePhotoFromStore() {
  if (typeof window === "undefined") return "";
  try {
    const store = window.SettingsStore?.get?.();
    if (store && typeof store === "object") {
      const profile = store.loProfile || store.profile;
      if (profile && typeof profile.photoDataUrl === "string" && profile.photoDataUrl) {
        return profile.photoDataUrl;
      }
    }
  } catch (_) {}
  return "";
}

function resolvePhotoFromGlobal() {
  if (typeof window === "undefined") return "";
  try {
    const profile = window.__LO_PROFILE__;
    if (profile && typeof profile === "object" && typeof profile.photoDataUrl === "string" && profile.photoDataUrl) {
      return profile.photoDataUrl;
    }
  } catch (_) {}
  return "";
}

function resolvePhotoFromProfileLocal() {
  const profile = readProfileLocal();
  if (profile && typeof profile.photoDataUrl === "string" && profile.photoDataUrl) {
    return profile.photoDataUrl;
  }
  return "";
}

function loadDataUrl() {
  return (
    resolvePhotoFromGlobal() ||
    resolvePhotoFromStore() ||
    resolvePhotoFromProfileLocal() ||
    readFallbackPhoto() ||
    ""
  );
}

function saveDataUrl(dataUrl, options = {}) {
  const normalized = normalizeDataUrl(dataUrl);
  const current = loadDataUrl();
  const changed = normalized !== current;

  updateSettingsStore(normalized);
  updateLocalProfile(normalized);
  updateGlobalProfile(normalized);
  writeFallbackPhoto(normalized);
  writeClearedFlag(normalized);

  if (changed && options.broadcast !== false) {
    dispatchStoredEvent(normalized, { notifyApp: options.notifyApp !== false });
  }
  return normalized;
}

export const SettingsPhoto = {
  saveDataUrl,
  loadDataUrl,
  wasExplicitlyCleared: readClearedFlag,
};

export default SettingsPhoto;
