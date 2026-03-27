const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export async function fetchAcademics() {
  const res = await fetch(apiUrl('/academics'), {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('academia_token')}` }
  });
  return res.json();
}

export async function fetchTimetable() {
  const res = await fetch(apiUrl('/timetable'), {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('academia_token')}` }
  });
  return res.json();
}

export async function fetchThoughtOfDay(refresh = false) {
  const q = refresh ? '?refresh=1' : '';
  const res = await fetch(apiUrl(`/thought-of-the-day${q}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch thought of the day');
  }
  return res.json();
}

export async function fetchCgpaReference(refresh = false) {
  const q = refresh ? '?refresh=1' : '';
  const res = await fetch(apiUrl(`/cgpa/reference${q}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch CGPA reference data');
  }
  return res.json();
}

export async function fetchCgpaState(regNumber, token) {
  if (!regNumber || !token) {
    return {
      selectedRegulation: '',
      selectedCourse: '',
      semesterInputs: {},
      syncEnabled: false,
    };
  }

  const q = new URLSearchParams({ regNumber: String(regNumber) }).toString();
  const res = await fetch(apiUrl(`/cgpa/state?${q}`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch saved CGPA state');
  }

  return res.json();
}

export async function saveCgpaState({ regNumber, token, selectedRegulation, selectedCourse, semesterInputs }) {
  if (!regNumber || !token) {
    throw new Error('Missing regNumber or token for saving CGPA state');
  }

  const res = await fetch(apiUrl('/cgpa/state'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      regNumber,
      selectedRegulation: String(selectedRegulation || '').trim(),
      selectedCourse: String(selectedCourse || '').trim(),
      semesterInputs: semesterInputs && typeof semesterInputs === 'object' ? semesterInputs : {},
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to save CGPA state');
  }

  return res.json();
}

export async function fetchOdState(regNumber, token) {
  if (!regNumber || !token) {
    return { odDates: [], manualAdjs: {} };
  }

  const q = new URLSearchParams({ regNumber: String(regNumber) }).toString();
  const res = await fetch(apiUrl(`/od-state?${q}`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch OD state');
  }

  return res.json();
}

export async function saveOdState({ regNumber, token, odDates, manualAdjs, updateV1Dismissed }) {
  if (!regNumber || !token) {
    throw new Error('Missing regNumber or token for saving OD state');
  }

  const res = await fetch(apiUrl('/od-state'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      regNumber,
      odDates: Array.isArray(odDates) ? odDates : [],
      manualAdjs: manualAdjs && typeof manualAdjs === 'object' ? manualAdjs : {},
      updateV1Dismissed: !!updateV1Dismissed,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to save OD state');
  }

  return res.json();
}

export async function fetchTimetableState(regNumber, token) {
  if (!regNumber || !token) {
    return { hiddenClasses: [] };
  }

  const q = new URLSearchParams({ regNumber: String(regNumber) }).toString();
  const res = await fetch(apiUrl(`/timetable-state?${q}`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to fetch timetable state');
  }

  return res.json();
}

export async function saveTimetableState({ regNumber, token, hiddenClasses }) {
  if (!regNumber || !token) {
    throw new Error('Missing regNumber or token for saving timetable state');
  }

  const res = await fetch(apiUrl('/timetable-state'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      regNumber,
      hiddenClasses: Array.isArray(hiddenClasses) ? hiddenClasses : [],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'Failed to save timetable state');
  }

  return res.json();
}

export async function fetchPresence(regNumber, courses) {
  const token = localStorage.getItem('academia_token');
  if (!regNumber || !courses || !token) return { presence: {} };

  const q = new URLSearchParams({ regNumber, courses: courses.join(',') }).toString();
  const res = await fetch(apiUrl(`/attendance/presence?${q}`), {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return { presence: {} };
  return res.json();
}

export { API_BASE };

