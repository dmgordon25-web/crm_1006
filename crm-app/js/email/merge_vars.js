export function dot(obj, path, fallback = '') {
  try {
    return String(
      path
        .split('.')
        .reduce((acc, key) => ((acc && acc[key] != null) ? acc[key] : undefined), obj)
      ?? fallback
    );
  } catch {
    return String(fallback);
  }
}

export function compile(template, data) {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
    const value = dot(data, path, match);
    return value;
  });
}

export async function sampleData() {
  const res = { contact: {}, partner: {}, date: { today: new Date().toLocaleDateString() } };
  try {
    const selection = (window.Selection && typeof window.Selection.current === 'function')
      ? window.Selection.current()
      : { ids: [] };
    const id = selection && selection.ids && selection.ids[0];
    const dbModule = await import('/js/db.js').catch(() => null);
    if (dbModule && dbModule.openDB) {
      await dbModule.openDB();
      if (id && (dbModule.dbGetContact || dbModule.getContact)) {
        const getter = dbModule.dbGetContact || dbModule.getContact;
        res.contact = (await getter(id)) || {};
      } else if (dbModule.dbAllContacts) {
        const rows = await dbModule.dbAllContacts();
        res.contact = (rows && rows[0]) || {};
      }
      if (dbModule.dbAllPartners) {
        const partners = await dbModule.dbAllPartners();
        res.partner = (partners && partners[0]) || {};
      }
    }
  } catch {}
  return res;
}
