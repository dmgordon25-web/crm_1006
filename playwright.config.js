const { defineConfig } = require('@playwright/test');
const path = require('path');

const serveRoot = path.join(__dirname, 'crm-app');
const serverScript = path.join(__dirname, 'tools', 'node_static_server.js');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  timeout: 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ],
  webServer: {
    command: `node ${JSON.stringify(serverScript)} ${JSON.stringify(serveRoot)} 8080`,
    port: 8080,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  }
});
