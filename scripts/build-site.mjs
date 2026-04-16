#!/usr/bin/env node
/**
 * build-site.mjs — Krevio Template Build Script
 * ───────────────────────────────────────────────
 * Compiles _templates/ + configs/ into static demo HTML files.
 * Zero external dependencies — uses only Node.js built-ins (fs, path).
 *
 * Usage:
 *   node scripts/build-site.mjs configs/plumbing.json       # build one demo
 *   node scripts/build-site.mjs --all                       # build all configs
 *   node scripts/build-site.mjs --dry-run configs/hvac.json # preview without writing
 *
 * Output:
 *   demos/[businessType]/index.html
 *
 * The generated files are static HTML served directly by Vercel.
 * This script is dev tooling only — it does NOT run at deploy time.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { validateConfig } from './config-schema.mjs';

// ── Paths ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const TEMPLATES_DIR = join(ROOT, '_templates');
const PARTIALS_DIR = join(TEMPLATES_DIR, 'partials');
const CONFIGS_DIR = join(ROOT, 'configs');
const DEMOS_DIR = join(ROOT, 'demos');

// ── CLI args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const buildAll = args.includes('--all');
const verbose = args.includes('--verbose') || args.includes('-v');

// Filter out flags to get config file paths
const configPaths = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));

if (!buildAll && configPaths.length === 0) {
  console.log(`
Krevio Template Builder
───────────────────────
Usage:
  node scripts/build-site.mjs configs/plumbing.json   Build one demo
  node scripts/build-site.mjs --all                   Build all configs
  node scripts/build-site.mjs --dry-run --all         Preview without writing

Options:
  --all       Build all .json files in configs/
  --dry-run   Show what would be generated without writing files
  --verbose   Show detailed output during build
`);
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────

/** Read a file relative to repo root, or return empty string if missing. */
function readFile(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

/** Load all partial templates into a map: { 'demo-bar': '<html>...' } */
function loadPartials() {
  const partials = {};
  if (!existsSync(PARTIALS_DIR)) return partials;

  for (const file of readdirSync(PARTIALS_DIR)) {
    if (!file.endsWith('.html')) continue;
    const name = file.replace('.html', '');
    partials[name] = readFileSync(join(PARTIALS_DIR, file), 'utf-8');
  }
  return partials;
}

/**
 * Replace all {{PLACEHOLDER}} tokens in a string with values from a map.
 * Unmatched placeholders are left as-is (useful for debugging).
 */
function replacePlaceholders(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (key in values) return values[key];
    return match; // leave unmatched placeholders visible
  });
}

/**
 * Build the CONFIG_JSON string for the chat-init partial.
 * Includes only the fields the chat widget actually needs.
 */
function buildConfigJson(config) {
  // The chat widget CONFIG: the full config object is useful because
  // the schema-ld partial and lead form also reference CONFIG at runtime.
  // We include all fields from the JSON config.
  return JSON.stringify(config, null, 2);
}

/**
 * Derive the short language code from a full lang tag.
 * 'en-US' -> 'en', 'es-US' -> 'es'
 */
function langShort(lang) {
  return (lang || 'en').split('-')[0];
}

/**
 * Build the placeholder values map from a config object.
 */
