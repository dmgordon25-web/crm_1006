#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const appCandidates = [
  'crm-app'
];
const appRoot = appCandidates
  .map(candidate => path.join(repoRoot, candidate))
  .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());

if(!appRoot){
  throw new Error('manifest_audit: unable to locate CRM application root');
}

const jsRoot = path.join(appRoot, 'js');
const manifestPath = path.join(jsRoot, 'boot', 'manifest.js');

const ASCII_ELLIPSIS = '.'.repeat(3);
const UNICODE_ELLIPSIS = '\u2026';
const TEXT_EXTENSIONS = new Set(['.js', '.html', '.md', '.ps1']);
const WALK_SKIP_DIRECTORIES = new Set(['.git', 'node_modules']);
const MONITORED_EVENT = 'app:data:changed';

const DUPLICATE_ALLOWLIST = Object.freeze({
  'js/app.js': { 'app:data:changed': 3 },
  'js/commissions.js': { 'app:data:changed': 2 }
});

function normalizeRel(p){
  return p.split(path.sep).join('/');
}

async function loadManifestEntries(){
  const moduleUrl = pathToFileURL(manifestPath).href;
  const manifestModule = await import(moduleUrl);
  const list = Array.isArray(manifestModule.default) ? manifestModule.default : [];
  return list.map(entry => normalizeManifestEntry(String(entry)));
}

function normalizeManifestEntry(entry){
  const withoutQuery = entry.split('?')[0];
  const normalized = withoutQuery.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if(normalized.startsWith('js/')) return normalized;
  return normalizeRel(path.join('js', normalized));
}

