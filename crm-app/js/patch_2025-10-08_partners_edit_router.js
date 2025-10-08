(() => {
  if (window.__WIRED_PARTNERS_EDIT_ROUTER__) return;
  window.__WIRED_PARTNERS_EDIT_ROUTER__ = true;

  function partnerIdFrom(el){
    const row = el.closest?.('[data-page="partners"] [data-row-id], #partners [data-row-id], [data-view="partners"] [data-row-id]');
    return row?.getAttribute("data-row-id") || el.getAttribute("data-partner-id") || el.dataset?.partnerId || null;
  }

  async function openPartnerModal(id){
    try {
      if (window.PartnersModal?.open) return void window.PartnersModal.open(id);
      if (window.Partners?.openEdit)  return void window.Partners.openEdit(id);
      try {
        const mod = await import('/js/partners_modal.js');
        if (mod?.PartnersModal?.open) return void mod.PartnersModal.open(id);
      } catch {}
      if (window.PartnersModal?.open) return void window.PartnersModal.open(id);
    } catch {}
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest?.('[data-page="partners"] [data-act="edit"], [data-view="partners"] [data-act="edit"], [data-page="partners"] [data-partner-id], [data-view="partners"] [data-partner-id]');
    if (!btn) return;
    const id = partnerIdFrom(btn);
    if (!id) return;
    ev.preventDefault();
    openPartnerModal(id);
  }, true);

  document.addEventListener("dblclick", (ev) => {
    const scope = ev.target.closest?.('[data-page="partners"], #partners, [data-view="partners"]');
    if (!scope) return;
    const id = partnerIdFrom(ev.target);
    if (!id) return;
    ev.preventDefault();
    openPartnerModal(id);
  }, true);
})();
