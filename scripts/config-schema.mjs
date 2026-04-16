/**
 * CONFIG Schema Definition & Validator
 * ─────────────────────────────────────
 * Zero-dependency schema for the Krevio unified CONFIG object.
 * Every demo and client site defines `const CONFIG = { ... }` —
 * this module validates that object against the canonical contract.
 *
 * See: _Workspace/context/config-schema.md for the full spec.
 *
 * Usage:
 *   import { validateConfig } from './config-schema.mjs';
 *   const result = validateConfig(config, { isDemoOnly: true });
 *   // result = { valid: boolean, errors: string[], fieldCount: number }
 */

// ── Allowed values ──────────────────────────────────────────────

// Current production types — must match keys in api/demos/chat.js RAW_PERSONAS
// AND selectors in css/industry-overrides.css. Add here FIRST, then add the
// corresponding system prompt and CSS overrides.
const VALID_BUSINESS_TYPES = [
  'plumbing',
  'hvac',
  'landscaping',
  'realestate',
  'remodeling',
  'krevio',            // landing page chatbot
  'general-contractor', // planned: John's multi-service site
  'multi-service',      // planned: future multi-service clients
];

const VALID_LANGS = ['en', 'en-US', 'es', 'es-US'];

// ── Validator helpers ───────────────────────────────────────────
// All return null on pass, an error message string on fail.

const nonEmptyString = (msg) => (v) => (typeof v === 'string' && v.trim().length === 0) ? msg : null;
const apiPath = (msg) => (v) => (typeof v === 'string' && !v.startsWith('/api/')) ? msg : null;
const oneOf = (label, allowed) => (v) =>
  (typeof v === 'string' && !allowed.includes(v)) ? `${label} "${v}" is not one of: ${allowed.join(', ')}` : null;

// ── Field definitions ───────────────────────────────────────────
// type: 'email' and 'array' are pseudo-types — typeof won't match,
// so the validator skips the typeof check and relies on the custom
// validate function for those fields instead.

const CORE_FIELDS = [
  { key: 'businessName',  type: 'string',  required: true, validate: nonEmptyString('businessName must be non-empty') },
  { key: 'businessType',  type: 'string',  required: true, validate: oneOf('businessType', VALID_BUSINESS_TYPES) },
  { key: 'chatEndpoint',  type: 'string',  required: true, validate: apiPath('chatEndpoint must start with /api/') },
  { key: 'ttsEndpoint',   type: 'string',  required: true, validate: apiPath('ttsEndpoint must start with /api/') },
  { key: 'lang',          type: 'string',  required: true, validate: oneOf('lang', VALID_LANGS) },
  { key: 'hasVoice',      type: 'boolean', required: true },
];

const PROD_FIELDS = [
  {
    key: 'notifyEmail',
    type: 'email',
    prodOnly: true,
    validate: (v) => {
      if (typeof v !== 'string') return 'notifyEmail must be a string';
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRe.test(v) ? null : `notifyEmail "${v}" is not a valid email format`;
    },
  },
  { key: 'notifyEndpoint', type: 'string', prodOnly: true, validate: apiPath('notifyEndpoint must start with /api/') },
  { key: 'phone',          type: 'string', prodOnly: true, validate: nonEmptyString('phone must be non-empty') },
  { key: 'serviceArea',    type: 'string', prodOnly: true, validate: nonEmptyString('serviceArea must be non-empty') },
];

const OPTIONAL_FIELDS = [
  {
    key: 'services',
    type: 'array',
    optional: true,
    validate: (v) => {
      if (!Array.isArray(v)) return 'services must be an array';
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'object' || v[i] === null) {
          return `services[${i}] must be an object`;
        }
        if (typeof v[i].name !== 'string' || v[i].name.trim().length === 0) {
          return `services[${i}].name must be a non-empty string`;
        }
      }
      return null;
    },
  },
  {
    key: 'faq',
    type: 'array',
    optional: true,
    validate: (v) => {
      if (!Array.isArray(v)) return 'faq must be an array';
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'object' || v[i] === null) {
          return `faq[${i}] must be an object`;
        }
        if (typeof v[i].q !== 'string' || v[i].q.trim().length === 0) {
          return `faq[${i}].q must be a non-empty string`;
        }
        if (typeof v[i].a !== 'string' || v[i].a.trim().length === 0) {
          return `faq[${i}].a must be a non-empty string`;
        }
      }
      return null;
    },
  },
  {
    key: 'quickReplies',
    type: 'array',
    optional: true,
    validate: (v) => {
      if (!Array.isArray(v)) return 'quickReplies must be an array';
      // quickReplies can be strings OR objects with { emoji, label }
      for (let i = 0; i < v.length; i++) {
        const item = v[i];
        if (typeof item === 'string') continue;
        if (typeof item === 'object' && item !== null && typeof item.label === 'string') continue;
        return `quickReplies[${i}] must be a string or an object with a "label" field`;
      }
      return null;
    },
  },
  {
    key: 'businessHours',
    type: 'string',
    optional: true,
    validate: nonEmptyString('businessHours must be non-empty if present'),
  },
];

// ── Validator ───────────────────────────────────────────────────

/**
 * Validate a CONFIG object.
 *
 * @param {object} config        — the CONFIG object to validate
 * @param {object} [opts]
 * @param {boolean} [opts.isDemoOnly=false] — if true, skip production-only fields
 * @returns {{ valid: boolean, errors: string[], fieldCount: number }}
 */
export function validateConfig(config, { isDemoOnly = false } = {}) {
  const errors = [];

  if (config == null || typeof config !== 'object') {
    return { valid: false, errors: ['CONFIG is not an object'], fieldCount: 0 };
  }

  const fieldCount = Object.keys(config).length;

  function checkField(field, val) {
    // Pseudo-types ('email', 'array') skip the typeof gate and rely on the
    // field's own validate() to type-check.
    if (field.type !== 'email' && field.type !== 'array' && typeof val !== field.type) {
      errors.push(`${field.key} must be type "${field.type}", got "${typeof val}"`);
      return;
    }
    if (field.validate) {
      const err = field.validate(val);
      if (err) errors.push(err);
    }
  }

  for (const field of CORE_FIELDS) {
    if (!(field.key in config)) { errors.push(`missing required field: ${field.key}`); continue; }
    checkField(field, config[field.key]);
  }

  if (!isDemoOnly) {
    for (const field of PROD_FIELDS) {
      if (!(field.key in config)) { errors.push(`missing production field: ${field.key}`); continue; }
      checkField(field, config[field.key]);
    }
  }

  for (const field of OPTIONAL_FIELDS) {
    if (!(field.key in config)) continue;
    checkField(field, config[field.key]);
  }

  return { valid: errors.length === 0, errors, fieldCount };
}

// ── Exports for external use ────────────────────────────────────

export { VALID_BUSINESS_TYPES, VALID_LANGS, CORE_FIELDS, PROD_FIELDS, OPTIONAL_FIELDS };
