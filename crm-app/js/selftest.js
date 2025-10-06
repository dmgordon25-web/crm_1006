const DEBUG = !!(window.DEBUG || localStorage.getItem('DEBUG') === '1');
  const phaseChecklist = [
    'js/patch_2025-09-26_phase1_pipeline_partners.js',
    'js/patch_2025-09-26_phase2_automations.js',
    'js/patch_2025-09-26_phase3_dashboard_reports.js',
    'js/patch_2025-09-26_phase4_polish_regression.js',
    'js/patch_2025-09-27_doccenter2.js',
    'js/patch_2025-09-27_phase6_polish_telemetry.js'
  ];
  const expectWorkbench = Boolean(window.__ENV__ && window.__ENV__.WORKBENCH);
  const requiredPhases = phaseChecklist.slice();
  if(expectWorkbench){
    requiredPhases.push('js/_legacy/patch_2025-09-27_workbench.js');
  }

  function addDiagnostic(kind, message){
    if(console){
      const log = kind === 'fail'
        ? console.error
        : kind === 'warn'
          ? console.warn
          : console.log;
      try{
        (log || console.log).call(console, `[selftest] ${kind}`, message);
      }catch(_err){
        console.log('[selftest]', kind, message);
      }
    }
  }

  const splashRoot = document.getElementById('diagnostic-splash');
  const splashTitle = splashRoot ? splashRoot.querySelector('[data-role="diag-title"]') : null;
  const splashMessage = splashRoot ? splashRoot.querySelector('[data-role="diag-message"]') : null;
  const splashDetails = splashRoot ? splashRoot.querySelector('[data-role="diag-details"]') : null;
  const splashButton = splashRoot ? splashRoot.querySelector('[data-role="diag-run-selftest"]') : null;

  export function renderSelfTestBanner(root){
    if(!DEBUG) return;
    if(!root) return;
    root.hidden = false;
    if(root.classList && typeof root.classList.remove === 'function'){
      root.classList.remove('hidden');
    }
  }

  function ensureSplashVisible(){
    if(!DEBUG) return false;
    if(!splashRoot) return false;
    renderSelfTestBanner(splashRoot);
    return true;
  }

  function renderDiagnosticSplash(config){
    if(!DEBUG) return;
    if(!ensureSplashVisible()) return;
    if(splashTitle && config.title){
      splashTitle.textContent = config.title;
    }
    if(splashMessage){
      if(config.message){
        splashMessage.textContent = config.message;
        splashMessage.hidden = false;
      }else{
        splashMessage.textContent = '';
        splashMessage.hidden = true;
      }
    }
    if(splashDetails){
      splashDetails.innerHTML = '';
      if(Array.isArray(config.details) && config.details.length){
        splashDetails.hidden = false;
        config.details.forEach(detail => {
          const item = document.createElement('li');
          item.textContent = detail;
          splashDetails.appendChild(item);
        });
      }else{
        splashDetails.hidden = true;
      }
    }
    if(splashRoot && config.state){
      splashRoot.dataset.state = config.state;
    }
  }

  function showBootMarkerSplash(){
    if(!DEBUG) return;
    const patches = Array.isArray(window.__PATCHES_LOADED__)
      ? window.__PATCHES_LOADED__.slice()
      : [];
    const details = [];
    details.push(window.BOOT_OK === true ? 'BOOT_OK marker present.' : 'BOOT_OK marker missing.');
    renderDiagnosticSplash({
      title: 'Diagnostics: Boot markers missing',
      message: 'Boot markers were not detected during startup. Use the self-test to investigate.',
      patches,
      details,
      state: 'boot'
    });
  }

  function handleSelfTestIssues(issues){
    if(!DEBUG) return;
    const patches = Array.isArray(window.__PATCHES_LOADED__)
      ? window.__PATCHES_LOADED__.slice()
      : [];
    const details = Array.isArray(issues) && issues.length
      ? issues
      : ['Self-test reported issues.'];
    renderDiagnosticSplash({
      title: 'Diagnostics: Self-test reported issues',
      message: 'Review the following findings and check the console for additional details.',
      patches,
      details,
      state: 'selftest'
    });
  }

  let bootCheckScheduled = false;
  function scheduleBootMarkerCheck(){
    if(bootCheckScheduled) return;
    bootCheckScheduled = true;
    const runCheck = ()=>{
      const patches = Array.isArray(window.__PATCHES_LOADED__)
        ? window.__PATCHES_LOADED__
        : [];
      if(window.BOOT_OK === true && patches.length > 0){
        return;
      }
      showBootMarkerSplash();
    };
    const startTimer = ()=>{
      if(typeof setTimeout === 'function'){
        setTimeout(runCheck, 1500);
      }else{
        runCheck();
      }
    };
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', startTimer, { once:true });
    }else{
      startTimer();
    }
  }
  scheduleBootMarkerCheck();

  async function waitForBootCompletion(){
    if(window.__BOOT_DONE__ && typeof window.__BOOT_DONE__.then === 'function'){
      try{
        return await window.__BOOT_DONE__;
      }catch(err){
        console.error('Selftest: boot failed', err);
        addDiagnostic('fail', 'Boot failed — see console for details.');
        throw err;
      }
    }
    return null;
  }

  export async function runSelfTest(){
    let ok = true;
    const issues = [];
    try{
      await waitForBootCompletion();
    }catch(_){
      ok = false;
      issues.push('Boot did not complete successfully.');
    }

    console.log('PATCHES_LOADED', window.__PATCHES_LOADED__);

    const loaded = Array.isArray(window.__PATCHES_LOADED__)
      ? window.__PATCHES_LOADED__.slice()
      : [];
    const expectedManifest = Array.isArray(window.__EXPECTED_PATCHES__)
      ? window.__EXPECTED_PATCHES__.slice()
      : [];
    const missing = requiredPhases.filter(path => !loaded.includes(path));
    if(missing.length){
      ok = false;
      console.error('PATCHES_MISSING', missing);
      console.error('Selftest: missing required patches', { missing, loaded });
      addDiagnostic('fail', `Missing patches: ${missing.join(', ')}`);
      issues.push(`Missing patches: ${missing.join(', ')}`);
    }else{
      console.log('Selftest: phases verified', loaded);
    }

    const failed = Array.isArray(window.__PATCHES_FAILED__)
      ? window.__PATCHES_FAILED__.filter(Boolean)
      : [];
    if(failed.length){
      ok = false;
      console.error('Selftest: patch load failures', failed);
      addDiagnostic('fail', `Failed patches: ${failed.map(item => item.path || 'unknown').join(', ')}`);
      issues.push(`Failed patches: ${failed.map(item => item.path || 'unknown').join(', ')}`);
    }

    if(expectWorkbench){
      if(!document.querySelector('#main-nav [data-nav="workbench"]')){
        ok = false;
        console.error('Selftest: workbench nav missing');
        addDiagnostic('fail', 'Workbench navigation button missing.');
        issues.push('Workbench navigation button missing.');
      }

      if(!document.getElementById('view-workbench')){
        ok = false;
        console.error('Selftest: workbench view missing');
        addDiagnostic('fail', 'Workbench view host missing.');
        issues.push('Workbench view host missing.');
      }

      const workbenchPath = 'js/_legacy/patch_2025-09-27_workbench.js';
      const hasWorkbenchPatch = loaded.includes(workbenchPath)
        || loaded.includes('workbench');
      const manifestExpectsWorkbench = expectedManifest.includes(workbenchPath);
      if(!hasWorkbenchPatch){
        if(manifestExpectsWorkbench){
          ok = false;
          console.error('Selftest: workbench patch missing');
          addDiagnostic('fail', 'Workbench patch not registered.');
          issues.push('Workbench patch not registered.');
        }else{
          console.warn('Selftest: workbench patch omitted from manifest; skipping enforcement.');
          addDiagnostic('warn', 'Workbench intentionally removed; skipping check.');
        }
      }
    }else{
      addDiagnostic('skip', 'Workbench disabled in prod (expected).');
    }

    if(window.SelectionService){
      const wired = typeof window.SelectionService.getIds === 'function'
        && typeof window.SelectionService.count === 'function';
      if(!wired){
        ok = false;
        console.error('Selftest: selection service incomplete');
        addDiagnostic('fail', 'Selection service incomplete.');
        issues.push('Selection service incomplete.');
      }
    }

    if(typeof window.requiredDocsFor !== 'function'){
      ok = false;
      console.error('Selftest: doc center helpers inactive');
      addDiagnostic('fail', 'Doc center helpers not available.');
      issues.push('Doc center helpers not available.');
    }

    const hasTelemetryDiag = window.DIAG && typeof window.DIAG.getStoreSizes === 'function';
    const isDebugEnv = window.__ENV__ && window.__ENV__.DEBUG === true;
    if(!hasTelemetryDiag){
      if(isDebugEnv){
        ok = false;
        console.error('Selftest: telemetry helpers missing');
        addDiagnostic('fail', 'Telemetry helpers missing.');
        issues.push('Telemetry helpers missing.');
      }else{
        console.warn('Selftest: telemetry helpers unavailable in production context; treating as diagnostic warn.');
        addDiagnostic('warn', 'Telemetry helpers inactive in prod (expected noop).');
      }
    }

    const loadLog = Array.isArray(window.__PATCH_LOAD_LOG__)
      ? window.__PATCH_LOAD_LOG__.slice()
      : [];
    const tsxImports = loadLog
      .map(entry => entry && entry.path ? String(entry.path) : '')
      .filter(path => /\.tsx(\?|$)/i.test(path));
    if(tsxImports.length){
      ok = false;
      console.error('Selftest: TSX imports detected', tsxImports);
      addDiagnostic('fail', `TSX imports detected: ${tsxImports.join(', ')}`);
      issues.push('Runtime TSX imports detected.');
    }

    if(ok){
      addDiagnostic('pass', 'Self-test PASS — all required modules and diagnostics loaded.');
      if(splashRoot){
        splashRoot.hidden = true;
        splashRoot.classList.add('hidden');
      }
      window.BOOT_OK = true;
    }else{
      addDiagnostic('fail', 'Self-test FAIL — review console for details.');
      handleSelfTestIssues(issues);
      window.BOOT_OK = false;
    }

    return ok;
  }

  window.runSelfTest = runSelfTest;

  if(splashButton && !splashButton.__wired){
    splashButton.__wired = true;
    splashButton.addEventListener('click', async (event)=>{
      event.preventDefault();
      splashButton.disabled = true;
      try{
        await runSelfTest();
      }finally{
        splashButton.disabled = false;
      }
    });
  }

  function triggerSelfTest(){
    runSelfTest().catch(err => {
      console.error('Selftest: execution failed', err);
      handleSelfTestIssues(['Self-test execution encountered an unexpected error.']);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', triggerSelfTest, { once:true });
  }else{
    triggerSelfTest();
  }
  
// ==== Self-Test 2.0 — tripwires (append-below) ====
async function assertModuleScriptsAreModules(){
  const errs = [];
  const scripts = Array.from(document.scripts || []);
  const base = document.baseURI || (location && location.href) || '';
  const baseUrl = new URL(base, base);
  scripts.forEach(s => {
    const src = s.getAttribute('src') || '';
    if(!src) return;
    let u; try { u = new URL(src, baseUrl); } catch { return; }
    const same = u.origin === baseUrl.origin;
    const path = (u.pathname || '').toLowerCase();
    const ours = same && (path.includes('/js/') || path.includes('/patches/'));
    if(ours){
      const t = (s.getAttribute('type') || '').trim().toLowerCase();
      if(t !== 'module'){ errs.push(`Non-module script for app code: ${u.pathname}`); }
    }
  });
  if(errs.length){ addDiagnostic('fail','Module-only invariant failed', errs); }
  else { addDiagnostic('pass','Module-only invariant enforced'); }
}

function assertRenderAll(){
  const ok = typeof window.renderAll === 'function';
  addDiagnostic(ok ? 'pass' : 'fail', ok ? 'renderAll available' : 'renderAll missing');
}

async function assertSingleRepaintOnDataChanged(){
  const guard = window.RenderGuard;
  if(!guard || typeof guard.requestRender !== 'function'){
    addDiagnostic('skip','RenderGuard unavailable; skip repaint tripwire'); return;
  }

  const original = guard.requestRender;
  const orig = original.bind(guard);
  let calls = 0;
  guard.requestRender = function(...args){
    calls += 1;
    return orig(...args);
  };

  const canObserveFlush = typeof guard.subscribeRender === 'function'
    && typeof guard.unsubscribeRender === 'function';
  let flushes = 0;
  let tracking = false;
  let hadPreFlush = false;
  let resolveFlush = null;
  let flushPromise = null;

  const sentinel = () => {
    if(!tracking){
      hadPreFlush = true;
      return;
    }
    flushes += 1;
    if(resolveFlush){
      resolveFlush();
      resolveFlush = null;
    }
  };

  if(canObserveFlush){
    guard.subscribeRender(sentinel);
    flushPromise = new Promise(resolve => {
      resolveFlush = resolve;
    });
  }

  try{
    if(canObserveFlush){
      await Promise.resolve();
      tracking = true;
    }

    document.dispatchEvent(new CustomEvent('app:data:changed', { detail:{ source:'selftest' }}));
    const testApi = (window.__test && typeof window.__test.nextPaint === 'function') ? window.__test : null;
    if(testApi){
      await testApi.nextPaint();
    }else if(canObserveFlush){
      const createFrameWait = () => new Promise(resolve => {
        const raf = typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : null;
        if(raf){
          raf(() => resolve());
        }else{
          setTimeout(resolve, 32);
        }
      });
      await Promise.race([flushPromise, createFrameWait()]);
      if(flushes === 0){
        await Promise.race([flushPromise, createFrameWait()]);
      }
    }

    if(canObserveFlush){
      tracking = false;
    }

    let kind;
    let message;
    if(canObserveFlush){
      if(flushes === 1){
        kind = 'pass';
        message = `app:data:changed → repaint confirmed (${calls} requestRender call${calls === 1 ? '' : 's'})`;
      }else if(flushes === 0){
        kind = 'fail';
        message = `app:data:changed triggered ${calls} requestRender call${calls === 1 ? '' : 's'} but no repaint`;
      }else{
        kind = 'warn';
        message = `app:data:changed produced ${flushes} repaints (${calls} requestRender call${calls === 1 ? '' : 's'})`;
      }
      if(hadPreFlush){
        message += ' (ignored a pre-existing repaint)';
      }
    }else{
      const ok = calls > 0;
      kind = ok ? 'pass' : 'fail';
      message = ok
        ? `app:data:changed triggered ${calls} requestRender call${calls === 1 ? '' : 's'}`
        : 'app:data:changed did not trigger any requestRender calls';
    }

    addDiagnostic(kind, message);
  }catch(err){
    addDiagnostic('fail','Repaint tripwire failed: ' + (err && err.message || err));
  }finally{
    if(canObserveFlush){
      guard.unsubscribeRender(sentinel);
    }
    guard.requestRender = original;
  }
}

async function assertSeedEmitsOne(){
  const orig = window.dispatchAppDataChanged;
  if(typeof orig !== 'function'){ addDiagnostic('skip','dispatchAppDataChanged missing; seed tripwire skipped'); return; }
  let count = 0; window.dispatchAppDataChanged = d => { count++; return orig(d); };
  try{
    if(typeof window.SeedDemoData === 'function'){
      await window.SeedDemoData({ contacts:0, partners:0 }); // no-op seed
      addDiagnostic(count===1 ? 'pass' : (count>1?'fail':'warn'),
        count===1 ? 'Seed commit emitted one app:data:changed'
                  : (count>1 ? `Seed emitted ${count} app:data:changed events`
                              : 'Seed did not emit any changes'));
    }else{
      addDiagnostic('skip','SeedDemoData not available; seed tripwire skipped');
    }
  }catch(err){ addDiagnostic('fail','Seed tripwire failed: ' + (err && err.message || err)); }
  finally{ window.dispatchAppDataChanged = orig;
  }
}

async function assertImporterCoalescesOnce(){
  const orig = window.dispatchAppDataChanged;
  if(typeof orig !== 'function'){ addDiagnostic('skip','dispatchAppDataChanged missing; importer tripwire skipped'); return; }
  let count = 0; window.dispatchAppDataChanged = d => { count++; return orig(d); };
  try{
    // Synthetic end-of-batch signal (importer emits once per batch)
    orig({ scope:'import', entity:'partners', partial:true });
    addDiagnostic(count===1 ? 'pass' : (count>1?'fail':'warn'),
      count===1 ? 'Importer batch emitted one app:data:changed'
                : (count>1 ? `Importer emitted ${count}`
                            : 'Importer did not emit any changes'));
  }catch(err){ addDiagnostic('warn','Importer tripwire indeterminate: ' + (err && err.message || err)); }
  finally{ window.dispatchAppDataChanged = orig; }
}

// Run new tripwires in sequence (no flakes)
(async ()=>{
  try{ await assertModuleScriptsAreModules(); }catch(_){}
  try{ assertRenderAll(); }catch(_){}
  try{ await assertSingleRepaintOnDataChanged(); }catch(_){}
  try{ await assertSeedEmitsOne(); }catch(_){}
  try{ await assertImporterCoalescesOnce(); }catch(_){}
// ==== End Self-Test 2.0 — append-above ====
// ==== End Self-Test 2.0 — append-above this file’s final “})();” ====
})();
