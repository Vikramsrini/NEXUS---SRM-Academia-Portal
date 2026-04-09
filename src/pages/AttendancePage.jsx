import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchOdState, saveOdState } from '../lib/api';
import { normalizeCourseCode } from '../lib/slotTypes';
import './SubPages.css';

const Icons = {
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  closeSmall: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  od: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  attendance: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  shield: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function parseMonthYear(monthStr) {
  const cleaned = monthStr.replace(/[–—-]/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  let monthName = parts[0] || '';
  let year = parts.find(p => /^\d{4}$/.test(p));
  const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  return {
    monthIdx: monthIdx >= 0 ? monthIdx : 0,
    year: year ? parseInt(year) : new Date().getFullYear(),
  };
}

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

function getProgressColor(statusType) {
  if (statusType === 'red') return 'progress-red';
  if (statusType === 'amber') return 'progress-amber';
  return 'progress-green';
}

function getBadgeClass(pct) {
  if (pct >= 75) return 'badge-green';
  if (pct >= 50) return 'badge-amber';
  return 'badge-red';
}

function normalizeSlot(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('lab') || t.includes('prac') || t.includes('work') || t.includes('practical')) {
    return { label: 'Lab', css: 'practical' };
  }
  return { label: 'Theory', css: 'theory' };
}

function buildCourseTypeKey(courseCode, slotType) {
  const normalizedType = normalizeSlot(slotType).label.toLowerCase();
  return `${String(courseCode || '').trim()}_${normalizedType}`;
}

function getAttendanceStatus(conducted, absent) {
  const C = parseInt(conducted) || 0;
  if (C === 0) return { type: 'neutral', text: 'No classes' };

  const A = parseInt(absent) || 0;
  const P = C - A;
  const pct = (P / C) * 100;

  if (pct >= 75) {
    const margin = Math.floor((P / 0.75) - C);
    if (pct >= 75 && pct < 76) return { type: 'amber', text: 'At Threshold' };
    return { type: 'green', text: `Margin: ${margin}` };
  } else {
    const require = Math.ceil(3 * C - 4 * P);
    return { type: 'red', text: `Needs: ${require}` };
  }
}

function MiniCalendar({ startDate, endDate, onRangeSelect }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const monthIdx = currentMonth.getMonth();
  const year = currentMonth.getFullYear();
  const startDay = firstDayOfMonth(monthIdx, year);
  const totalDays = daysInMonth(monthIdx, year);

  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(new Date(year, monthIdx, i));

  const isSelected = (date) => {
    if (!date) return false;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    return iso === startDate || iso === endDate;
  };

  const isInRange = (date) => {
    if (!date || !startDate || !endDate) return false;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    return iso > startDate && iso < endDate;
  };

  const isToday = (date) => {
    if (!date) return false;
    return date.getTime() === today.getTime();
  };

  const handleDayClick = (date) => {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;

    if (!startDate || (startDate && endDate)) {
      onRangeSelect(isoDate, '');
    } else {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const s = new Date(sy, sm - 1, sd);
      if (date < s) {
        onRangeSelect(isoDate, startDate);
      } else {
        onRangeSelect(startDate, isoDate);
      }
    }
  };

  return (
    <div className="apple-mini-calendar">
      <div className="mini-cal-header">
        <button onClick={handlePrevMonth} className="nav-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h3>{MONTH_NAMES[monthIdx]} {year}</h3>
        <button onClick={handleNextMonth} className="nav-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <div className="mini-cal-weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mini-cal-grid">
        {days.map((date, i) => (
          <div
            key={i}
            className={`mini-cal-day ${!date ? 'empty' : ''} ${isSelected(date) ? 'selected' : ''} ${isInRange(date) ? 'in-range' : ''} ${isToday(date) ? 'today' : ''}`}
            onClick={() => handleDayClick(date)}
          >
            {date ? date.getDate() : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const student = getStudentData();
  const token = localStorage.getItem('academia_token') || '';
  const regNumber = (student.regNumber || '').trim();
  const attendance = student.attendance || [];
  const timetable = student.timetable || [];
  const coursesMetadata = student.courses || [];

  const timetableMapping = useMemo(() => {
    const map = {};
    
    // 1. From courses metadata (reliable academic source)
    coursesMetadata.forEach(course => {
      const code = normalizeCourseCode(course.code);
      if (!map[code]) map[code] = new Set();
      if (course.slotType) map[code].add(course.slotType);
    });

    // 2. Supplement with active timetable sessions
    timetable.forEach(cls => {
      const code = normalizeCourseCode(cls.courseCode);
      if (!map[code]) map[code] = new Set();
      if (cls.slotType) map[code].add(cls.slotType);
    });
    return map;
  }, [timetable, coursesMetadata]);

  const resolveType = (a) => {
    const code = normalizeCourseCode(a.courseCode);
    const types = timetableMapping[code];
    
    const s = (a.slot || '').toUpperCase();
    if (s && (s.includes('P') || s.includes('L'))) return 'Practical';
    if (s && /^[A-G](?:\d+)?$/.test(s)) return 'Theory';
    
    // Backend row-level detection is more specific than code-level mapping
    if (a.slotType) return a.slotType;

    if (types && types.size === 1) return Array.from(types)[0];
    
    return 'Theory';
  };

  const [showOdModal, setShowOdModal] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const handleAcceptDisclaimer = () => {
    setShowDisclaimer(false);
    setShowOdModal(true);
  };

  const handleCancelDisclaimer = () => {
    setShowDisclaimer(false);
  };

  const [odDates, setOdDates] = useState(() => {
    try {
      const stored = localStorage.getItem('academia_od_dates');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [manualAdjs, setManualAdjs] = useState(() => {
    try {
      const stored = localStorage.getItem('academia_attendance_adjs');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [odSyncReady, setOdSyncReady] = useState(false);
  const [odSyncEnabled, setOdSyncEnabled] = useState(false);

  // ── Predict Attendance Logic ──────────────────────────────────────
  const [showPredictModal, setShowPredictModal] = useState(false);
  const [predictDates, setPredictDates] = useState(() => {
    try {
      const stored = localStorage.getItem('academia_predict_dates');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [predictFrom, setPredictFrom] = useState('');
  const [predictTo, setPredictTo] = useState('');

  const FILTERED_ATTENDANCE = useMemo(() => {
    return attendance.filter(a => {
      const title = (a.courseTitle || '').trim();
      const code = (a.courseCode || '').trim();
      if (!title || title.length <= 2) return false;

      const conducted = parseInt(a.hoursConducted);
      if (isNaN(conducted) || conducted <= 0) return false;

      const lowerTitle = title.toLowerCase();
      const lowerCode = code.toLowerCase();
      const combined = (title + ' ' + code).toLowerCase();

      const isNoise = (
        lowerTitle === 'theory' || lowerTitle === 'practical' || lowerTitle === 'lab' || lowerTitle === 'clinical' ||
        combined.includes('llj') ||
        combined.includes('ft-') ||
        combined.startsWith('ft') ||
        combined.includes('fj-') ||
        combined.includes('total') ||
        combined.includes('faculty') ||
        combined.startsWith('ct-') ||
        combined.startsWith('cat-') ||
        combined === 'r i' || combined === 'r ii' || combined.startsWith('21r i/') ||
        /\d+\/\d+/.test(combined)
      );

      return !isNoise;
    });
  }, [attendance]);

  useEffect(() => {
    localStorage.setItem('academia_od_dates', JSON.stringify(odDates));
  }, [odDates]);

  useEffect(() => {
    localStorage.setItem('academia_attendance_adjs', JSON.stringify(manualAdjs));
  }, [manualAdjs]);

  useEffect(() => {
    localStorage.setItem('academia_predict_dates', JSON.stringify(predictDates));
  }, [predictDates]);

  useEffect(() => {
    let ignore = false;

    const loadRemoteOdState = async () => {
      if (!regNumber || !token) {
        setOdSyncReady(false);
        setOdSyncEnabled(false);
        return;
      }

      try {
        const remote = await fetchOdState(regNumber, token);
        if (ignore) return;

        const remoteSyncEnabled = remote?.syncEnabled !== false;
        setOdSyncEnabled(remoteSyncEnabled);

        // Only hydrate from server when cloud sync is actually active.
        // If sync is disabled (e.g., table not created), preserve localStorage values.
        if (remoteSyncEnabled) {
          if (Array.isArray(remote.odDates)) {
            setOdDates(remote.odDates);
          }
          if (remote.manualAdjs && typeof remote.manualAdjs === 'object') {
            setManualAdjs(remote.manualAdjs);
          }
        }

      } catch (e) {
        console.warn('OD state sync (read) failed:', e.message);
        setOdSyncEnabled(false);
      } finally {
        if (!ignore) setOdSyncReady(true);
      }
    };

    loadRemoteOdState();
    return () => {
      ignore = true;
    };
  }, [regNumber, token]);

  useEffect(() => {
    if (!odSyncReady || !odSyncEnabled || !regNumber || !token) return;

    const saveRemoteOdState = async () => {
      try {
        await saveOdState({ regNumber, token, odDates, manualAdjs });
      } catch (e) {
        console.warn('OD state sync (write) failed:', e.message);
      }
    };

    saveRemoteOdState();
  }, [manualAdjs, odDates, odSyncReady, odSyncEnabled, regNumber, token]);

  const updateAdj = (courseKey, field, delta) => {
    setManualAdjs(prev => {
      const current = prev[courseKey] || {};
      const currentVal = parseInt(current[field]) || 0;
      return {
        ...prev,
        [courseKey]: { ...current, [field]: currentVal + delta }
      };
    });
  };

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleAddOdDateRange = () => {
    if (fromDate) {
      const start = new Date(fromDate);
      const end = toDate ? new Date(toDate) : new Date(fromDate);
      if (start <= end) {
        const newDates = [];
        let current = new Date(start);
        while (current <= end) {
          // Adjust for local timezone to ensure YYYY-MM-DD is correct
          const tzOffset = current.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(current - tzOffset)).toISOString().split('T')[0];
          if (!odDates.includes(localISOTime)) {
            newDates.push(localISOTime);
          }
          current.setDate(current.getDate() + 1);
        }
        setOdDates([...odDates, ...newDates]);
      }
      setFromDate('');
      setToDate('');
    }
  };

  const handleRemoveOdDate = (date) => {
    setOdDates(odDates.filter(d => d !== date));
  };

  const odDayOrders = useMemo(() => {
    const calendar = student.calendar || [];
    const tallies = {};
    const parsedOdDates = odDates.map(d => {
      const [y, m, day] = d.split('-').map(Number);
      return { year: y, monthIdx: m - 1, date: day };
    });

    calendar.forEach(calMonth => {
      const pm = parseMonthYear(calMonth.month);
      calMonth.days?.forEach(d => {
        if (!d.dayOrder) return;
        let dateNum = parseInt(d.date);
        if (!dateNum || !parsedOdDates.some(od => od.year === pm.year && od.monthIdx === pm.monthIdx && od.date === dateNum)) return;
        let order = d.dayOrder;
        if (!order.startsWith('DO') && order.match(/^\d+$/)) order = `DO${order}`;
        tallies[order] = (tallies[order] || 0) + 1;
      });
    });
    return tallies;
  }, [odDates, student.calendar]);

  const predictDayOrders = useMemo(() => {
    const calendar = student.calendar || [];
    const tallies = {};
    const parsedPredictDates = predictDates.map(d => {
      const [y, m, day] = d.split('-').map(Number);
      return { year: y, monthIdx: m - 1, date: day };
    });

    calendar.forEach(calMonth => {
      const pm = parseMonthYear(calMonth.month);
      calMonth.days?.forEach(d => {
        if (!d.dayOrder) return;
        let dateNum = parseInt(d.date);
        if (!dateNum || !parsedPredictDates.some(pd => pd.year === pm.year && pd.monthIdx === pm.monthIdx && pd.date === dateNum)) return;
        let order = d.dayOrder;
        if (!order.startsWith('DO') && order.match(/^\d+$/)) order = `DO${order}`;
        tallies[order] = (tallies[order] || 0) + 1;
      });
    });
    return tallies;
  }, [predictDates, student.calendar]);

  const calculateHoursFromDayOrders = (courseCode, slotType, tallies) => {
    const norm = normalizeSlot(slotType);
    if (!timetable.length) return { hours: 0, optionalHours: 0 };
    let sum = 0;
    let optionalSum = 0;

    let hidden = [];
    try {
      hidden = JSON.parse(localStorage.getItem('academia_hidden_classes') || '[]');
    } catch {
      hidden = [];
    }

    timetable.forEach(cls => {
      const clsNorm = normalizeSlot(cls.slotType);
      if (cls.courseCode === courseCode && clsNorm.label === norm.label) {
        let order = cls.dayOrder;
        if (!order) return;
        if (!order.startsWith('DO') && order.match(/^\d+$/)) order = `DO${order}`;

        const id = `${cls.courseCode}_${cls.time}_${cls.dayOrder || cls.day}`;
        const isOptional = hidden.includes(id);

        let h = cls.hours;
        if (h === undefined && cls.time) {
          try {
            const [s, e] = cls.time.split(' - ');
            const parse = (str) => {
              let [hh, mm] = str.split(':').map(Number);
              if (hh < 8) hh += 12;
              return hh * 60 + mm;
            };
            h = Math.max(1, Math.round((parse(e) - parse(s)) / 50));
          } catch { h = 1; }
        }

        const count = (tallies[order] || 0) * (h || 1);

        if (isOptional) {
          optionalSum += count;
        } else {
          sum += count;
        }
      }
    });
    return { hours: sum, optionalHours: optionalSum };
  };

  const getOdBonus = (courseCode, slotType) => calculateHoursFromDayOrders(courseCode, slotType, odDayOrders).hours;
  const getPredictHours = (courseCode, slotType) => calculateHoursFromDayOrders(courseCode, slotType, predictDayOrders);

  const attendanceInsights = useMemo(() => {
    if (!FILTERED_ATTENDANCE.length) return null;

    let totalWeightPct = 0;
    let riskCount = 0;

    FILTERED_ATTENDANCE.forEach((a) => {
      const type = resolveType(a);
      const courseKey = buildCourseTypeKey(a.courseCode, type);
      const adj = manualAdjs[courseKey] || {};
      const safeOdAdj = parseInt(adj.odAdj) || 0;
      const conducted = parseInt(a.hoursConducted) || 0;
      const originalAbsent = parseInt(a.hoursAbsent) || 0;
      const odBonus = getOdBonus(a.courseCode, type);
      const finalAppliedOd = Math.min(Math.max(0, Math.min(odBonus, originalAbsent) + safeOdAdj), originalAbsent);
      const absent = Math.max(0, originalAbsent - finalAppliedOd);
      const pct = conducted === 0 ? 100 : Math.max(0, ((conducted - absent) / conducted) * 100);
      totalWeightPct += pct;
      if (getAttendanceStatus(conducted, absent).type === 'red') riskCount += 1;
    });

    return {
      average: (totalWeightPct / FILTERED_ATTENDANCE.length).toFixed(1),
      tracked: FILTERED_ATTENDANCE.length,
      riskCount,
      odCount: odDates.length,
    };
  }, [FILTERED_ATTENDANCE, manualAdjs, odDates.length, odDayOrders, student.timetable]);

  return (
    <div className="apple-page-container">
      {/* SVG Definitions for Gradients and Filters */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="ring-gradient-green" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#30D158" />
            <stop offset="100%" stopColor="#248A3D" />
          </linearGradient>
          <linearGradient id="ring-gradient-amber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF9F0A" />
            <stop offset="100%" stopColor="#C93400" />
          </linearGradient>
          <linearGradient id="ring-gradient-red" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF3B30" />
            <stop offset="100%" stopColor="#D70015" />
          </linearGradient>
          <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
      </svg>
      {/* Redesigned Disclaimer Modal — rendered via portal to escape overflow:auto */}
      {showDisclaimer && createPortal(
        <div className="apple-modal-overlay">
          <div className="apple-modal-card">
            <header className="apple-modal-header">
              <div className="warning-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              </div>
              <h2>Use with Caution</h2>
              <button className="apple-modal-close" onClick={handleCancelDisclaimer}>{Icons.close}</button>
            </header>
            <div className="apple-modal-body">
              <p className="primary-text">This tool allows manual attendance editing and OD/ML predictions for your local tracking.</p>
              <ul className="apple-bullet-list">
                <li><span>Manual adjustments <strong>do not sync</strong> back to the portal.</span></li>
                <li><span>OD/ML values are <strong>estimated</strong> based on your timetable.</span></li>
                <li><span>Always cross-check with official university records.</span></li>
              </ul>
            </div>
            <footer className="apple-modal-footer">
              <button className="apple-btn secondary" onClick={handleCancelDisclaimer}>Cancel</button>
              <button className="apple-btn primary" onClick={handleAcceptDisclaimer}>Continue</button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      {showPredictModal && createPortal(
        <div className="apple-modal-overlay">
          <div className="apple-modal-card compact">
            <header className="apple-modal-header">
              <div className="warning-icon-wrap" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              </div>
              <h2>Predict Absences</h2>
              <button className="apple-modal-close" onClick={() => setShowPredictModal(false)}>{Icons.close}</button>
            </header>
            <div className="apple-modal-body">
              <p className="secondary-text">Select a future range to see how leaves will impact your percentages.</p>

              <div className="apple-form-group">
                <MiniCalendar
                  startDate={predictFrom}
                  endDate={predictTo}
                  onRangeSelect={(s, e) => { setPredictFrom(s); setPredictTo(e); }}
                />

                <button
                  className="apple-btn primary full-width"
                  onClick={() => {
                    if (predictFrom) {
                      const start = new Date(predictFrom);
                      const end = predictTo ? new Date(predictTo) : new Date(predictFrom);
                      const newDates = [];
                      let current = new Date(start);
                      while (current <= end) {
                        const tzOffset = current.getTimezoneOffset() * 60000;
                        const localISO = (new Date(current - tzOffset)).toISOString().split('T')[0];
                        if (!predictDates.includes(localISO)) newDates.push(localISO);
                        current.setDate(current.getDate() + 1);
                      }
                      setPredictDates([...predictDates, ...newDates]);
                      setPredictFrom(''); setPredictTo('');
                    }
                  }}
                  disabled={!predictFrom}
                >
                  Apply Leave Range
                </button>
              </div>

              {predictDates.length > 0 && (
                <div className="od-date-scroller">
                  {predictDates.map(date => (
                    <div key={date} className="od-date-pill predict">
                      <span>{new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <button onClick={() => setPredictDates(predictDates.filter(d => d !== date))}>{Icons.closeSmall}</button>
                    </div>
                  ))}
                  <button className="clear-all-predict" onClick={() => setPredictDates([])}>Clear All</button>
                </div>
              )}
            </div>
            <footer className="apple-modal-footer">
              <button className="apple-btn blur full-width" onClick={() => setShowPredictModal(false)}>
                See Results
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      {/* Redesigned OD / ML Modal — rendered via portal */}
      {showOdModal && createPortal(
        <div className="apple-modal-overlay">
          <div className="apple-modal-card compact">
            <header className="apple-modal-header">
              <h2>Apply OD / ML</h2>
              <button className="apple-modal-close" onClick={() => setShowOdModal(false)}>{Icons.close}</button>
            </header>
            <div className="apple-modal-body">
              <p className="secondary-text">Select dates to preview updated attendance.</p>

              <div className="apple-form-group">
                <MiniCalendar
                  startDate={fromDate}
                  endDate={toDate}
                  onRangeSelect={(s, e) => { setFromDate(s); setToDate(e); }}
                />

                <button
                  className="apple-btn primary full-width"
                  onClick={handleAddOdDateRange}
                  disabled={!fromDate}
                >
                  Add Date Range
                </button>
              </div>

              {odDates.length > 0 && (
                <div className="od-date-scroller">
                  {odDates.map(date => (
                    <div key={date} className="od-date-pill">
                      <span>{new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <button onClick={() => handleRemoveOdDate(date)}>{Icons.closeSmall}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <footer className="apple-modal-footer">
              <button className="apple-btn blur full-width" onClick={() => setShowOdModal(false)}>
                Done
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Attendance</h1>
          <p className="subpage-desc">Track and predict your course presence with ease.</p>
        </div>
        <div className="subpage-actions">
          <button
            className={`apple-btn-secondary ${predictDates.length > 0 ? 'active' : ''}`}
            onClick={() => setShowPredictModal(true)}
            style={{ marginRight: '8px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
            Predict {predictDates.length > 0 && <span>({predictDates.length})</span>}
          </button>
          <button
            className={`apple-btn-secondary ${odDates.length > 0 ? 'active' : ''}`}
            onClick={() => setShowDisclaimer(true)}
          >
            {Icons.od} Apply OD/ML {odDates.length > 0 && <span>({odDates.length})</span>}
          </button>
        </div>
      </div>

      {FILTERED_ATTENDANCE.length > 0 ? (
        <div className="attendance-groups-wrap stagger-children">
          {[
            { id: 'theory', label: 'Theory Classes', data: FILTERED_ATTENDANCE.filter(a => normalizeSlot(resolveType(a)).label === 'Theory') },
            { id: 'lab', label: 'Lab classes', data: FILTERED_ATTENDANCE.filter(a => normalizeSlot(resolveType(a)).label === 'Lab') }
          ].filter(g => g.data.length > 0).map(group => (
            <div key={group.id} className="attendance-group-container">
              <h2 className="attendance-group-title">{group.label}</h2>
              <div className="attendance-grid-apple">
                {group.data.map((a, i) => {
                  const type = resolveType(a);
                  const courseKey = buildCourseTypeKey(a.courseCode, type);
                  const adj = manualAdjs[courseKey] || {};
                  const safeOdAdj = parseInt(adj.odAdj) || 0;
                  const C = parseInt(a.hoursConducted) || 0;
                  const originalA = parseInt(a.hoursAbsent) || 0;
                  const odBonus = getOdBonus(a.courseCode, type);
                  const finalAppliedOd = Math.min(Math.max(0, Math.min(odBonus, originalA) + safeOdAdj), originalA);
                  const A = Math.max(0, originalA - finalAppliedOd);
                  const P = Math.max(0, C - A);

                  // Prediction logic
                  const predStats = getPredictHours(a.courseCode, type);
                  const predictHrs = predStats.hours;
                  const optionalHrs = predStats.optionalHours;
                  const predC = C + predictHrs;
                  const predA = A + predictHrs;
                  const predP = P; // Present hours don't change if you skip
                  const predPct = predC === 0 ? 100 : (predP / predC) * 100;
                  const predStatus = getAttendanceStatus(predC, predA);

                  const pct = C === 0 ? 100 : (P / C) * 100;
                  const status = getAttendanceStatus(C, A);
                  const isPredicting = predictDates.length > 0;

                  return (
                    <div key={i} className="attendance-card-apple">
                      {finalAppliedOd > 0 && (
                        <div className="od-stamp-badge" title={`Percentage boosted by ${finalAppliedOd} OD/ML hours`}>
                          {Icons.shield} OD
                        </div>
                      )}
                      <div className="card-top">
                        <div className="course-info">
                          <h3>{a.courseTitle}</h3>
                          <div className="course-meta">
                            <span className="code">{a.courseCode.startsWith('21') ? a.courseCode : `21${a.courseCode}`}</span>
                            <span className="dot">•</span>
                            {(() => {
                              const type = resolveType(a);
                              const norm = normalizeSlot(type);
                              return <span className={`type-badge ${norm.css}`}>{norm.label}</span>;
                            })()}
                          </div>
                        </div>
                        <div className={`percent-ring ${isPredicting ? getProgressColor(predStatus.type) : getProgressColor(status.type)}`}>
                          <svg viewBox="0 0 36 36">
                            <path
                              className="ring-path-track"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              strokeWidth="3.2"
                            />
                            <path
                              className="ring-path-progress"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              strokeWidth="3.2"
                              strokeDasharray={`${isPredicting ? predPct : pct}, 100`}
                              stroke={`url(#ring-gradient-${(() => {
                                const st = isPredicting ? predStatus.type : status.type;
                                if (st === 'red' || st === 'amber') return st;
                                return 'green';
                              })()})`}
                              filter="url(#ring-glow)"
                            />
                          </svg>
                          <span className="pct-text">{isPredicting ? predPct.toFixed(0) : pct.toFixed(0)}</span>
                        </div>
                      </div>

                      <div className="card-metrics">
                        <div className="metric">
                          <span className="label">{isPredicting ? 'Pred. Conducted' : 'Conducted'}</span>
                          <span className="value">{isPredicting ? predC : C}</span>
                        </div>
                        <div className="metric">
                          <span className="label">{isPredicting ? 'Pred. Absent' : 'Absent'}</span>
                          <span className="value">{isPredicting ? predA : A}</span>
                        </div>
                        <div className="metric">
                          <span className="label">Status</span>
                          <span className={`status-pill ${isPredicting ? predStatus.type : status.type}`}>
                            {isPredicting ? predStatus.text : status.text}
                          </span>
                        </div>
                      </div>

                      {isPredicting && (
                        <div className="prediction-overlay-hint">
                          PREDICTION ACTIVE: {predictHrs} hrs missed
                          {optionalHrs > 0 && <span> (excl. {optionalHrs} optional)</span>}
                        </div>
                      )}

                      <div className="card-actions">
                         <div className={`od-indicator ${finalAppliedOd > 0 ? 'active' : ''}`}>
                           <span className="od-icon-wrap">{Icons.shield}</span>
                           <div className="od-text">
                             <span className="label">OD/ML Units</span>
                             <span className="count">{finalAppliedOd}</span>
                           </div>
                         </div>
                        <div className="od-controls">
                          <button className="adj-btn" onClick={() => updateAdj(courseKey, 'odAdj', -1)} disabled={finalAppliedOd <= 0}>-</button>
                          <button className="adj-btn" onClick={() => updateAdj(courseKey, 'odAdj', 1)} disabled={finalAppliedOd >= originalA}>+</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">{Icons.attendance}</div>
          <h3>Attendance data not available</h3>
          <p>Complete your initial sync to view your classroom presence stats.</p>
        </div>
      )}
    </div>
  );
}
