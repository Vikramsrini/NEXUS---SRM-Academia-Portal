// ═══════════════════════════════════════════════════════════════════════
// HTML Decoding & Text Normalization Utilities
// ═══════════════════════════════════════════════════════════════════════

/**
 * Converts hex-encoded characters (\xHH) back to real characters.
 */
export function convertHexToHTML(hexString) {
  if (!hexString) return '';
  return hexString.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Decodes the pageSanitizer.sanitize('...') wrapper that SRM Academia
 * uses to deliver HTML payloads (hex-encoded, backslash-escaped).
 */
export function decodeAcademicPayload(payload) {
  if (typeof payload !== 'string') return '';
  const sanitizeMatch = payload.match(/pageSanitizer\.sanitize\('(.*)'\);/s);
  if (!sanitizeMatch?.[1]) return payload;
  return convertHexToHTML(sanitizeMatch[1])
    .replace(/\\\\/g, '')
    .replace(/\\'/g, "'");
}

/**
 * Collapses non-breaking spaces and extra whitespace into single spaces.
 */
export function normalizeText(value = '') {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes a key string: lower-case, collapse whitespace, strip colons/asterisks.
 */
export function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[:*]/g, '');
}