function buildValues(config) {
  const values = {};

  // Basic identity
  values.BUSINESS_NAME = config.businessName || '';
  values.BUSINESS_TYPE = config.businessType || '';
  values.EMOJI = config.emoji || '';
  values.TAGLINE = config.tagline || '';

  // Page metadata
  values.PAGE_TITLE = config.pageTitle || `${config.businessName} | Powered by Krevio`;
  values.META_DESCRIPTION = config.metaDescription || config.tagline || '';
  values.LANG_SHORT = langShort(config.lang);
  values.DEFAULT_THEME = config.defaultTheme || 'dark';

  // Contact info
  values.PHONE = config.phone || '';
  values.PHONE_RAW = config.phoneRaw || (config.phone || '').replace(/\D/g, '');
  values.ADDRESS = config.address || '';
  values.CITY = config.city || '';
  values.STATE = config.state || '';
  values.ZIP = config.zip || '';
  values.HOURS = config.hours || '';
  values.RATING = String(config.rating || '');
  values.REVIEW_COUNT = String(config.reviewCount || '');

  // Footer icons (plain text, not emoji custom props — keeps it simple)
  values.PHONE_ICON = '\ud83d\udcde';
  values.LOCATION_ICON = '\ud83d\udccd';
  values.RATING_ICON = '\u2b50';
  values.HOURS_ICON = '\ud83d\udd50';

  // Hero content
  values.HERO_HEADLINE = config.heroHeadline || config.businessName;
  values.HERO_SUBTITLE = config.heroSubtitle || config.tagline || '';
  values.HERO_PILLS_HTML = (config.heroPills || [])
    .map(p => `        <span class="cv-hero-pill">${p}</span>`)
    .join('\n');

  // Demo bar
  values.BACK_URL = '/#demos';
  values.BACK_LABEL = '\u2190 Back';
  values.THEME_ICON = config.defaultTheme === 'light' ? '\u2600\ufe0f' : '\ud83c\udf19';
  values.LANG_TOGGLE_STYLE = config.hasLanguageToggle ? '' : ' style="display:none"';

  // Lead form
  values.FORM_HEADING_EN = config.formHeadingEn || 'Request Service';
  values.FORM_HEADING_ES = config.formHeadingEs || 'Solicitar Servicio';
  values.FORM_BUTTON_EN = config.formButtonEn || 'Submit Request';
  values.FORM_BUTTON_ES = config.formButtonEs || 'Enviar Solicitud';

  // Chat widget CONFIG — injected as JSON
  values.CONFIG_JSON = buildConfigJson(config);

  // Analytics — Umami Cloud (privacy-friendly, no cookies)
  // Set UMAMI_WEBSITE_ID env var or analyticsId in config
  const umamiId = config.analyticsId || process.env.UMAMI_WEBSITE_ID || '';
  values.ANALYTICS_TAG = umamiId
    ? `<script defer src="https://cloud.umami.is/script.js" data-website-id="${umamiId}"></script>`
    : '<!-- analytics: set analyticsId in config or UMAMI_WEBSITE_ID env var -->';

  // Empty slots for optional sections (filled by content files or left empty)
  values.EXTRA_HEAD = '';
  values.DEMO_STYLES = '';
  values.HERO_SECTION = '';
  values.CONTENT_SECTIONS = '';
  values.OWNER_DASHBOARD = '';
  values.EXTRA_SCRIPTS = '';

  return values;
}

// ── Content files ──────────────────────────────────────────────────

/**
 * Load industry-specific content file if it exists.
 * Looks for: configs/[type].content.html
 *
 * Content files can contain multiple named sections delimited by
 * <!-- SECTION: NAME --> markers. Each section maps to a placeholder.
 */
function loadContentSections(businessType) {
  const contentFile = join(CONFIGS_DIR, `${businessType}.content.html`);
  if (!existsSync(contentFile)) return {};

  const content = readFileSync(contentFile, 'utf-8');
  const sections = {};

  // Parse sections: <!-- SECTION: HERO_SECTION --> ... <!-- /SECTION -->
  const sectionRegex = /<!-- SECTION: (\w+) -->\n?([\s\S]*?)<!-- \/SECTION -->/g;
  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    sections[match[1]] = match[2].trim();
  }

  // If no sections found, treat the whole file as CONTENT_SECTIONS
  if (Object.keys(sections).length === 0) {
    sections.CONTENT_SECTIONS = content.trim();
  }

  return sections;
}

// ── Build pipeline ─────────────────────────────────────────────────

// Maps {{PLACEHOLDER}} -> partial filename (without .html). The footer
// partial includes the endcap/pill, so KREVIO_ENDCAP stays empty.
const PARTIAL_MAP = {
  DEMO_BAR:  'demo-bar',
  CHAT_INIT: 'chat-init',
  LEAD_FORM: 'lead-form',
  SCHEMA_LD: 'schema-ld',
  FOOTER:    'footer',
};