async function walk(dir, options = {}){
  const skipDirectories = options.skipDirectories ? new Set(options.skipDirectories) : new Set();
  const stack = [dir];
  const results = [];
  while(stack.length){
    const current = stack.pop();
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for(const entry of entries){
      if(entry.name === '.DS_Store') continue;
      if(entry.isDirectory() && skipDirectories.has(entry.name)) continue;
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

function resolveImport(fromRel, spec){
  if(!spec) return null;
  const cleaned = spec.split('?')[0];
  if(cleaned.startsWith('data:')) return null;
  const normalized = cleaned.replace(/\\/g, '/');
  const fromDir = path.dirname(fromRel);
  const attempts = [];
  if(normalized.startsWith('.')){
    const absoluteBase = path.resolve(appRoot, fromDir, normalized);
    attempts.push(absoluteBase);
    attempts.push(`${absoluteBase}.js`);
    attempts.push(path.join(absoluteBase, 'index.js'));
  }else if(normalized.startsWith('js/')){
    const absoluteBase = path.resolve(appRoot, normalized);
    attempts.push(absoluteBase);
  }else{
    return null;
  }
  for(const attempt of attempts){
    if(fs.existsSync(attempt) && fs.statSync(attempt).isFile()){
      return normalizeRel(path.relative(appRoot, attempt));
    }
  }
  return null;
}

function collectImports(relPath){
  const absolutePath = path.join(appRoot, relPath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const dependencies = new Set();
  const importRe = /import\s+(?:[^'";]+?from\s+)?['"]([^'"\n]+)['"]/g;
  const exportRe = /export\s+(?:\*|\{[^}]+\})\s+from\s+['"]([^'"\n]+)['"]/g;
  const dynamicRe = /import\(\s*(['"])([^'"\n]+)\1\s*\)/g;
  const requireRe = /require\(\s*(['"])([^'"\n]+)\1\s*\)/g;
  const push = spec => {
    const resolved = resolveImport(relPath, spec);
    if(resolved) dependencies.add(resolved);
  };
  let match;
  while((match = importRe.exec(text))){ push(match[1]); }
  while((match = exportRe.exec(text))){ push(match[1]); }
  while((match = dynamicRe.exec(text))){ push(match[2]); }
  while((match = requireRe.exec(text))){ push(match[2]); }
  return dependencies;
}

function buildLineIndex(text){
  const positions = [0];
  for(let i = 0; i < text.length; i += 1){
    if(text.charCodeAt(i) === 10){
      positions.push(i + 1);
    }
  }
  return positions;
}

function lineNumberFor(indexes, position){
  let low = 0;
  let high = indexes.length - 1;
  while(low <= high){
    const mid = Math.floor((low + high) / 2);
    if(indexes[mid] <= position){
      if(mid === indexes.length - 1 || indexes[mid + 1] > position){
        return mid + 1;
      }
      low = mid + 1;
    }else{
      high = mid - 1;
    }
  }
  return indexes.length;
}

function isIdentifierChar(char){
  if(!char) return false;
  const code = char.charCodeAt(0);
  if(code >= 48 && code <= 57) return true;
  if(code >= 65 && code <= 90) return true;
  if(code >= 97 && code <= 122) return true;
  return char === '_' || char === '$';
}

function findNextNonWhitespace(text, start){
  for(let i = start; i < text.length; i += 1){
    const code = text.charCodeAt(i);
    if(code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32) continue;
    return { index: i, char: text[i] };
  }
  return null;
}

function findDuplicateListeners(relPath){
  const absolutePath = path.join(appRoot, relPath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const index = buildLineIndex(text);
  const directRe = /(?:addEventListener|on)\s*\(\s*(['"])(app:data:changed|selection:changed)\1/gi;
  const diagRe = /addDiagListener\s*\(\s*[^,]+,\s*(['"])(app:data:changed|selection:changed)\1/gi;
  const byEvent = new Map();
  const processMatch = (match, event, position) => {
    if(event !== MONITORED_EVENT) return;
    if(!byEvent.has(event)) byEvent.set(event, []);
    byEvent.get(event).push({ line: lineNumberFor(index, position), kind: 'add' });
  };
  let match;
  while((match = directRe.exec(text))){
    processMatch(match[0], match[2], match.index);
  }
  while((match = diagRe.exec(text))){
    processMatch(match[0], match[2], match.index);
  }
  const duplicates = [];
  for(const [event, locations] of byEvent.entries()){
    if(locations.length > 1){
      duplicates.push({ event, lines: locations.map(loc => loc.line) });
    }
  }
  return duplicates;
}

function findEllipsisTokensForFile(absolutePath){
  const text = fs.readFileSync(absolutePath, 'utf8');
  if(!text.includes(UNICODE_ELLIPSIS) && text.indexOf(ASCII_ELLIPSIS) === -1) return [];
  const index = buildLineIndex(text);
  const hits = [];

  let unicodePosition = text.indexOf(UNICODE_ELLIPSIS);
  while(unicodePosition !== -1){
    hits.push({ line: lineNumberFor(index, unicodePosition), kind: 'unicode' });
    unicodePosition = text.indexOf(UNICODE_ELLIPSIS, unicodePosition + 1);
  }

  let asciiPosition = text.indexOf(ASCII_ELLIPSIS);
  while(asciiPosition !== -1){
    const next = findNextNonWhitespace(text, asciiPosition + ASCII_ELLIPSIS.length);
    if(next && isIdentifierChar(next.char)){
      asciiPosition = text.indexOf(ASCII_ELLIPSIS, asciiPosition + 1);
      continue;
    }
    hits.push({ line: lineNumberFor(index, asciiPosition), kind: 'ascii' });
    asciiPosition = text.indexOf(ASCII_ELLIPSIS, asciiPosition + 1);
  }

  return hits;
}

async function collectEllipsisFindings(){
  const results = [];
  const directories = [appRoot, path.join(repoRoot, 'tools')];

  for(const base of directories){
    if(!base) continue;
    if(!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
    const files = await walk(base, { skipDirectories: WALK_SKIP_DIRECTORIES });
    for(const file of files){
      const extension = path.extname(file).toLowerCase();
      if(!TEXT_EXTENSIONS.has(extension)) continue;
      const hits = findEllipsisTokensForFile(file);
      hits.forEach(hit => {
        results.push({
          file: normalizeRel(path.relative(repoRoot, file)),
          line: hit.line,
          kind: hit.kind
        });
      });
    }
  }

  results.sort((a, b) => {
    if(a.file === b.file){
      if(a.line === b.line) return a.kind.localeCompare(b.kind);
      return a.line - b.line;
    }
    return a.file.localeCompare(b.file);
  });

  return results;
}

function shouldSkipFromOrphanReport(relPath){
  if(relPath.startsWith('js/boot/')) return true;
  if(relPath.includes('/_legacy/')) return true;
  return false;
}

function isDuplicateAllowed(file, event, count){
  const fileEntry = DUPLICATE_ALLOWLIST[file];
  if(!fileEntry) return false;
  const limit = fileEntry[event];
  return typeof limit === 'number' && count <= limit;
}

async function gatherAudit(){
  const manifestEntries = await loadManifestEntries();
  const manifestSet = new Set(manifestEntries);
  const jsFiles = (await walk(jsRoot))
    .filter(file => file.endsWith('.js'))
    .map(file => normalizeRel(path.relative(appRoot, file)));

  const dependencyGraph = new Map();
  jsFiles.forEach(rel => {
    dependencyGraph.set(rel, collectImports(rel));
  });

  const reachable = new Set();
  const stack = manifestEntries.filter(entry => dependencyGraph.has(entry));
  while(stack.length){
    const current = stack.pop();
    if(reachable.has(current)) continue;
    reachable.add(current);
    const deps = dependencyGraph.get(current) || new Set();
    for(const dep of deps){
      if(!dependencyGraph.has(dep)) continue;
      stack.push(dep);
    }
  }

  const orphans = jsFiles
    .filter(file => !manifestSet.has(file) && !reachable.has(file) && !shouldSkipFromOrphanReport(file))
    .sort();

  const duplicateListeners = [];
  jsFiles.forEach(file => {
    if(file.includes('/_legacy/')) return;
    const duplicates = findDuplicateListeners(file);
    duplicates.forEach(entry => {
      const count = entry.lines.length;
      const allowed = isDuplicateAllowed(file, entry.event, count);
      duplicateListeners.push({ file, event: entry.event, lines: entry.lines, count, allowed });
    });
  });
  duplicateListeners.sort((a, b) => {
    if(a.file === b.file){
      if(a.event === b.event) return a.lines[0] - b.lines[0];
      return a.event.localeCompare(b.event);
    }
    return a.file.localeCompare(b.file);
  });

  const ellipsisFindings = await collectEllipsisFindings();

  const duplicateViolations = duplicateListeners.filter(item => !item.allowed);

  return {
    appRoot: normalizeRel(path.relative(repoRoot, appRoot)),
    manifestEntries: manifestEntries.sort(),
    orphans,
    duplicateListeners,
    duplicateViolations,
    ellipsisFindings
  };
}

function formatSection(title, items, formatter){
  console.log(`\n${title}`);
  if(!items.length){
    console.log(' - None');
    return;
  }
  items.forEach(item => console.log(` - ${formatter(item)}`));
}

async function runAudit(options = {}){
  const result = await gatherAudit();
  if(!options.silent){
    console.log(`manifest_audit: ${result.appRoot}`);
    formatSection('ORPHANS', result.orphans, item => item);
    formatSection('DUP_LISTENERS', result.duplicateListeners, item => {
      const summary = `${item.file} (${item.event} @ ${item.lines.join(', ')})`;
      if(item.allowed) return `${summary} [baseline]`;
      return `${summary} [violation]`;
    });
    formatSection('ELLIPSIS', result.ellipsisFindings, item => `${item.file}:${item.line} [${item.kind}]`);
  }
  return result;
}

module.exports = {
  runAudit
};

if(require.main === module){
  runAudit().then(result => {
    const hasIssues = result.orphans.length > 0 || result.duplicateViolations.length > 0 || result.ellipsisFindings.length > 0;
    if(hasIssues) process.exitCode = 1;
  }).catch(err => {
    console.error('manifest_audit: unhandled error');
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  });
}
