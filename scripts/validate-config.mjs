#!/usr/bin/env node
/**
 * validate-config.mjs — CLI CONFIG validator for Krevio demos
 * ────────────────────────────────────────────────────────────
 * Reads each configs/*.json and validates against the canonical schema.
 *
 * Usage:
 *   node scripts/validate-config.mjs              # validate as demos
 *   node scripts/validate-config.mjs --prod       # validate as production sites
 *
 * Exit codes:
 *   0 — all configs pass
 *   1 — one or more configs fail
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './config-schema.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIGS_DIR = join(PROJECT_ROOT, 'configs');

const isDemoOnly = !process.argv.includes('--prod');

function discoverConfigs() {
  return readdirSync(CONFIGS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => ({ name: f.replace(/\.json$/, ''), relPath: `configs/${f}`, fullPath: join(CONFIGS_DIR, f) }));
}

function loadConfig(fullPath) {
  try {
    return { config: JSON.parse(readFileSync(fullPath, 'utf-8')), error: null };
  } catch (e) {
    return { config: null, error: e.code === 'ENOENT' ? 'file not found' : `parse error: ${e.message}` };
  }
}

function summarize(errors) {
  const missing = errors.filter(e => e.startsWith('missing')).map(e => e.replace(/^missing (?:required|production) field: /, ''));
  const others = errors.filter(e => !e.startsWith('missing'));
  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  if (others.length) parts.push(others.join('; '));
  return parts.join('; ');
}

function main() {
  const configs = discoverConfigs();
  if (configs.length === 0) {
    console.log('No .json files found in configs/');
    process.exit(0);
  }

  console.log(`Validating CONFIG objects${isDemoOnly ? ' (demo mode)' : ' (production mode)'}...\n`);

  let passed = 0;
  const failures = [];

  for (const c of configs) {
    const { config, error } = loadConfig(c.fullPath);
    if (error) {
      console.log(`  ${c.relPath.padEnd(40)} \u2717 ${error}`);
      failures.push({ relPath: c.relPath, errors: [error] });
      continue;
    }
    const result = validateConfig(config, { isDemoOnly });
    if (result.valid) {
      passed++;
      console.log(`  ${c.relPath.padEnd(40)} \u2713 valid (${result.fieldCount} fields)`);
    } else {
      console.log(`  ${c.relPath.padEnd(40)} \u2717 ${summarize(result.errors)}`);
      failures.push({ relPath: c.relPath, errors: result.errors });
    }
  }

  console.log(`\n${passed}/${configs.length} passed, ${failures.length} failed.`);

  if (failures.length) {
    console.log('\nDetails:');
    for (const f of failures) {
      console.log(`  ${f.relPath}:`);
      f.errors.forEach(e => console.log(`    - ${e}`));
    }
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main();
