/* crm-app/js/services/doc_checklist.js */
(function () {
  if (window.__WIRED_docChecklist) return;
  window.__WIRED_docChecklist = true;

  const DEFAULTS = {
    FHA: ["ID(s)", "2 months bank statements", "30 days paystubs", "2 years W-2s"],
    VA: ["COE", "LES/Paystubs", "2 years W-2s", "DD214 (if applicable)"],
    CONV: ["ID(s)", "2 months bank statements", "30 days paystubs", "2 years W-2s"],
    USDA: ["ID(s)", "2 months bank statements", "30 days paystubs", "2 years W-2s", "USDA Form RD 3555-21"],
    REFI: ["Mortgage statement", "Homeowners insurance", "Payoff statement"],
    PURCHASE: ["Executed sales contract", "EMD receipt", "Homeowners insurance"],
  };

  function keyFor(loanType) {
    const t = (loanType || "").toUpperCase();
    if (t.includes("FHA")) return "FHA";
    if (t.includes("VA")) return "VA";
    if (t.includes("USDA")) return "USDA";
    if (t.includes("REFI")) return "REFI";
    if (t.includes("PURCHASE")) return "PURCHASE";
    return "CONV";
  }

  function ensure(contact) {
    if (!contact) return null;
    if (!Array.isArray(contact.docChecklist)) contact.docChecklist = [];
    return contact.docChecklist;
  }

  function seedIfEmpty(contact, loanType) {
    const list = ensure(contact);
    if (!list) return list;
    if (list.length === 0) {
      const base = DEFAULTS[keyFor(loanType || contact.loanType || "")] || [];
      for (const label of base) list.push({ label, done: false, at: null });
    }
    return list;
  }

  function toggle(contact, label, toDone) {
    const list = ensure(contact);
    if (!list) return;
    const item = list.find((i) => i.label === label);
    if (!item) return;
    const next = typeof toDone === "boolean" ? toDone : !item.done;
    item.done = next;
    item.at = next ? new Date().toISOString() : null;
  }

  window.docChecklistService = { seedIfEmpty, toggle, ensure };
})();