/**
 * Build one demo. `ctx` carries the shared inputs that are the same for
 * every config in a single run (base template + partials), so we don't
 * re-read those files N times when --all is passed.
 */
function buildDemo(configPath, ctx) {
  const fullPath = resolve(ROOT, configPath);

  let config;
  try {
    config = JSON.parse(readFileSync(fullPath, 'utf-8'));
  } catch (err) {
    console.error(`  ERROR: ${err.code === 'ENOENT' ? 'Cannot read config file' : 'Invalid JSON'}: ${configPath}`);
    console.error(`         ${err.message}`);
    return false;
  }

  const type = config.businessType;
  if (!type) {
    console.error(`  ERROR: Config missing businessType field: ${configPath}`);
    return false;
  }

  console.log(`\n  Building: ${config.businessName} (${type})`);
  console.log(`  Config:   ${configPath}`);

  const validation = validateConfig(config, { isDemoOnly: true });
  if (!validation.valid) {
    console.error(`  VALIDATION FAILED (${validation.errors.length} errors):`);
    validation.errors.forEach(e => console.error(`    - ${e}`));
    return false;
  }
  if (verbose) console.log(`  Validated: ${validation.fieldCount} fields, all OK`);

  const values = buildValues(config);

  // Industry-specific HTML sections (configs/[type].content.html)
  for (const [key, html] of Object.entries(loadContentSections(type))) {
    values[key] = html;
  }

  // Inject partials with their own placeholders resolved first
  for (const [placeholder, partialName] of Object.entries(PARTIAL_MAP)) {
    if (ctx.partials[partialName]) {
      values[placeholder] = replacePlaceholders(ctx.partials[partialName], values);
    }
  }
  values.KREVIO_ENDCAP = '';

  const html = replacePlaceholders(ctx.baseTemplate, values);
  const outputFile = join(DEMOS_DIR, type, 'index.html');

  if (dryRun) {
    console.log(`  Output:   ${outputFile} (DRY RUN — not written)`);
    console.log(`  Size:     ~${Math.round(html.length / 1024)} KB`);
    return true;
  }

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, html, 'utf-8');
  console.log(`  Output:   ${outputFile}`);
  console.log(`  Size:     ${Math.round(html.length / 1024)} KB`);
  return true;
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('Krevio Template Builder');
  console.log('=======================');

  let configs = [];

  if (buildAll) {
    // Find all .json files in configs/
    if (!existsSync(CONFIGS_DIR)) {
      console.error(`ERROR: Configs directory not found: ${CONFIGS_DIR}`);
      process.exit(1);
    }
    configs = readdirSync(CONFIGS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => join('configs', f));

    if (configs.length === 0) {
      console.error('ERROR: No .json config files found in configs/');
      process.exit(1);
    }
    console.log(`\nFound ${configs.length} config(s) in configs/`);
  } else {
    configs = configPaths;
  }

  if (dryRun) {
    console.log('(DRY RUN — no files will be written)');
  }

  // Read base template + partials ONCE per run, not once per config.
  const baseTemplate = readFile(join(TEMPLATES_DIR, 'base.html'));
  if (!baseTemplate) {
    console.error(`ERROR: Cannot read base template: ${join(TEMPLATES_DIR, 'base.html')}`);
    process.exit(1);
  }
  const ctx = { baseTemplate, partials: loadPartials() };

  let success = 0;
  let failed = 0;

  for (const configPath of configs) {
    try {
      if (buildDemo(configPath, ctx)) {
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`\n  ERROR building ${configPath}: ${err.message}`);
      if (verbose) console.error(err.stack);
      failed++;
    }
  }

  // Summary
  console.log('\n───────────────────────');
  console.log(`Done. ${success} built, ${failed} failed.`);
  if (dryRun) console.log('(Dry run — nothing was written to disk.)');
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main();
