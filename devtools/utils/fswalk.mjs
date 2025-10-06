import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function* walk(dir, { exts = ['.js', '.mjs'], ignore = [] } = {}) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = await readdir(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const p = join(cur, ent.name);
      if (ignore.some(x => p.includes(x))) continue;
      if (ent.isDirectory()) { stack.push(p); continue; }
      if (exts.length && !exts.some(e => p.endsWith(e))) continue;
      yield p;
    }
  }
}
