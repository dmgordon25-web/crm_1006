const STYLE_ID = 'ab-inline-style';

function injectActionBarStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
      #actionbar{
        position:fixed; left:50%; transform:translateX(-50%);
        bottom:16px; z-index:9999;
        max-width:960px; width:auto; padding:8px 12px;
        border-radius:12px; background:rgba(20,22,28,0.88); color:#fff;
        box-shadow:0 8px 24px rgba(0,0,0,.25);
      }
      #actionbar .actionbar-actions{ display:flex; gap:8px; align-items:center; justify-content:center; }
      #actionbar .btn{ padding:6px 10px; font-size:0.95rem; border-radius:10px; }
      #actionbar .btn.disabled{ opacity:.45; pointer-events:none; }
      #actionbar .btn.active{ outline:2px solid rgba(255,255,255,.35); transform:translateY(-1px); }
    `;
  document.head.appendChild(style);
}

const DATA_ACT_BY_RULE = {
  edit: 'edit',
  merge: 'merge',
  emailTogether: 'emailTogether',
  emailMass: 'emailMass',
  addTask: 'task',
  bulkLog: 'bulkLog',
  convertToPipeline: 'convertPipeline',
  delete: 'delete',
  clear: 'clear',
};

export function computeActionBarGuards(selectedCount){
  const n = Number(selectedCount || 0);
  return {
    edit: n === 1,
    merge: n === 2,
    emailTogether: n >= 1,
    emailMass: n >= 3,
    addTask: n >= 1,
    bulkLog: n >= 1,
    convertToPipeline: n === 1,
    delete: n >= 1,
    clear: n >= 1,
  };
}

function coerceGuards(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const result = {};
    Object.keys(DATA_ACT_BY_RULE).forEach((key) => {
      result[key] = !!input[key];
    });
    return result;
  }
  return computeActionBarGuards(input);
}

export function applyActionBarGuards(target, guardsLike) {
  injectActionBarStyle();
  const guards = coerceGuards(guardsLike);
  const bar = target || (typeof document !== 'undefined' ? document.getElementById('actionbar') : null);
  if (!bar || typeof bar.querySelector !== 'function') {
    return guards;
  }
  Object.entries(DATA_ACT_BY_RULE).forEach(([ruleKey, act]) => {
    const btn = bar.querySelector(`[data-act="${act}"]`);
    if (!btn) return;
    const enabled = !!guards[ruleKey];
    btn.disabled = !enabled;
    if (btn.classList && typeof btn.classList.toggle === 'function') {
      btn.classList.toggle('disabled', !enabled);
      const isPrimary = act === 'edit' || act === 'merge';
      btn.classList.toggle('active', isPrimary && enabled);
    }
  });
  return guards;
}

if (typeof window !== 'undefined') {
  window.computeActionBarGuards = computeActionBarGuards;
  window.applyActionBarGuards = function applyActionBarGuardsGlobal(target, guardsLike) {
    return applyActionBarGuards(target, guardsLike);
  };
}
