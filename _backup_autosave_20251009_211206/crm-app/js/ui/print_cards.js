/* crm-app/js/ui/print_cards.js */
(function () {
  if (window.__WIRED_printCards) return;
  window.__WIRED_printCards = true;

  async function getRows() {
    if (typeof window.getAllContacts === "function") return window.getAllContacts();
    return window.__DATA__?.contacts || [];
  }

  function normalizeDate(s) {
    if (!s) return null;
    try {
      const d = new Date(s);
      if (Number.isNaN(+d)) return null;
      return d;
    } catch {
      return null;
    }
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function groupRows(rows) {
    const out = [];
    for (const r of rows || []) {
      const b = normalizeDate(r.birthday);
      const a = normalizeDate(r.anniversary);
      const name = r?.name || r?.fullName || "";
      const phone = r?.phone || "";
      const note = r?.note || "";
      if (b) out.push({ type: "Birthday", date: b, name, phone, note });
      if (a) out.push({ type: "Anniversary", date: a, name, phone, note });
    }
    return out.sort((x, y) => {
      const mx = (x.date.getMonth() + 1) * 100 + x.date.getDate();
      const my = (y.date.getMonth() + 1) * 100 + y.date.getDate();
      return mx - my;
    });
  }

  function openPrint(cards) {
    const w = window.open("", "_blank");
    if (!w) return;
    const css = `
      *{box-sizing:border-box}
      body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#111;padding:20px}
      h1{font-size:18px;margin:0 0 12px 0}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .card{border:1px solid #ddd;border-radius:12px;padding:10px}
      .title{font-weight:700;margin-bottom:6px}
      .meta{font-size:12px;color:#555}
      @media print{
        .grid{grid-template-columns:repeat(3,1fr)}
        .card{break-inside:avoid}
      }
    `;
    const rows = cards
      .map(
        (c) => `
      <div class="card">
        <div class="title">${esc(c.name)}</div>
        <div class="meta">${esc(c.type)} • ${esc(c.date.toLocaleDateString())}</div>
        ${c.phone ? `<div class="meta">${esc(c.phone)}</div>` : ""}
        ${c.note ? `<div class="meta">${esc(c.note)}</div>` : ""}
      </div>
    `
      )
      .join("");

    w.document.write(`
      <html><head><title>CRM — Bulk Cards</title><style>${css}</style></head>
      <body>
        <h1>Birthdays & Anniversaries</h1>
        <div class="grid">${rows}</div>
        <script>window.onload=()=>setTimeout(()=>window.print(),150);<\/script>
      </body></html>
    `);
    w.document.close();
  }

  async function run() {
    const rows = await getRows();
    openPrint(groupRows(rows));
  }

  const btn = document.querySelector?.('[data-act="bulk-print-cards"]');
  if (btn) btn.addEventListener("click", run);

  window.openBulkCards = run;
})();
