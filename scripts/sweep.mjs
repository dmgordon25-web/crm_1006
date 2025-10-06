#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const appCandidates = [
  'crm-app'
];
const appRoot = appCandidates
  .map(candidate => path.resolve(repoRoot, candidate))
  .find(candidate => fs.stat(candidate).then(stat => stat.isDirectory()).catch(()=>false));

if(!appRoot){
  console.error('[sweep] Unable to locate application root.');
  process.exit(2);
}

const manifestPath = path.join(appRoot, 'js', 'boot', 'manifest.js');

async function loadManifest(){
  try{
    const url = pathToFileURL(manifestPath).href;
    const mod = await import(url);
    const list = Array.isArray(mod.default) ? mod.default : [];
    return list.map(item => String(item).replace(/^\.\//,'')).map(normalizeRel);
  }catch(err){
    console.error('[sweep] Failed to import manifest', err);
    return [];
  }
}

function normalizeRel(p){
  return p.split(path.sep).join('/');
}

async function walk(dir){
  const results = [];
  const stack = [dir];
  while(stack.length){
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes:true });
    for(const entry of entries){
      if(entry.name === '.DS_Store') continue;
      const full = path.join(current, entry.name);
      if(entry.isDirectory()){
        stack.push(full);
      }else{
        results.push(full);
      }
    }
  }
  return results;
}

function relativeToApp(file){
  return normalizeRel(path.relative(appRoot, file));
}

async function detectUnreferenced(){
  const manifestEntries = new Set(await loadManifest());
  const files = await walk(path.join(appRoot, 'js'));
  const scripts = files.filter(file => file.endsWith('.js'));
  const ignored = new Set([
    'boot/loader.js',
    'boot/manifest.js',
    'js/boot/loader.js',
    'js/boot/manifest.js'
  ]);
  const unreferenced = [];
  for(const file of scripts){
    const rel = relativeToApp(file);
    if(ignored.has(rel)) continue;
    if(manifestEntries.has(rel)) continue;
    unreferenced.push(rel);
  }
  return unreferenced.sort();
}

async function detectDuplicateListeners(){
  const files = await walk(appRoot);
  const findings = [];
  const LISTENER_IGNORE = new Set([
    'js/app.js',
    'js/core/renderGuard.js'
  ]);
  for(const file of files){
    if(!file.endsWith('.js')) continue;
    const text = await fs.readFile(file, 'utf8');
    const matches = text.match(/addEventListener\(\s*['\"]app:data:changed['\"]/g);
    if(matches && matches.length > 1){
      const rel = relativeToApp(file);
      if(LISTENER_IGNORE.has(rel)) continue;
      findings.push({
        file: rel,
        count: matches.length
      });
    }
  }
  return findings.sort((a,b)=> a.file.localeCompare(b.file));
}

async function detectEllipsis(){
  const files = await walk(appRoot);
  const matches = [];
  for(const file of files){
    if(!file.endsWith('.js') && !file.endsWith('.css') && !file.endsWith('.html') && !file.endsWith('.md') && !file.endsWith('.txt')) continue;
    const text = await fs.readFile(file, 'utf8');
    if(text.includes('…')){
      matches.push(relativeToApp(file));
    }
  }
  return matches.sort();
}

const LEGACY_MARKERS = [
  'js/_graveyard',
  'js/calendar_v1.js',
  'js/calendar_legacy.js',
  'js/kanban_legacy.js',
  'js/grid.js',
  'js/_legacy/root.js',
  'js/root_legacy.js'
];

async function detectLegacyRoots(){
  const findings = [];
  for(const marker of LEGACY_MARKERS){
    const target = path.join(appRoot, marker);
    try{
      const stat = await fs.stat(target);
      if(stat.isDirectory()) findings.push(normalizeRel(marker) + '/');
      else findings.push(normalizeRel(marker));
    }catch(_err){
      // missing => fine
    }
  }
  return findings.sort();
}

async function detectLegacyCalendarFragments(){
  const patterns = [/calendar-legacy/i, /old-calendar/i, /legacy-grid/i];
  const files = await walk(appRoot);
  const hits = [];
  for(const file of files){
    if(!file.endsWith('.js') && !file.endsWith('.html') && !file.endsWith('.css')) continue;
    const text = await fs.readFile(file, 'utf8');
    for(const pattern of patterns){
      if(pattern.test(text)){
        hits.push({ file: relativeToApp(file), pattern: pattern.source });
        break;
      }
    }
  }
  return hits.sort((a,b)=> a.file.localeCompare(b.file));
}

function formatReport({ unreferencedModules, duplicateListeners, ellipsisMatches, legacyRoots, legacyCalendars }){
  const lines = [];
  lines.push('# Sweep Report');
  lines.push('');
  lines.push(`Application root: ${path.basename(appRoot)}`);
  lines.push('');
  const sections = [
    ['Unreferenced Modules', unreferencedModules, item => `- ${item}`],
    ['Duplicate app:data:changed listeners', duplicateListeners, item => `- ${item.file} (x${item.count})`],
    ['Suspicious ellipsis characters', ellipsisMatches, item => `- ${item}`],
    ['Legacy roots detected', legacyRoots, item => `- ${item}`],
    ['Legacy calendar/grid markers', legacyCalendars, item => `- ${item.file} (${item.pattern})`]
  ];
  for(const [title, list, mapper] of sections){
    lines.push(`## ${title}`);
    if(!list.length){
      lines.push('- None');
    }else{
      list.forEach(entry => lines.push(mapper(entry)));
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(){
  const [unreferencedModules, duplicateListeners, ellipsisMatches, legacyRoots, legacyCalendars] = await Promise.all([
    detectUnreferenced(),
    detectDuplicateListeners(),
    detectEllipsis(),
    detectLegacyRoots(),
    detectLegacyCalendarFragments()
  ]);

  const reportDir = path.join(repoRoot, 'reports');
  await fs.mkdir(reportDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    appRoot: path.relative(repoRoot, appRoot),
    unreferencedModules,
    duplicateListeners,
    ellipsisMatches,
    legacyRoots,
    legacyCalendars
  };

  await fs.writeFile(path.join(reportDir, 'orphan_report.json'), JSON.stringify(summary, null, 2));
  await fs.writeFile(path.join(reportDir, 'orphan_report.txt'), formatReport(summary));

  const hasStrictErrors = legacyRoots.length > 0 || legacyCalendars.length > 0;
  const hasIssues = hasStrictErrors || unreferencedModules.length > 0 || duplicateListeners.length > 0 || ellipsisMatches.length > 0;

  if(process.argv.includes('--summary')){
    console.log(formatReport(summary));
  }else{
    console.log(`[sweep] Report written to reports/orphan_report.{json,txt}`);
  }

  const strict = process.argv.includes('--strict');
  if(strict && hasStrictErrors){
    console.error('[sweep] Legacy roots or calendar/grid markers detected.');
    process.exit(3);
  }
  if(strict && hasIssues){
    console.error('[sweep] Findings present under strict mode.');
    process.exit(4);
  }
  process.exit(hasIssues ? 1 : 0);
}

main().catch(err => {
  console.error('[sweep] Unhandled error', err);
  process.exit(99);
});
