const { test, expect } = require('@playwright/test');

test('boot announces and registers patches', async ({ page }) => {
  const bootLogPromise = page.waitForEvent('console', {
    predicate: msg => /^BOOT OK/i.test(msg.text()),
    timeout: 10000
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    return Array.isArray(window.__PATCHES_LOADED__) && window.__PATCHES_LOADED__.length > 0;
  }, null, { timeout: 10000 });

  const bootLog = await bootLogPromise.catch(() => null);
  expect(bootLog, 'console should emit BOOT OK message').not.toBeNull();

  const patches = await page.evaluate(() => Array.isArray(window.__PATCHES_LOADED__)
    ? window.__PATCHES_LOADED__.slice()
    : []);
  expect(patches.length, '__PATCHES_LOADED__ should include loaded scripts').toBeGreaterThan(0);
});
test('settings edits repaint immediately and persist across reloads', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('#goal-funded-label');
  await page.waitForSelector('#compose-preview');

  await page.click('#btn-open-settings');
  await page.click('#settings-nav button[data-panel="goals"]');
  await page.fill('#goal-funded', '5');
  await page.fill('#goal-volume', '750000');
  await page.click('#btn-goals-save');

  await page.click('button[data-nav="dashboard"]');
  await expect(page.locator('#goal-funded-label')).toContainText('of 5');
  await expect(page.locator('#goal-volume-label')).toContainText('750,000');

  await page.click('#btn-open-settings');
  await page.click('#settings-nav button[data-panel="profile"]');
  await page.fill('#lo-name', 'Alex Morgan');
  await page.fill('#lo-email', 'alex.morgan@example.com');
  await page.fill('#lo-phone', '555-0100');
  await page.fill('#lo-signature', 'Cheers,\n{loName}');
  await page.click('#btn-lo-save');

  const chipName = page.locator('#lo-profile-chip [data-role="lo-name"]');
  const chipContact = page.locator('#lo-profile-chip [data-role="lo-contact"]');
  await expect(chipName).toHaveText('Alex Morgan');
  await expect(chipContact).toContainText('alex.morgan@example.com');

  const fallbackPreview = await page.locator('#compose-preview').inputValue();
  expect(fallbackPreview).toContain('Cheers,\nAlex Morgan');

  await page.click('#settings-nav button[data-panel="signatures"]');
  await page.click('#btn-sig-add');
  const sigRow = page.locator('#sig-table tbody tr').first();
  await sigRow.locator('input[type="text"]').fill('Primary');
  await sigRow.locator('textarea').fill('Best,\n{loName}');
  const signaturePreview = page.locator('#signatures-editor [data-role="signature-preview"]');
  await expect(signaturePreview).toHaveText(/Best,\s+Alex Morgan/);
  await sigRow.locator('[data-action="save"]').click();
  await expect(sigRow.locator('input[type="radio"]')).toBeEnabled();

  const composePreview = await page.locator('#compose-preview').inputValue();
  expect(composePreview).toContain('Best,\nAlex Morgan');

  await page.reload();
  await page.waitForSelector('#goal-funded-label');
  await expect(page.locator('#lo-profile-chip [data-role="lo-name"]')).toHaveText('Alex Morgan');
  await expect(page.locator('#lo-profile-chip [data-role="lo-contact"]')).toContainText('alex.morgan@example.com');
  await expect(page.locator('#goal-funded-label')).toContainText('5');
  await expect(page.locator('#goal-volume-label')).toContainText('750,000');

  await page.click('#btn-open-settings');
  await page.click('#settings-nav button[data-panel="goals"]');
  await expect(page.locator('#goal-funded')).toHaveValue('5');
  await expect(page.locator('#goal-volume')).toHaveValue('750000');
  await page.click('#settings-nav button[data-panel="profile"]');
  await expect(page.locator('#lo-name')).toHaveValue('Alex Morgan');
  await expect(page.locator('#lo-email')).toHaveValue('alex.morgan@example.com');
  await expect(page.locator('#lo-phone')).toHaveValue('555-0100');
  await page.click('#settings-nav button[data-panel="signatures"]');
  await expect(page.locator('#signatures-editor [data-role="signature-preview"]')).toHaveText(/Best,\s+Alex Morgan/);
  await expect(page.locator('#compose-preview')).toHaveValue(/Best,\s+Alex Morgan/);
});
test('contact modal resolves pipeline rows and persists changes', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('#tbl-pipeline tbody');
  await page.evaluate(() => {
    window.__EVENT_COUNTER__ = { app: 0 };
    document.addEventListener('app:data:changed', () => { window.__EVENT_COUNTER__.app += 1; });
  });

  const suffix = Date.now().toString().slice(-6);
  const firstName = 'Modal';
  const lastName = `Tester${suffix}`;
  const email = `modal.tester${suffix}@example.com`;
  const phone = `555${suffix}`;

  await page.click('#btn-add-contact');
  await page.waitForSelector('#contact-modal[open]');
  await page.fill('#c-first', firstName);
  await page.fill('#c-last', lastName);
  await page.fill('#c-email', email);
  await page.fill('#c-phone', phone);

  const beforeCreate = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  await page.click('#btn-save-contact');
  await page.waitForFunction(prev => window.__EVENT_COUNTER__ && window.__EVENT_COUNTER__.app > prev, beforeCreate);
  await page.waitForFunction(() => !document.querySelector('#contact-modal')?.hasAttribute('open'));
  const afterCreate = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  expect(afterCreate - beforeCreate).toBe(1);

  const pipelineRow = page.locator('#tbl-pipeline tbody tr', { hasText: lastName });
  await expect(pipelineRow).toHaveCount(1);
  await pipelineRow.locator('.contact-name a').first().click();
  await page.waitForSelector('#contact-modal[open]');
  await expect(page.locator('#c-first')).toHaveValue(firstName);
  await expect(page.locator('#c-last')).toHaveValue(lastName);
  await expect(page.locator('#c-email')).toHaveValue(email);

  await page.selectOption('#c-stage', 'processing');
  await page.fill('#c-amount', '325000');

  const beforeUpdate = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  await page.click('#btn-save-contact');
  await page.waitForFunction(prev => window.__EVENT_COUNTER__ && window.__EVENT_COUNTER__.app > prev, beforeUpdate);
  await page.waitForFunction(() => !document.querySelector('#contact-modal')?.hasAttribute('open'));
  const afterUpdate = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  expect(afterUpdate - beforeUpdate).toBe(1);

  await expect(pipelineRow.locator('td').nth(2)).toContainText(/processing/i);
  await expect(pipelineRow.locator('td').nth(4)).toContainText('$325,000');

  await page.reload();
  await page.waitForSelector('#tbl-pipeline tbody');
  const persistedRow = page.locator('#tbl-pipeline tbody tr', { hasText: lastName });
  await expect(persistedRow).toHaveCount(1);
  await expect(persistedRow.locator('td').nth(2)).toContainText(/processing/i);
  await expect(persistedRow.locator('td').nth(4)).toContainText('$325,000');
  await persistedRow.locator('.contact-name a').first().click();
  await page.waitForSelector('#contact-modal[open]');
  await expect(page.locator('#c-stage')).toHaveValue('processing');
  await expect(page.locator('#c-amount')).toHaveValue('325000');
  await expect(page.locator('#c-email')).toHaveValue(email);
  await page.click('#contact-modal [data-close]');
  await page.waitForFunction(() => !document.querySelector('#contact-modal')?.hasAttribute('open'));
});

