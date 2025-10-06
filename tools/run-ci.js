#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const env = { ...process.env };
['npm_config_http_proxy', 'npm_config_https_proxy', 'npm_config_proxy', 'NPM_CONFIG_HTTP_PROXY', 'NPM_CONFIG_HTTPS_PROXY', 'NPM_CONFIG_PROXY'].forEach(key => {
  if (key in env) {
    delete env[key];
  }
});

function run(command, args) {
  const options = {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: false
  };
  const result = spawnSync(command, args, options);
  if (result.error && result.error.code === 'ENOENT' && process.platform === 'win32') {
    // Retry with shell fallback to locate .cmd wrappers on Windows
    const shellResult = spawnSync(`${command} ${args.join(' ')}`, { ...options, shell: true });
    if (shellResult.status !== 0) {
      process.exit(shellResult.status || 1);
    }
    return;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const vitestBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', '.bin', 'vitest.cmd')
  : path.join(projectRoot, 'node_modules', '.bin', 'vitest');
const playwrightBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', '.bin', 'playwright.cmd')
  : path.join(projectRoot, 'node_modules', '.bin', 'playwright');

run(vitestBin, ['run', '--config', 'vitest.config.mjs']);
run(playwrightBin, ['test']);
