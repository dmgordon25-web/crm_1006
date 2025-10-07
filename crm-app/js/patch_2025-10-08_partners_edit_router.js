(() => {
  if (window.__WIRED_PARTNERS_EDIT_ROUTER__) return;
  window.__WIRED_PARTNERS_EDIT_ROUTER__ = true;

  // Prefer explicit edit buttons with data-act, but also handle row double-click
  function partnerIdFrom(el){
    const row = el.closest?.('[data-page="partners"] [data-row-id], #partners [data-row-id], [data-view="partners"] [data-row-id]');
    return row?.getAttribute("data-row-id") || el.getAttribute("data-partner-id") || el.dataset?.partnerId || null;
  }

  async function openPartnerModal(id){
    // Prefer a dedicated module if present; fall back to global API
    try {
      if (window.PartnersModal?.open) return void window.PartnersModal.open(id);
      if (window.Partners?.openEdit)  return void window.Partners.openEdit(id);
      // Dynamic import fallback if the module is lazy-loaded
      const mod = await import("/js/partners_modal.js").catch(()=>null);
      if (mod?.open) return void mod.open(id);
      if (typeof mod?.default === "function") return void mod.default(id);
    } catch {}
  }

  document.addEventListener("click", (ev) => {
    const editBtn = ev.target.closest?.('[data-page="partners"] [data-act="edit"], [data-view="partners"] [data-act="edit"], [data-page="partners"] [data-act="partner:edit"]');
    if (!editBtn) return;
    const id = partnerIdFrom(editBtn);
    if (!id) return;
    ev.preventDefault();
    openPartnerModal(id);
  }, true);

  // Optional: double-click row to edit
  document.addEventListener("dblclick", (ev) => {
    const scope = ev.target.closest?.('[data-page="partners"], #partners, [data-view="partners"]');
    if (!scope) return;
    const id = partnerIdFrom(ev.target);
    if (!id) return;
    ev.preventDefault();
    openPartnerModal(id);
  }, true);
})();
