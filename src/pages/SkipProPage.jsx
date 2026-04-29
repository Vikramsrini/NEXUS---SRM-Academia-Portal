import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { normalizeCourseCode } from '../lib/slotTypes';
import './SubPages.css';

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Icons = {
  warning: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  zap: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
  book: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
};

function normalizeSlot(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('lab') || t.includes('prac') || t.includes('workshop')) return { label: 'Lab', css: 'practical' };
  return { label: 'Theory', css: 'theory' };
}

function buildCourseTypeKey(courseCode, slotType) {
  const normalizedType = normalizeSlot(slotType).label.toLowerCase();
  return `${String(courseCode || '').trim()}_${normalizedType}`;
}

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

function getAttendanceStatus(conducted, absent, targetPct, futureClasses = 0) {
  const C = parseInt(conducted) || 0;
  const A = parseInt(absent) || 0;
  if (C === 0 && futureClasses === 0) return { type: 'neutral', text: 'No classes yet', val: '-' };
  const P = C - A;
  const currentPct = C === 0 ? 100 : (P / C) * 100;
  const reqFrac = targetPct / 100;
  const totalPossibleC = C + futureClasses;
  const maxAllowedAbsences = Math.floor(totalPossibleC * (1 - reqFrac));
  const safeSkipsRemaining = maxAllowedAbsences - A;

  if (currentPct >= targetPct) {
    if (safeSkipsRemaining <= 0) return { type: 'amber', text: 'At threshold', val: '0' };
    else return { type: 'green', text: `Safe skips left`, val: safeSkipsRemaining };
  } else {
    const requireContinuous = Math.ceil((reqFrac * C - P) / (1 - reqFrac));
    if (requireContinuous > futureClasses && futureClasses > 0) {
      const maxAchievable = ((P + futureClasses) / totalPossibleC) * 100;
      return { type: 'red', text: 'Unachievable! Max:', val: `${maxAchievable.toFixed(1)}%` };
    } else if (requireContinuous > 0) return { type: 'red', text: `Must attend next`, val: requireContinuous };
    else return { type: 'amber', text: 'At threshold', val: '0' };
  }
}