test('quick add creates a new contact immediately and persists', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('#tbl-pipeline tbody');
  await page.evaluate(() => {
    window.__EVENT_COUNTER__ = { app: 0 };
    document.addEventListener('app:data:changed', () => { window.__EVENT_COUNTER__.app += 1; });
  });

  const suffix = Date.now().toString().slice(-6);
  const firstName = 'Quick';
  const lastName = `Adder${suffix}`;
  const email = `quick.adder${suffix}@example.com`;
  const phone = `555-9${suffix}`;

  await page.click('#quick-add');
  await page.waitForSelector('#quick-add-modal[open]');
  await page.fill('#quick-first', firstName);
  await page.fill('#quick-last', lastName);
  await page.fill('#quick-email', email);
  await page.fill('#quick-phone', phone);
  await page.fill('#quick-notes', 'Met at a community event');

  const beforeCreate = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  await page.click('#quick-add-save');
  await page.waitForFunction(prev => window.__EVENT_COUNTER__ && window.__EVENT_COUNTER__.app > prev, beforeCreate);
  await page.waitForFunction(() => !document.querySelector('#quick-add-modal')?.hasAttribute('open'));
  const afterCreate = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  expect(afterCreate - beforeCreate).toBe(1);

  const newRow = page.locator('#tbl-pipeline tbody tr', { hasText: lastName });
  await expect(newRow).toHaveCount(1);
  await expect(newRow.first().locator('.contact-name')).toContainText(firstName);
  await expect(newRow.first().locator('td').nth(2)).toContainText(/application/i);

  await page.reload();
  await page.waitForSelector('#tbl-pipeline tbody');
  const persisted = page.locator('#tbl-pipeline tbody tr', { hasText: lastName });
  await expect(persisted).toHaveCount(1);
  await expect(persisted.first().locator('.contact-name')).toContainText(firstName);
  await expect(persisted.first().locator('td').nth(2)).toContainText(/application/i);
});

test('partner modal opens from table rows and dispatches once', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('#goal-funded-label');
  await page.evaluate(() => {
    window.__EVENT_COUNTER__ = { app: 0 };
    document.addEventListener('app:data:changed', () => { window.__EVENT_COUNTER__.app += 1; });
  });

  await page.click('#main-nav button[data-nav="partners"]');
  await page.waitForSelector('#tbl-partners tbody tr:visible');
  const visibleRows = page.locator('#tbl-partners tbody tr:visible');
  await expect(visibleRows.first()).toBeVisible();
  const targetRow = visibleRows.first();
  const partnerName = (await targetRow.locator('.partner-name').textContent()).trim();
  await targetRow.locator('.partner-name').click();
  await page.waitForSelector('#partner-modal[open]');
  await expect(page.locator('#p-name')).toHaveValue(partnerName);

  const phoneSuffix = Date.now().toString().slice(-4);
  const newPhone = `555-7${phoneSuffix}`;
  await page.fill('#p-phone', newPhone);

  const beforeSave = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  await page.click('#p-save');
  await page.waitForFunction(prev => window.__EVENT_COUNTER__ && window.__EVENT_COUNTER__.app > prev, beforeSave);
  await page.waitForFunction(() => !document.querySelector('#partner-modal')?.hasAttribute('open'));
  const afterSave = await page.evaluate(() => window.__EVENT_COUNTER__.app);
  expect(afterSave - beforeSave).toBe(1);

  const updatedRow = page.locator('#tbl-partners tbody tr:visible', { hasText: partnerName }).first();
  await expect(updatedRow.locator('td').nth(4)).toContainText(newPhone);

  await page.reload();
  await page.click('#main-nav button[data-nav="partners"]');
  const persistedPartner = page.locator('#tbl-partners tbody tr:visible', { hasText: partnerName }).first();
  await expect(persistedPartner.locator('td').nth(4)).toContainText(newPhone);
});