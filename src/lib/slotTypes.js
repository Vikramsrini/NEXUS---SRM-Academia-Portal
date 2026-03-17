export function normalizeCourseCode(value = '') {
  return String(value || '').toUpperCase().replace(/\s+/g, '').replace(/^21/, '');
}

export function normalizeFallbackSlotType(type = '') {
  const t = String(type).toLowerCase();
  if (
    t.includes('practical') ||
    t.includes('prac') ||
    t.includes('lab') ||
    t.includes('clinical') ||
    t.includes('workshop') ||
    t.includes('project') ||
    t.includes('studio')
  ) {
    return { label: 'Practical', css: 'practical', labels: ['Practical'] };
  }

  return { label: 'Theory', css: 'theory', labels: ['Theory'] };
}

function normalizeTimetableSlotType(type = '') {
  return normalizeFallbackSlotType(type).labels[0];
}

export function buildTimetableSlotTypeIndex(timetable = []) {
  const slotIndex = new Map();

  timetable.forEach((item) => {
    const courseKey = normalizeCourseCode(item.courseCode);
    const slotType = normalizeTimetableSlotType(item.slotType);

    if (!courseKey || !slotType) return;

    if (!slotIndex.has(courseKey)) {
      slotIndex.set(courseKey, new Set());
    }

    slotIndex.get(courseKey).add(slotType);
  });

  return slotIndex;
}

export function resolveCourseSlotType(courseCode, fallbackType, timetableSlotTypeIndex) {
  const courseKey = normalizeCourseCode(courseCode);
  const labels = timetableSlotTypeIndex?.get(courseKey)
    ? [...timetableSlotTypeIndex.get(courseKey)]
    : [];

  if (labels.length === 1) {
    return {
      label: labels[0],
      css: labels[0] === 'Practical' ? 'practical' : 'theory',
      labels,
    };
  }

  if (labels.length > 1) {
    return {
      label: 'Theory + Practical',
      css: 'mixed',
      labels,
    };
  }

  return normalizeFallbackSlotType(fallbackType);
}