export default function SkipProPage() {
  const [targetPct, setTargetPct] = useState(75);
  const student = getStudentData();
  const attendance = student.attendance || [];
  const timetable = student.timetable || [];

  const timetableMapping = useMemo(() => {
    const map = {};
    timetable.forEach(cls => {
      const code = cls.courseCode;
      if (!map[code]) map[code] = new Set();
      map[code].add(cls.slotType);
    });
    return map;
  }, [timetable]);

  const resolveType = (a) => {
    const code = (a.courseCode || '').trim().toUpperCase();
    const types = timetableMapping[code] || timetableMapping[code.replace(/^21/, '')];
    
    const s = (a.slot || '').toUpperCase();
    if (s && (s.includes('P') || s.includes('L'))) return 'Practical';
    if (s && /^[A-G](?:\d+)?$/.test(s)) return 'Theory';
    
    if (a.slotType) return a.slotType;

    if (types && types.size === 1) return Array.from(types)[0];
    
    return 'Theory';
  };

  const [showDisclaimer, setShowDisclaimer] = useState(true);

  const [odDates] = useState(() => {
    try {
      const stored = localStorage.getItem('academia_od_dates');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [manualAdjs] = useState(() => {
    try {
      const stored = localStorage.getItem('academia_attendance_adjs');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

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

  const getOdBonus = (courseCode, slotType) => {
    const timetable = student.timetable || [];
    const norm = normalizeSlot(slotType);
    if (!timetable.length) return 0;
    let sum = 0;
    timetable.forEach(cls => {
      const clsNorm = normalizeSlot(cls.slotType);
      if (cls.courseCode === courseCode && clsNorm.label === norm.label) {
         let order = cls.dayOrder;
         if (order) {
           if (!order.startsWith('DO') && order.match(/^\d+$/)) order = `DO${order}`;
           sum += (odDayOrders[order] || 0);
         }
      }
    });
    return sum;
  };

  const getFutureClassesCount = (courseCode, slotType) => {
    const timetable = student.timetable || [];
    const norm = normalizeSlot(slotType);
    if (!timetable.length) return 0;
    let sum = 0;
    timetable.forEach(cls => {
      const clsNorm = normalizeSlot(cls.slotType);
      if (cls.courseCode === courseCode && clsNorm.label === norm.label) {
         let order = cls.dayOrder;
         if (order) {
           if (!order.startsWith('DO') && order.match(/^\d+$/)) order = `DO${order}`;
           sum += (futureDayOrderTallies[order] || 0);
         }
      }
    });
    return sum;
  };

  const predictionRange = useMemo(() => {
    const calendar = student.calendar || [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const allDays = [];
    calendar.forEach(calMonth => {
      const pm = parseMonthYear(calMonth.month);
      calMonth.days?.forEach(d => {
        if (!d.dayOrder) return;
        const dateNum = parseInt(d.date);
        if (!dateNum) return;
        allDays.push({ date: new Date(pm.year, pm.monthIdx, dateNum), order: d.dayOrder });
      });
    });

    if (!allDays.length) return { limitDate: null, tallies: {} };

    allDays.sort((a, b) => a.date - b.date);

    // Find the start of future classes
    let startIndex = allDays.findIndex(d => d.date >= now);
    if (startIndex === -1) return { limitDate: null, tallies: {} };

    // Detect the end of the current semester block (first gap > 15 days)
    let limitDate = allDays[allDays.length - 1].date;
    for (let i = startIndex; i < allDays.length - 1; i++) {
      const gap = (allDays[i + 1].date - allDays[i].date) / (1000 * 60 * 60 * 24);
      if (gap > 15) {
        limitDate = allDays[i].date;
        break;
      }
    }

    const tallies = {};
    allDays.forEach(item => {
      if (item.date >= now && item.date <= limitDate) {
        let order = item.order;
        if (!order.startsWith('DO') && order.match(/^\d+$/)) order = `DO${order}`;
        tallies[order] = (tallies[order] || 0) + 1;
      }
    });

    return { tallies, limitDate };
  }, [student.calendar]);

  const futureDayOrderTallies = predictionRange.tallies;

  const lastWorkingDay = useMemo(() => {
    const { limitDate } = predictionRange;
    if (!limitDate) return 'Unknown';
    return `${MONTH_NAMES[limitDate.getMonth()]} ${limitDate.getDate()}`;
  }, [predictionRange]);

  const FILTERED_ATTENDANCE = useMemo(() => {
    return attendance.filter(a => {
      const title = (a.courseTitle || '').trim();
      if (!title || title.length <= 2) return false;
      
      const conducted = parseInt(a.hoursConducted);
      if (isNaN(conducted) || conducted <= 0) return false;
      
      const lower = title.toLowerCase();
      if (lower === 'theory' || lower === 'practical' || lower === 'lab' || lower === 'clinical') return false;
      if (lower.startsWith('ft-') || lower.includes('total')) return false;
      if (lower.includes('llj-') || lower.startsWith('ct-') || lower.startsWith('cat-')) return false;
      return true;
    });
  }, [attendance]);

  const ATTENDANCE_GROUPS = useMemo(() => {
    const theory = FILTERED_ATTENDANCE.filter(a => normalizeSlot(resolveType(a)).label === 'Theory');
    const lab = FILTERED_ATTENDANCE.filter(a => normalizeSlot(resolveType(a)).label === 'Lab');
    
    const groups = [];
    if (theory.length > 0) groups.push({ id: 'theory', label: 'Theory Classes', items: theory });
    if (lab.length > 0) groups.push({ id: 'lab', label: 'Lab Classes', items: lab });
    return groups;
  }, [FILTERED_ATTENDANCE, timetableMapping, resolveType]);

  const stats = useMemo(() => {
    let safe = 0, caution = 0, risk = 0;
    FILTERED_ATTENDANCE.forEach(a => {
      const type = resolveType(a);
      const courseKey = buildCourseTypeKey(a.courseCode, type);
      const safeOdAdj = parseInt((manualAdjs[courseKey] || {}).odAdj) || 0;
      const C = parseInt(a.hoursConducted) || 0;
      let originalA = parseInt(a.hoursAbsent) || 0;
      let baseAppliedOd = Math.min(getOdBonus(a.courseCode, type), originalA);
      let finalAppliedOd = Math.min(Math.max(0, baseAppliedOd + safeOdAdj), originalA);
      const A = Math.max(0, originalA - finalAppliedOd);
      const futureClasses = getFutureClassesCount(a.courseCode, type);
      const st = getAttendanceStatus(C, A, targetPct, futureClasses);
      if (st.type === 'green') safe++; else if (st.type === 'amber') caution++; else if (st.type === 'red') risk++;
    });
    return { safe, caution, risk };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FILTERED_ATTENDANCE, manualAdjs, targetPct, odDayOrders, futureDayOrderTallies, student.timetable]);

  return (
    <div className="apple-page-container skippro-page">
      {showDisclaimer && createPortal(
        <div className="apple-modal-overlay">
          <div className="apple-modal-card skippro-disclaimer-modal">
            <div className="apple-modal-header">
              <div className="modal-title-row">
                <span className="warning-icon">{Icons.warning}</span>
                <h2>Predictive Guide</h2>
              </div>
            </div>
            <div className="apple-modal-body">
              <p className="disclaimer-intro">
                Skip Now projections are strict approximations based on your current timetable and the academic calendar.
              </p>
              <ul className="disclaimer-list">
                <li>
                  <span className="dot">•</span>
                  <span>Sudden holidays or faculty leaves are not predicted.</span>
                </li>
                <li>
                  <span className="dot">•</span>
                  <span>Mandatory compensatory classes are not included.</span>
                </li>
              </ul>
              <div className="disclaimer-danger-box">
                <p>
                  Disclaimer: NEXUS is not liable for attendance shortages or academic penalties resulting from these estimates.
                </p>
              </div>
            </div>
            <div className="apple-modal-footer">
              <button className="apple-btn secondary" onClick={() => (window.location.href = '/dashboard')}>Cancel</button>
              <button className="apple-btn primary" onClick={() => setShowDisclaimer(false)}>I Understand</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Skip Now</h1>
          <p className="subpage-desc">Projection analysis through {lastWorkingDay}.</p>
        </div>
      </div>


      <div className="skippro-stats-grid stagger-children">
        <div className="skippro-stat-card safe">
          <span className="lbl">Safe To Skip</span>
          <strong className="val">{stats.safe}</strong>
        </div>
        <div className="skippro-stat-card caution">
          <span className="lbl">Risk</span>
          <strong className="val">{stats.caution}</strong>
        </div>
        <div className="skippro-stat-card risk">
          <span className="lbl">Danger</span>
          <strong className="val">{stats.risk}</strong>
        </div>
      </div>

      {ATTENDANCE_GROUPS.length > 0 ? (
        <div className="attendance-page-content">
          {ATTENDANCE_GROUPS.map(group => (
            <div key={group.id} className="attendance-group-container">
              <h2 className="attendance-group-title">{group.label}</h2>
              <div className="skippro-grid-apple stagger-children">
                {group.items.map((a, i) => {
                  const type = resolveType(a);
                  const courseKey = buildCourseTypeKey(a.courseCode, type);
                  const adj = manualAdjs[courseKey] || {}, safeOdAdj = parseInt(adj.odAdj) || 0;
                  const C = parseInt(a.hoursConducted) || 0, originalA = parseInt(a.hoursAbsent) || 0;
                  const odBonus = getOdBonus(a.courseCode, type);
                  let finalAppliedOd = Math.min(Math.max(0, Math.min(odBonus, originalA) + safeOdAdj), originalA);
                  const A = Math.max(0, originalA - finalAppliedOd), P = Math.max(0, C - A);
                  const pct = C === 0 ? 100 : (P / C) * 100;
                  const futureClasses = getFutureClassesCount(a.courseCode, type);
                  const st = getAttendanceStatus(C, A, targetPct, futureClasses);
                  const norm = normalizeSlot(type);

                  return (
                    <div key={i} className={`skippro-card-apple ${st.type}`}>
                      <div className="card-top">
                        <div className="course-info">
                          <span className="code">{a.courseCode.startsWith('21') ? a.courseCode : `21${a.courseCode}`}</span>
                          <h3>{a.courseTitle}</h3>
                          <div className="meta">
                            {Icons.book} <span>{norm.label}</span>
                          </div>
                        </div>
                        <div className={`status-badge ${st.type}`}>
                          {st.type === 'green' ? 'SAFE TO SKIP' : st.type === 'amber' ? 'RISK' : 'DANGER'}
                        </div>
                      </div>

                      <div className="card-main">
                        <div className="stat-row">
                          <span className="lbl">Current</span>
                          <span className="val">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="stat-row highlight">
                          <span className="lbl">{st.text}</span>
                          <span className="val big">{st.val}</span>
                        </div>
                      </div>

                      <div className="card-footer">
                        <span>{futureClasses} classes predicted left</span>
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
           <div className="icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg></div>
           <h3>No attendance found</h3>
           <p>Signin to start using Skip Now attendance analytics.</p>
        </div>
      )}
    </div>
  );
}
