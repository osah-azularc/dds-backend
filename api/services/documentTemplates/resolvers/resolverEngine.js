/**
 * resolverEngine.js
 *
 * Orchestrates merge field resolution.
 * Validates input, looks up the resolver from the registry, invokes it,
 * and guarantees a string return value — never throws to the caller.
 */

import { resolverRegistry } from './fieldResolverRegistry.js';

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when value is a non-empty string.
 * @param {*} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Coerces any value to string; treats null/undefined as ''.
 * @param {*} value
 * @returns {string}
 */
function coerceToString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

// ─── Exported engine ─────────────────────────────────────────────────────────

/**
 * Resolves a single merge field by key.
 *
 * Resolution order:
 *   1. Validate that fieldKey is a non-empty string → return '' if invalid.
 *   2. Look up resolver in registry → return '' if field key is unregistered.
 *   3. Invoke resolver with context (awaited for async-readiness).
 *   4. Coerce result to string.
 *   5. On any thrown error → return '' (safe fallback; never rethrows).
 *
 * @param {string}  fieldKey  - snake_case DB field_key value (e.g. 'docket_number')
 * @param {object}  context   - Populated context object passed to every resolver
 * @returns {Promise<string>} - Resolved string value, or '' on any failure
 */
export async function resolveField(fieldKey, context) {
  if (!isNonEmptyString(fieldKey)) {
    return '';
  }

  const resolver = resolverRegistry[fieldKey];

  if (typeof resolver !== 'function') {
    return '';
  }

  try {
    const result = await resolver(context);
    return coerceToString(result);
  } catch {
    return '';
  }
}

/**
 * Resolves multiple merge fields in parallel.
 *
 * Accepts an array of field keys and returns a plain object mapping each
 * key to its resolved string value. Unknown or erroring fields map to ''.
 *
 * @param {string[]} fieldKeys - Array of snake_case DB field_key values
 * @param {object}   context   - Populated context object passed to every resolver
 * @returns {Promise<Record<string, string>>} - Map of fieldKey → resolved value
 */
export async function resolveFields(fieldKeys, context) {
  if (!Array.isArray(fieldKeys) || fieldKeys.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    fieldKeys.map(async (key) => {
      const value = await resolveField(key, context);
      return [key, value];
    })
  );

  return Object.fromEntries(entries);
}
