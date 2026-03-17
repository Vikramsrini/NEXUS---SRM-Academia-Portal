// ═══════════════════════════════════════════════════════════════════════
// Slot / Time / Schedule Utilities
// ═══════════════════════════════════════════════════════════════════════

import { normalizeText } from './html.js';

/** 10-period time slots used by SRM */
export const SLOT_TIMES = [
  '08:00 - 08:50',
  '08:50 - 09:40',
  '09:45 - 10:35',
  '10:40 - 11:30',
  '11:35 - 12:25',
  '12:30 - 01:20',
  '01:25 - 02:15',
  '02:20 - 03:10',
  '03:10 - 04:00',
  '04:00 - 04:50',
];

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Slot positions for each day order per batch (index = period index) */
export const BATCH_SCHEDULES = {
  '1': [
    ['A', 'A', 'F', 'F', 'G', 'P6', 'P7', 'P8', 'P9', 'P10'],
    ['P11', 'P12', 'P13', 'P14', 'P15', 'B', 'B', 'G', 'G', 'A'],
    ['C', 'C', 'A', 'D', 'B', 'P26', 'P27', 'P28', 'P29', 'P30'],
    ['P31', 'P32', 'P33', 'P34', 'P35', 'D', 'D', 'B', 'E', 'C'],
    ['E', 'E', 'C', 'F', 'D', 'P46', 'P47', 'P48', 'P49', 'P50'],
  ],
  '2': [
    ['P1', 'P2', 'P3', 'P4', 'P5', 'A', 'A', 'F', 'F', 'G'],
    ['B', 'B', 'G', 'G', 'A', 'P16', 'P17', 'P18', 'P19', 'P20'],
    ['P21', 'P22', 'P23', 'P24', 'P25', 'C', 'C', 'A', 'D', 'B'],
    ['D', 'D', 'B', 'E', 'C', 'P36', 'P37', 'P38', 'P39', 'P40'],
    ['P41', 'P42', 'P43', 'P44', 'P45', 'E', 'E', 'C', 'F', 'D'],
  ],
};

/** Expands "P1-P5" into ["P1","P2","P3","P4","P5"] */
export function expandSlotRange(token) {
  const normalized = normalizeText(token).toUpperCase().replace(/[–—]/g, '-');
  const numericRange = normalized.match(/^P(\d+)\s*-\s*P?(\d+)$/i);

  if (!numericRange) return [normalized];

  const start = Number.parseInt(numericRange[1], 10);
  const end = Number.parseInt(numericRange[2], 10);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [normalized];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => `P${start + index}`);
}

/**
 * Extracts individual slot codes from a raw slot string.
 * Handles '+', ',', '/' delimiters and 'P1-P5' ranges.
 */
export function extractSlotCodes(rawSlot = '') {
  const normalized = normalizeText(rawSlot)
    .replace(/[–—]/g, '-')
    .toUpperCase();

  if (!normalized) return [];

  const parts = normalized
    .split('+')
    .flatMap(part => part.split(','))
    .flatMap(part => part.split('/'))
    .flatMap(part => {
      const trimmed = normalizeText(part);
      if (!trimmed) return [];
      if (/^P\d+\s*-\s*P?\d+$/i.test(trimmed)) return expandSlotRange(trimmed);
      if (trimmed.includes('-')) {
        return trimmed.split(/\s*-\s*/).filter(Boolean);
      }
      return [trimmed];
    })
    .map(part => normalizeText(part))
    .filter(Boolean);

  return [...new Set(parts)];
}
