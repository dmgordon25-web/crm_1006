/* eslint-disable no-console */
import { chooseValue } from "/js/merge/merge_core.js";

export function openMergeModal({ kind = "contacts", recordA, recordB, onConfirm, onCancel }) {
  // kind is informative; currently only "contacts"
  const guard = "__MERGE_MODAL_OPEN__";
  if (window[guard]) return;
  window[guard] = true;

  const fields = Array.from(new Set([...Object.keys(recordA || {}), ...Object.keys(recordB || {})]))
    // Skip obviously internal fields (extend as needed)
    .filter(f => !/^id$/i.test(f) && !/^createdAt$/i.test(f) && !/^updatedAt$/i.test(f) && !/^__/.test(f));

  const tpl = document.createElement("template");
  tpl.innerHTML = `
<div class="merge-overlay" role="dialog" aria-modal="true" style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">
  <div class="merge-modal" style="background:#fff;min-width:720px;max-width:960px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.3);">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eee;">
      <div style="font-size:18px;font-weight:600;">Merge ${kind === "contacts" ? "Contacts" : "Records"}</div>
      <button class="merge-close" aria-label="Close" style="border:none;background:transparent;font-size:20px;cursor:pointer;">×</button>
    </div>
    <div style="padding:12px 16px;">
      <div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;align-items:center;font-weight:600;margin-bottom:8px;">
        <div>A</div><div style="text-align:center;">Field</div><div style="text-align:right;">B</div>
      </div>
      <div class="merge-rows" style="max-height:52vh;overflow:auto;border:1px solid #eee;border-radius:8px;padding:8px;">
        ${fields.map(f => {
          const def = chooseValue(f, recordA, recordB).from; // "A" or "B"
          const aVal = sanit(recordA?.[f]);
          const bVal = sanit(recordB?.[f]);
          return `
          <div class="merge-row" data-field="${escapeHtml(f)}" style="display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;align-items:start;padding:6px 0;border-bottom:1px solid #f6f6f6;">
            <label style="display:flex;gap:6px;align-items:flex-start;">
              <input type="radio" name="pick:${escapeHtml(f)}" value="A" ${def==="A"?"checked":""}/>
              <div style="white-space:pre-wrap;">${aVal}</div>
            </label>
            <div style="text-align:center;color:#555;font-size:12px;">${escapeHtml(f)}</div>
            <label style="display:flex;gap:6px;align-items:flex-start;justify-content:flex-end;">
              <div style="white-space:pre-wrap;text-align:right;">${bVal}</div>
              <input type="radio" name="pick:${escapeHtml(f)}" value="B" ${def==="B"?"checked":""}/>
            </label>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button class="merge-cancel" style="padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">Cancel</button>
        <button class="merge-confirm" style="padding:8px 12px;border-radius:8px;border:1px solid #2b7;background:#2b7;color:#fff;cursor:pointer;">Merge</button>
      </div>
    </div>
  </div>
</div>`.trim();

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
  function sanit(v) {
    try {
      if (v == null) return "";
      if (typeof v === "string") return escapeHtml(v);
      if (typeof v === "number" || typeof v === "boolean") return escapeHtml(String(v));
      if (Array.isArray(v)) return escapeHtml(v.map(x => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", "));
      return escapeHtml(JSON.stringify(v));
    } catch(_) { return ""; }
  }

  const node = tpl.content.firstElementChild;
  document.body.appendChild(node);

  const cleanup = () => { try { node.remove(); } catch(_){}; window[guard] = false; };
  const cancel = () => { cleanup(); onCancel?.(); };

  node.querySelector(".merge-close")?.addEventListener("click", cancel);
  node.querySelector(".merge-cancel")?.addEventListener("click", cancel);
  node.querySelector(".merge-confirm")?.addEventListener("click", async () => {
    const picks = {};
    node.querySelectorAll('.merge-row').forEach(row => {
      const field = row.getAttribute("data-field");
      const inputA = row.querySelector('input[value="A"]');
      const inputB = row.querySelector('input[value="B"]');
      picks[field] = (inputB && inputB.checked) ? "B" : "A";
    });
    try {
      await onConfirm?.(picks);
    } catch (err) {
      console.error(err);
    } finally {
      cleanup();
    }
  });
}
