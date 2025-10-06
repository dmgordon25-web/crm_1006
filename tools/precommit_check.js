#!/usr/bin/env node
const { runAudit } = require('./manifest_audit');

async function main(){
  const result = await runAudit({ silent: true });
  let failed = false;

  const disallowedDuplicates = result.duplicateListeners.filter(entry => !entry.allowed);
  if(disallowedDuplicates.length){
    failed = true;
    console.error('precommit_check: duplicate listeners detected:');
    disallowedDuplicates.forEach(entry => {
      console.error(` - ${entry.file} (${entry.event} @ ${entry.lines.join(', ')})`);
    });
  }

  if(result.suspiciousTokens.length){
    failed = true;
    console.error('precommit_check: suspicious ellipsis tokens detected:');
    result.suspiciousTokens.forEach(entry => {
      console.error(` - ${entry.file}:${entry.line}`);
    });
  }

  if(failed){
    console.error('\nResolve the findings above before committing.');
    process.exit(1);
  }

  console.log('precommit_check: clean — no duplicate listeners or suspicious tokens detected.');
}

main().catch(err => {
  console.error('precommit_check: unhandled error');
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
});
