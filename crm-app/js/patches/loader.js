(async function runPatchLoader(){
  const APP_VERSION = window.APP_VERSION || window.BUILD_VERSION || Date.now();
  const summary = { ok: [], fail: [], total: 0, version: APP_VERSION, startedAt: Date.now() };
  window.__PATCHES_LOADED__ = summary;
  const globalFailures = Array.isArray(window.__PATCHES_FAILED__)
    ? window.__PATCHES_FAILED__
    : (window.__PATCHES_FAILED__ = []);

  try {
    await import('../boot/loader.js');
  } catch (error) {
    console.error('[patch-loader] base loader failed', error);
    (window.__PATCHES_FAILED__ ||= []).push({ mod: 'boot/loader', error: String((error && error.message) || error) });
  }

  // Always expose failure overlay if index opened wrong (file://) or no modules loaded
  queueMicrotask(() => {
    const ok = Array.isArray(summary.ok) ? summary.ok.length : 0;
    const fail = Array.isArray(summary.fail) ? summary.fail.length : 0;
    if (location.protocol === 'file:' || (!ok && fail)) {
      try {
        import('../boot/loader.js');
      } catch (_err) {}
      try { window.showOpenViaStartOverlay?.(); } catch {}
    }
  });

  const normalizeEntry = (entry) => {
    if (entry == null) return '';
    let value = String(entry).trim().replace(/\\/g, '/');
    if (!value) return '';
    if (value.startsWith('/s/')) return value.slice(3);
    if (value.startsWith('s/')) return value.slice(2);
    if (value.startsWith('./')) return value.slice(2);
    if (value.startsWith('/')) return value.slice(1);
    return value;
  };

  const ensureArray = (input) => {
    if (Array.isArray(input)) return input.slice();
    if (input && Array.isArray(input.files)) return input.files.slice();
    return [];
  };

  const fetchManifest = async () => {
    if (typeof fetch !== 'function') return [];
    try {
      const response = await fetch('./patches/manifest.json', { cache: 'no-store' });
      if (!response.ok) return [];
      const payload = await response.json();
      return ensureArray(payload);
    } catch (_err) {
      return [];
    }
  };

  const entries = [];
  const seenEntries = new Set();
  for (const rawEntry of await fetchManifest()) {
    const entry = normalizeEntry(rawEntry);
    if (!entry || seenEntries.has(entry)) continue;
    seenEntries.add(entry);
    entries.push(entry);
  }
  summary.total = entries.length;

  const loadedUrls = new Set();

  const makeUrl = (candidate) => {
    const url = new URL(candidate, document.baseURI);
    if (APP_VERSION != null) url.searchParams.set('v', APP_VERSION);
    return url.href;
  };

  function loadScript(path, { type = 'text/javascript' } = {}) {
    return new Promise((resolve, reject) => {
      const flags = (window.__INIT_FLAGS__ = window.__INIT_FLAGS__ || {});
      const key = `${type}:${path}`;
      if (flags[key]) return resolve('skip');
      flags[key] = true;

      const s = document.createElement('script');
      s.async = false;
      s.src = path.startsWith('http') ? path : makeUrl ? makeUrl(path) : path;
      if (type === 'module') s.type = 'module';
      s.onload = () => { if (typeof noteLoaded === 'function') noteLoaded(path); resolve(type); };
      s.onerror = () => reject(new Error(`loader: ${type} load failed for ${path}`));
      (document.head || document.documentElement).appendChild(s);
    });
  }

  const isNetworkError = (error) => {
    if (!error) return false;
    const name = String(error.name || '').toLowerCase();
    if (name === 'typeerror' || name === 'networkerror') return true;
    const message = String(error.message || '').toLowerCase();
    return message.includes('failed to fetch') || message.includes('importing a module script failed') || message.includes('dynamically imported module');
  };

  const tryModuleImport = async (candidate) => {
    const url = makeUrl(candidate);
    if (loadedUrls.has(url)) return { ok: true, url };
    try {
      await import(/* @vite-ignore */ url);
      loadedUrls.add(url);
      return { ok: true, url };
    } catch (error) {
      return { ok: false, url, error };
    }
  };

  const loadClassicScript = (candidate, { type = 'text/javascript' } = {}) => {
    const url = candidate.startsWith('http') ? candidate : makeUrl(candidate);
    const isOurCode = /^(\.\/)?(js|patches)\//i.test(candidate) || /\/(js|patches)\//i.test(candidate);
    if (isOurCode && type !== 'module') { type = 'module'; }
    if (isOurCode) { try { console.log(`loader: fallback-inject { path: ${candidate}, as: 'module' }`); } catch (_) {} }
    if (loadedUrls.has(url)) return Promise.resolve({ ok: true, url });
    return loadScript(candidate, { type })
      .then(() => {
        loadedUrls.add(url);
        return { ok: true, url };
      })
      .catch((error) => ({ ok: false, url, error }));
  };

  const formatError = (error) => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
    return String(error);
  };

  const loadEntry = async (entry) => {
    const tried = [];
    const pushSuccess = (url) => {
      summary.ok.push(url);
      return { ok: true };
    };

    if (entry.includes('/')) {
      const candidates = [`./${entry}`, entry];
      let lastError = null;
      for (const candidate of candidates) {
        const result = await tryModuleImport(candidate);
        tried.push(result.url);
        if (result.ok) return pushSuccess(result.url);
        lastError = result.error;
        if (!isNetworkError(result.error)) break;
      }
      return { ok: false, tried, error: lastError };
    }

    const moduleCandidates = [
      `./patches/${entry}`,
      `./js/patches/${entry}`,
      `patches/${entry}`,
      `js/patches/${entry}`
    ];
    const networkFailures = [];
    for (const candidate of moduleCandidates) {
      const result = await tryModuleImport(candidate);
      tried.push(result.url);
      if (result.ok) return pushSuccess(result.url);
      if (isNetworkError(result.error)) {
        networkFailures.push(candidate);
        continue;
      }
      return { ok: false, tried, error: result.error };
    }

    for (const candidate of networkFailures) {
      const isOurCode = /^(\.\/)?(js|patches)\//i.test(candidate) || /\/(js|patches)\//i.test(candidate);
      const result = await loadClassicScript(candidate, { type: isOurCode ? 'module' : 'text/javascript' });
      tried.push(result.url);
      if (result.ok) return pushSuccess(result.url);
    }

    const lastError = networkFailures.length ? new Error('Module not found') : null;
    return { ok: false, tried, error: lastError };
  };

  for (const entry of entries) {
    const outcome = await loadEntry(entry);
    if (outcome.ok) continue;
    const errorText = formatError(outcome.error);
    const failureEntry = { entry, tried: outcome.tried || [], error: errorText };
    summary.fail.push(failureEntry);
    try {
      const record = { path: entry, error: errorText };
      if (!globalFailures.some(item => item && item.path === record.path && item.error === record.error)) {
        globalFailures.push(record);
      }
    } catch (_err) {}
  }

  const okCount = summary.ok.length;
  const failCount = summary.fail.length;
  console.log(`[patch-loader] ok:${okCount} fail:${failCount}`, summary);
  document.dispatchEvent(new CustomEvent('patches:loaded', { detail: summary }));
})();
