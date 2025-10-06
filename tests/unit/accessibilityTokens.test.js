import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const basePath = resolve(__dirname, '../../crm-app');
const tokensPath = resolve(basePath, 'css/tokens.css');
const stylesPath = resolve(basePath, 'styles.css');

const tokensSource = readFileSync(tokensPath, 'utf8');
const stylesSource = readFileSync(stylesPath, 'utf8');

describe('accessibility tokens', () => {
  it('defines a base font size of at least 16px', () => {
    const match = tokensSource.match(/--body-font-size:\s*([0-9.]+)px/i);
    expect(match, 'body font size token should exist').toBeTruthy();
    expect(Number(match[1])).toBeGreaterThanOrEqual(16);
  });

  it('exposes a tap target token and enforces it in styles', () => {
    expect(tokensSource).toMatch(/--tap-target-size:\s*44px/i);
    expect(stylesSource).toMatch(/var\(--tap-target-size\)/);
  });

  it('adds a visible focus outline rule', () => {
    expect(stylesSource).toMatch(/:focus-visible/);
    expect(stylesSource).toMatch(/outline:2px solid var\(--ring\)/);
  });
});
