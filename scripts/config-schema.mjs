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

// ── Field definitions ───────────────────────────────────────────

// type: 'email' and 'array' are pseudo-types — typeof won't match,
// so the validator skips the typeof check and relies on the custom
// validate function for those fields instead.
const CORE_FIELDS = [
  {
    key: 'businessName',
    type: 'string',
    required: true,
    validate: (v) => (typeof v === 'string' && v.trim().length === 0)
      ? 'businessName must be non-empty'
      : null,
  },
  {
    key: 'businessType',
    type: 'string',
    required: true,
    validate: (v) => (typeof v === 'string' && !VALID_BUSINESS_TYPES.includes(v))
      ? `businessType "${v}" is not one of: ${VALID_BUSINESS_TYPES.join(', ')}`
      : null,
  },
  {
    key: 'chatEndpoint',
    type: 'string',
    required: true,
    validate: (v) => (typeof v === 'string' && !v.startsWith('/api/'))
      ? 'chatEndpoint must start with /api/'
      : null,
  },
  {
    key: 'ttsEndpoint',
    type: 'string',
    required: true,
    validate: (v) => (typeof v === 'string' && !v.startsWith('/api/'))
      ? 'ttsEndpoint must start with /api/'
      : null,
  },
  {
    key: 'lang',
    type: 'string',
    required: true,
    validate: (v) => (typeof v === 'string' && !VALID_LANGS.includes(v))
      ? `lang "${v}" is not one of: ${VALID_LANGS.join(', ')}`
      : null,
  },
  {
    key: 'hasVoice',
    type: 'boolean',
    required: true,
  },
];

const PROD_FIELDS = [
  {
    key: 'notifyEmail',
    type: 'email',
    prodOnly: true,
    validate: (v) => {
      if (typeof v !== 'string') return 'notifyEmail must be a string';
      // Simple email check — not RFC-exhaustive, but catches obvious problems
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRe.test(v) ? null : `notifyEmail "${v}" is not a valid email format`;
    },
  },
  {
    key: 'notifyEndpoint',
    type: 'string',
    prodOnly: true,
    validate: (v) => (typeof v === 'string' && !v.startsWith('/api/'))
      ? 'notifyEndpoint must start with /api/'
      : null,
  },
  {
    key: 'phone',
    type: 'string',
    prodOnly: true,
    validate: (v) => (typeof v === 'string' && v.trim().length === 0)
      ? 'phone must be non-empty'
      : null,
  },
  {
    key: 'serviceArea',
    type: 'string',
    prodOnly: true,
    validate: (v) => (typeof v === 'string' && v.trim().length === 0)
      ? 'serviceArea must be non-empty'
      : null,
  },
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
    validate: (v) => (typeof v === 'string' && v.trim().length === 0)
      ? 'businessHours must be non-empty if present'
      : null,
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

  // ── Check core required fields ──
  for (const field of CORE_FIELDS) {
    if (!(field.key in config)) {
      errors.push(`missing required field: ${field.key}`);
      continue;
    }
    const val = config[field.key];
    // Type check (skip for email — handled by validate fn)
    if (field.type !== 'email' && field.type !== 'array') {
      if (typeof val !== field.type) {
        errors.push(`${field.key} must be type "${field.type}", got "${typeof val}"`);
        continue;
      }
    }
    // Custom validation
    if (field.validate) {
      const err = field.validate(val);
      if (err) errors.push(err);
    }
  }

  // ── Check production-only fields (skip for demos) ──
  if (!isDemoOnly) {
    for (const field of PROD_FIELDS) {
      if (!(field.key in config)) {
        errors.push(`missing production field: ${field.key}`);
        continue;
      }
      const val = config[field.key];
      if (field.validate) {
        const err = field.validate(val);
        if (err) errors.push(err);
      }
    }
  }

  // ── Check optional fields (only if present) ──
  for (const field of OPTIONAL_FIELDS) {
    if (!(field.key in config)) continue;
    const val = config[field.key];
    if (field.validate) {
      const err = field.validate(val);
      if (err) errors.push(err);
    }
  }

  return { valid: errors.length === 0, errors, fieldCount };
}

// ── Exports for external use ────────────────────────────────────

export { VALID_BUSINESS_TYPES, VALID_LANGS, CORE_FIELDS, PROD_FIELDS, OPTIONAL_FIELDS };
