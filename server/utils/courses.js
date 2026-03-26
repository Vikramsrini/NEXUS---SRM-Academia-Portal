// ═══════════════════════════════════════════════════════════════════════
// Course Detection, Table Parsing & Branch Derivation Utilities
// ═══════════════════════════════════════════════════════════════════════

import { normalizeText, normalizeKey } from './html.js';

/** Derives academic branch from program/department text */
export function deriveAcademicBranch(program = '', department = '') {
  const text = `${program} ${department}`.toLowerCase();
  if (/\bcse\b/.test(text) || text.includes('computer science') || text.includes('computer engineering')) return 'CSE';
  if (/\bece\b/.test(text) || text.includes('electronics and communication')) return 'ECE';
  if (/\beee\b/.test(text) || text.includes('electrical and electronics')) return 'EEE';
  if (/\bmech\b/.test(text) || text.includes('mechanical')) return 'MECH';
  if (text.includes('civil')) return 'CIVIL';
  return '';
}

/** Returns direct child rows of a table (skips nested tables) */
export function getDirectRows($, table) {
  return $(table).find('> tbody > tr, > tr');
}

/** Returns direct child cells (th/td) of a row */
export function getDirectCells($, row) {
  return $(row).find('> th, > td');
}

/** Finds the best-matching table given arrays of keyword groups for headers */
export function findTableByHeaders($, keywordGroups) {
  let bestTable = null;
  let bestScore = -1;

  $('table').each((_, table) => {
    const firstRow = getDirectRows($, table).first();
    if (!firstRow.length) return;

    const headers = getDirectCells($, firstRow)
      .map((__, cell) => normalizeKey($(cell).text()))
      .get();

    if (!headers.length) return;

    const score = keywordGroups.reduce((total, group) => {
      const matched = group.some(keyword =>
        headers.some(header => header.includes(keyword))
      );
      return total + (matched ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestTable = table;
    }
  });

  return bestScore >= Math.max(2, Math.ceil(keywordGroups.length / 2))
    ? bestTable
    : null;
}

/** Finds the column index matching any of the given keywords */
export function getColumnIndex(headers, keywords, fallback = -1) {
  const index = headers.findIndex(header =>
    keywords.some(keyword => header.includes(keyword))
  );
  return index >= 0 ? index : fallback;
}

/** Parses a numeric value from a cell, stripping non-numeric chars */
export function parseNumericCell(value) {
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Strips leading numbering and "regular" from course code text */
export function cleanCourseCode(value = '') {
  return normalizeText(value)
    .replace(/^(\d+\.?\s*)+/, '')
    .replace(/regular/gi, '')
    .trim();
}

/** Cleans a course title, stripping trailing dash-delimited parts */
export function cleanCourseTitle(value = '') {
  return normalizeText(value)
    .split('\u2013')[0]
    .split(' \u2013')[0]
    .split(' -')[0]
    .split('/')[0]
    .trim();
}

/** Returns true if value looks like a course code (e.g. 21CSE202J) */
export function looksLikeCourseCode(value = '') {
  const compact = cleanCourseCode(value).replace(/\s+/g, '');
  return /^[A-Z]{2,}\d[A-Z0-9-]*$/i.test(compact);
}

/** Finds the first course-code-like value in an array */
export function findCourseCodeCandidate(values = []) {
  return values
    .map(cleanCourseCode)
    .find(value => looksLikeCourseCode(value)) || '';
}

/** Finds the first course-title-like value in an array, excluding blocked values */
export function findCourseTitleCandidate(values = [], excluded = []) {
  const blocked = new Set(excluded.filter(Boolean).map(value => normalizeText(value).toLowerCase()));
  return values
    .map(cleanCourseTitle)
    .find(value => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (blocked.has(normalized)) return false;
      if (normalized === 'null') return false;
      if (looksLikeCourseCode(value)) return false;
      return /[a-z]{3}/i.test(value);
    }) || '';
}

/** Normalizes a room string */
export function normalizeRoom(value = '') {
  const room = normalizeText(value);
  if (!room) return 'N/A';
  return room.charAt(0).toUpperCase() + room.slice(1);
}

/** Detects slot type (Practical/Theory) from slot codes and course code */
export function detectSlotType(slotCodes = [], courseCode = '', courseTitle = '') {
  const code = (courseCode || '').toUpperCase();
  const title = (courseTitle || '').toLowerCase();

  // P-numbered slots (P1-P50) are always practical — this is the primary signal
  const hasPracticalSlot = slotCodes.some(s => {
    const us = s.toUpperCase();
    return /^P\d+$/.test(us) || us.includes('LAB') || us.includes('PRAC') || us.includes('WORK');
  });

  // Unambiguous SRM course code suffixes: P=Practical, L=Lab, J=Project
  // S is excluded — it appears on many theory courses and is not a reliable indicator
  const isPracticalCode = /[PLJ]$/.test(code);

  // Title keywords — "seminar" is excluded as SRM seminars are theory/attendance sessions
  const hasPracticalTitle =
    title.includes('lab') ||
    title.includes('practical') ||
    title.includes('workshop') ||
    title.includes('project') ||
    title.includes('clinical') ||
    title.includes('studio');

  return (hasPracticalSlot || isPracticalCode || hasPracticalTitle) ? 'Practical' : 'Theory';
}
