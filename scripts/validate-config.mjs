#!/usr/bin/env node
/**
 * validate-config.mjs — CLI CONFIG validator for Krevio demos
 * ────────────────────────────────────────────────────────────
 * Scans all demo index.html files, extracts the CONFIG object,
 * and validates each against the canonical schema.
 *
 * Usage:
 *   node scripts/validate-config.mjs              # validate demos only
 *   node scripts/validate-config.mjs --prod       # validate as production sites
 *
 * Exit codes:
 *   0 — all configs pass
 *   1 — one or more configs fail
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './config-schema.mjs';

// ── Resolve paths ───────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = join(__filename, '..', '..');
const DEMOS_DIR = join(PROJECT_ROOT, 'demos');

// ── CLI args ────────────────────────────────────────────────────

const isProd = process.argv.includes('--prod');
const isDemoOnly = !isProd;

// ── CONFIG extraction ───────────────────────────────────────────

/**
 * Extract the CONFIG object from an HTML file's inline <script>.
 * Uses a brace-counting approach to find the full object literal
 * after `const CONFIG = {`.
 *
 * Returns the parsed object or null if extraction fails.
 */
function extractConfig(filePath) {
  const html = readFileSync(filePath, 'utf-8');

  // Find the start of CONFIG assignment
  const marker = 'const CONFIG = {';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return { config: null, error: 'no CONFIG object found' };

  // Start from the opening brace
  const braceStart = startIdx + marker.length - 1;
  let depth = 0;
  let braceEnd = -1;

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];

    // Skip string contents (single-quoted, double-quoted, template literals)
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < html.length) {
        if (html[i] === '\\') { i++; } // skip escaped char
        else if (html[i] === quote) break;
        i++;
      }
      continue;
    }

    // Skip single-line comments
    if (ch === '/' && html[i + 1] === '/') {
      while (i < html.length && html[i] !== '\n') i++;
      continue;
    }

    // Skip multi-line comments
    if (ch === '/' && html[i + 1] === '*') {
      i += 2;
      while (i < html.length - 1 && !(html[i] === '*' && html[i + 1] === '/')) i++;
      i++; // skip past closing /
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }

  if (braceEnd === -1) {
    return { config: null, error: 'could not find closing brace for CONFIG' };
  }

  const objectSource = html.slice(braceStart, braceEnd + 1);

  // Evaluate safely-ish using Function constructor.
  // The CONFIG blocks contain only literals (strings, numbers, booleans,
  // arrays, objects) — no dynamic code. We wrap in a function that returns
  // the object literal.
  try {
    const fn = new Function(`return (${objectSource});`);
    const config = fn();
    return { config, error: null };
  } catch (e) {
    return { config: null, error: `parse error: ${e.message}` };
  }
}

// ── Discover demo directories ───────────────────────────────────

function discoverDemos() {
  const entries = readdirSync(DEMOS_DIR);
  const demos = [];

  for (const entry of entries) {
    // Skip the _template directory — it's a scaffold, not a live demo
    if (entry.startsWith('_')) continue;

    const dirPath = join(DEMOS_DIR, entry);
    const indexPath = join(dirPath, 'index.html');

    try {
      if (statSync(dirPath).isDirectory() && statSync(indexPath).isFile()) {
        demos.push({
          name: entry,
          filePath: indexPath,
          relPath: `demos/${entry}/index.html`,
        });
      }
    } catch {
      // Directory exists but no index.html — skip silently
    }
  }

  return demos.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Main ────────────────────────────────────────────────────────

function main() {
  const demos = discoverDemos();

  if (demos.length === 0) {
    console.log('No demo directories found in demos/');
    process.exit(0);
  }

  console.log(`Validating CONFIG objects${isDemoOnly ? ' (demo mode)' : ' (production mode)'}...`);
  console.log();

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const demo of demos) {
    const { config, error } = extractConfig(demo.filePath);

    if (error) {
      failed++;
      const line = `  ${demo.relPath.padEnd(40)} \u2717 ${error}`;
      console.log(line);
      failures.push({ demo: demo.relPath, errors: [error] });
      continue;
    }

    const result = validateConfig(config, { isDemoOnly });

    if (result.valid) {
      passed++;
      console.log(`  ${demo.relPath.padEnd(40)} \u2713 valid (${result.fieldCount} fields)`);
    } else {
      failed++;
      const missingFields = result.errors
        .filter(e => e.startsWith('missing'))
        .map(e => e.replace(/^missing (?:required|production) field: /, ''));

      const otherErrors = result.errors.filter(e => !e.startsWith('missing'));

      let summary = '';
      if (missingFields.length > 0) {
        summary += `missing: ${missingFields.join(', ')}`;
      }
      if (otherErrors.length > 0) {
        if (summary) summary += '; ';
        summary += otherErrors.join('; ');
      }

      console.log(`  ${demo.relPath.padEnd(40)} \u2717 ${summary}`);
      failures.push({ demo: demo.relPath, errors: result.errors });
    }
  }

  console.log();
  console.log(`${passed}/${demos.length} passed, ${failed} failed.`);

  // Print detailed errors for failures
  if (failures.length > 0) {
    console.log();
    console.log('Details:');
    for (const f of failures) {
      console.log(`  ${f.demo}:`);
      for (const err of f.errors) {
        console.log(`    - ${err}`);
      }
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
