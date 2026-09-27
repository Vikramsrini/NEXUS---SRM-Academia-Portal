import { useMemo, useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { refreshSpAttendance } from '../lib/api';
import './SubPages.css';

const Icons = {
  marks: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  calculator: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="8.01" y2="10" />
      <line x1="12" y1="10" x2="12.01" y2="10" />
      <line x1="16" y1="10" x2="16.01" y2="10" />
      <line x1="8" y1="14" x2="8.01" y2="14" />
      <line x1="12" y1="14" x2="12.01" y2="14" />
      <line x1="16" y1="14" x2="16.01" y2="14" />
      <line x1="8" y1="18" x2="8.01" y2="18" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
      <line x1="16" y1="18" x2="16.01" y2="18" />
    </svg>
  )
};

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

function normalizeCourseCode(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '').replace(/^21/, '');
}

const isSystemNoise = (str, isExam = false) => {
  if (!str) return false;
  const s = String(str).toLowerCase().trim();

  if (isExam) {
    // For marks, almost everything with a score is valid. 
    // We only filter out obvious system placeholders if any.
    return s.includes('system-noise-placeholder');
  }

  return (
    s.includes('llj') ||
    s.includes('ft-') ||
    s.startsWith('ft') ||
    s.includes('fj-') ||
    s.includes('total') ||
    s.includes('faculty') ||
    s.startsWith('ct-') ||
    s.startsWith('cat-') ||
    s === 'theory' || s === 'practical' || s === 'lab' || s === 'clinical'
  );
};

function looksLikeCourseCode(value) {
  const s = String(value || '').trim().toUpperCase();
  return /^[0-9A-Z]{6,}$/.test(s) && /\d/.test(s);
}

function getDisplayCourseName(markRow, nameByCode) {
  const code = normalizeCourseCode(markRow?.courseCode);
  const mapped = nameByCode[code];
  if (mapped) return mapped;

  const raw = String(markRow?.course || '').trim();
  if (!raw || looksLikeCourseCode(raw)) return markRow?.courseCode || 'Course';
  return raw;
}

function getExamWeight(name) {
  const s = String(name || '').toLowerCase().trim();
  if (s === '0' || s === 'start') return -1;
  let weight = 50;
  if (s.includes('ft')) weight = 10;
  if (s.includes('cat') || s.includes('at') || s.includes('ct')) weight = 20;
  if (s.includes('sem')) weight = 90;

  const numMatch = s.match(/\d+/);
  if (numMatch) {
    weight += parseInt(numMatch[0]);
  } else {
    if (s.includes('iii')) weight += 3;
    else if (s.includes('ii')) weight += 2;
    else if (s.includes('i')) weight += 1;
  }
  return weight;
}

function formatExamLabel(name) {
  const s = String(name || '').trim();
  if (s.toLowerCase().includes('mark / max') || s.toLowerCase() === 'mark / max. mark' || s.toLowerCase() === 'mark') {
    return 'Internal Assessment';
  }
  return s;
}

function buildTrendChart(exams) {
  const sortedExams = (Array.isArray(exams) ? exams : [])
    .filter((exam) => String(exam?.exam || '').trim())
    .sort((a, b) => getExamWeight(a.exam) - getExamWeight(b.exam));

  const validExams = sortedExams.map((exam) => {
    const name = formatExamLabel(exam?.exam);
    const obtained = parseFloat(exam?.obtained);
    const max = parseFloat(exam?.maxMark);
    const pct = max > 0 && Number.isFinite(obtained) ? (obtained / max) * 100 : 0;
    return {
      label: name || 'Test',
      pct: Math.max(0, Math.min(100, pct)),
      obtained,
      maxMark: max,
    };
  });

  if (!validExams.length) return null;

  const top = 10;
  const bottom = 50;
  const height = bottom - top;

  // Single assessment: display clean benchmark indicator instead of fake diagonal line
  if (validExams.length === 1) {
    const exam = validExams[0];
    const y = Number((bottom - (exam.pct / 100) * height).toFixed(2));
    const point = { x: 50, y, v: exam.pct, label: exam.label };
    return {
      isSingle: true,
      points: [point],
      labels: [exam.label],
      singleLine: { x1: 15, x2: 85, y },
      bottom,
    };
  }

  // Multi assessment: trend line between actual evaluations (no artificial 0 start)
  const chartLeft = 14;
  const chartRight = 86;
  const chartWidth = chartRight - chartLeft;
  const labels = validExams.map((r) => r.label);
  const values = validExams.map((r) => r.pct);
  const step = chartWidth / (values.length - 1);

  const points = values.map((v, idx) => {
    const x = Number((chartLeft + idx * step).toFixed(2));
    const y = Number((bottom - (v / 100) * height).toFixed(2));
    return { x, y, v, label: labels[idx] };
  });

  let mainPath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    mainPath += ` L ${points[i].x} ${points[i].y}`;
  }

  const fillPath = `${mainPath} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`;

  return { isSingle: false, points, labels, mainPath, fillPath, bottom };
}

const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'F': 0 };
const PREDICT_GRADES = ['C', 'B', 'B+', 'A', 'A+', 'O'];
const GRADE_THRESHOLDS = { 'O': 91, 'A+': 81, 'A': 71, 'B+': 61, 'B': 56, 'C': 50, 'F': 0 };

const isInternalOnly = (id, category) => {
  const s = String(id || '').toUpperCase();
  const cat = String(category || '').toUpperCase();
  return s.endsWith('P') || s.includes('CSP') || cat.includes('PROJECT') || cat === 'P';
};

function SgpaPredictor({ courses, nameByCode, creditsByCode, onClose }) {
  const [internalMarks, setInternalMarks] = useState({});
  const [expectedRemaining, setExpectedRemaining] = useState({});
  const [targetGrades, setTargetGrades] = useState({});
  const [enabledCourses, setEnabledCourses] = useState({});

  useEffect(() => {
    const initialInternals = {};
    const initialRemaining = {};
    const initialTargets = {};
    const initialEnabled = {};

    courses.forEach(c => {
      const id = c.courseCode;
      const currentMax = c.total?.maxMark || 0;
      const currentObtained = c.total?.obtained || 0;
      const maxInternal = isInternalOnly(id, c.category) ? 100 : 60;
      const remaining = Math.max(0, maxInternal - currentMax);

      initialInternals[id] = internalMarks[id] || currentObtained;
      initialRemaining[id] = expectedRemaining[id] || remaining;
      initialTargets[id] = targetGrades[id] || 'O';
      initialEnabled[id] = enabledCourses[id] ?? true;
    });

    setInternalMarks(prev => ({ ...initialInternals, ...prev }));
    setExpectedRemaining(prev => ({ ...initialRemaining, ...prev }));
    setTargetGrades(prev => ({ ...initialTargets, ...prev }));
    setEnabledCourses(prev => ({ ...initialEnabled, ...prev }));
  }, [courses]);

  const stats = useMemo(() => {
    let totalPoints = 0;
    let totalCredits = 0;

    courses.forEach(c => {
      const id = c.courseCode;
      if (!enabledCourses[id]) return;

      const grade = targetGrades[id] || 'O';
      const points = GRADE_POINTS[grade];
      const rawCredit = creditsByCode[normalizeCourseCode(id)];
      const credit = (rawCredit !== undefined && rawCredit !== null) ? rawCredit : (c.course?.toLowerCase().includes('lab') ? 1.5 : 4);

      totalPoints += points * credit;
      totalCredits += credit;
    });

    return {
      sgpa: totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00'
    };
  }, [courses, targetGrades, enabledCourses]);


  const calculateFinalsNeeded = (c, targetGrade) => {
    const id = c.courseCode;
    const isP = isInternalOnly(id, c.category);
    const current = parseFloat(internalMarks[id]) || 0;
    const expected = parseFloat(expectedRemaining[id]) || 0;
    const projectedInternals = current + expected;
    const threshold = GRADE_THRESHOLDS[targetGrade];

    if (isP) return null; // No end exams
    if (threshold === 0) return 0;

    // threshold = projectedInternals + (needed / 75) * 40
    const needed = (threshold - projectedInternals) * 75 / 40;
    return Math.max(0, Math.ceil(needed));
  };

  if (!courses.length) return null;

  return (
    <div className="sgpa-inline-container animate-fade-in-up">
      <header className="sgpa-inline-header">
        <div className="header-left">
          <div className="title-row">
            <button className="back-btn" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <h2>SGPA Calculator</h2>
          </div>
          <p>Adjust your expected marks to simulate your semester results.</p>
        </div>
        <div className="header-actions">
          <div className="target-all-dropdown">
            <span>Target All</span>
            <select onChange={(e) => {
              const grade = e.target.value;
              const fresh = {};
              courses.forEach(c => fresh[c.courseCode] = grade);
              setTargetGrades(fresh);
            }}>
              {PREDICT_GRADES.slice().reverse().map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className={`sgpa-summary-badge ${parseFloat(stats.sgpa) >= 9 ? 'excellent' : ''}`}>
            <span className="lbl">Estimated SGPA</span>
            <span className="val">{stats.sgpa}</span>
          </div>
        </div>
      </header>

      <div className="sgpa-grid-apple stagger-children">
        {courses.map((c) => {
          const id = c.courseCode;
          const isEnabled = enabledCourses[id];
          const isP = isInternalOnly(id, c.category);
          const current = internalMarks[id];
          const maxInternal = isP ? 100 : 60;
          const remainingMax = Math.max(0, maxInternal - (c.total?.maxMark || 0));
          const expected = expectedRemaining[id];
          const target = targetGrades[id];
          const projectedInternals = (parseFloat(current) || 0) + (parseFloat(expected) || 0);
          const needed = calculateFinalsNeeded(c, target);
          const isHard = needed > 55;
          const isImpossible = (!isP && needed > 75) || (isP && projectedInternals < GRADE_THRESHOLDS[target]);

          return (
            <div key={id} className={`sgpa-item-card ${!isEnabled ? 'disabled' : ''}`}>
              <header>
                <div className="header-main">
                  <label className="apple-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(isEnabled)}
                      onChange={() => setEnabledCourses(p => ({ ...p, [id]: !Boolean(p[id]) }))}
                    />
                    <span className="slider"></span>
                  </label>
                  <div className="course-info">
                    <h3>{getDisplayCourseName(c, nameByCode)}</h3>
                    <span className="code">{id} • {((creditsByCode[normalizeCourseCode(id)] !== undefined && creditsByCode[normalizeCourseCode(id)] !== null) ? creditsByCode[normalizeCourseCode(id)] : (c.course?.toLowerCase().includes('lab') ? 1.5 : 4))} Credits</span>
                  </div>
                </div>
              </header>

              <div className="sgpa-inputs-row">
                <div className="apple-input-group">
                  <label>Current Internals</label>
                  <div className="input-wrap">
                    <input
                      type="number"
                      value={current}
                      onChange={(e) => setInternalMarks(p => ({ ...p, [id]: e.target.value }))}
                    />
                    <span className="denom">/ {c.total?.maxMark || (isP ? 100 : 60)}</span>
                  </div>
                </div>
                <div className="apple-input-group">
                  <label>Expected Remaining</label>
                  <div className="input-wrap">
                    <input
                      type="number"
                      max={remainingMax}
                      value={expected}
                      onChange={(e) => setExpectedRemaining(p => ({ ...p, [id]: e.target.value }))}
                    />
                    <span className="denom">/ {remainingMax}</span>
                  </div>
                </div>
              </div>

              <div className="grade-slider-wrap">
                <div className="slider-header">
                  <span>Target Grade</span>
                  <strong>{target}</strong>
                </div>
                <input
                  type="range"
                  className="apple-range"
                  min="0"
                  max={PREDICT_GRADES.length - 1}
                  value={PREDICT_GRADES.indexOf(target)}
                  onChange={(e) => setTargetGrades(p => ({ ...p, [id]: PREDICT_GRADES[parseInt(e.target.value)] }))}
                  style={{ backgroundSize: `${(PREDICT_GRADES.indexOf(target) / (PREDICT_GRADES.length - 1)) * 100}% 100%` }}
                />
                <div className="grade-marks">
                  {PREDICT_GRADES.map(g => (
                    <span key={g} className={target === g ? 'active' : ''}>{g}</span>
                  ))}
                </div>
              </div>

              <div className="sgpa-item-footer">
                <div className="needed">
                  <span className="lbl">{isP ? 'Assessment' : 'Finals needed'}</span>
                  <span className={`val ${isImpossible ? 'impossible' : ''}`}>
                    {isP ? (isImpossible ? 'Shortfall' : 'Internal Only') : (isImpossible ? 'Impossible' : `${needed}/75`)}
                  </span>
                </div>
                <div className="projected">
                  <span className="lbl">Projected Internals</span>
                  <div className="val-section">
                    {isEnabled && !isImpossible && (
                      <span className={`diff-tag ${isHard ? 'red' : 'green'}`}>
                        {isHard ? 'Hard' : 'Easy'}
                      </span>
                    )}
                    <span className="val">{projectedInternals.toFixed(1)}<span>/{isP ? 100 : 60}</span></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



export default function MarksPage() {
  const [isPredictorOpen, setIsPredictorOpen] = useState(false);
  const [spLoading, setSpLoading] = useState(false);
  const [spError, setSpError] = useState('');
  const context = useOutletContext() || {};
  const student = context.student || getStudentData();
  const regNumber = String(student.regNumber || '').trim();
  const marks = student.marks || [];
  const attendance = student.attendance || [];

  const handleRefreshMarks = async () => {
    if (!regNumber) return;
    setSpLoading(true);
    setSpError('');
    try {
      const result = await refreshSpAttendance(regNumber);
      if (result.marks?.length > 0 || result.attendance?.length > 0) {
        const stored = getStudentData();
        if (result.marks?.length > 0) stored.marks = result.marks;
        if (result.attendance?.length > 0) stored.attendance = result.attendance;
        localStorage.setItem('academia_student', JSON.stringify(stored));
        localStorage.setItem('academia_last_sync_time', Date.now().toString());
        if (typeof context.setStudent === 'function') {
          context.setStudent(stored);
        }
      } else {
        setSpError('No marks found on Student Portal');
      }
    } catch (err) {
      setSpError(err.message || 'Failed to refresh marks');
    } finally {
      setSpLoading(false);
    }
  };

  // Automatically sync marks on tab visit if not already loaded
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!autoSyncedRef.current && regNumber && (!marks || marks.length === 0)) {
      autoSyncedRef.current = true;
      handleRefreshMarks();
    }
  }, [regNumber, marks]);

  const courseNameByCode = useMemo(() => {
    const map = {};
    attendance.forEach((a) => {
      const code = normalizeCourseCode(a.courseCode);
      const title = String(a.courseTitle || '').trim();
      const lower = title.toLowerCase();
      if (!code || !title) return;
      if (['theory', 'practical', 'lab', 'clinical'].includes(lower)) return;
      if (lower.startsWith('ft-') || lower.includes('total')) return;
      map[code] = title;
    });
    return map;
  }, [attendance]);

  const courseCreditsByCode = useMemo(() => {
    const map = {};
    const norm = (c) => String(c || '').toUpperCase().replace(/\s+/g, '').replace(/^21/, '');

    (student.courses || []).forEach(c => {
      const code = norm(c.code);
      if (code && (c.credit !== undefined && c.credit !== null)) map[code] = parseFloat(c.credit);
    });

    (student.timetable || []).forEach(cls => {
      const code = norm(cls.courseCode);
      if (code && (cls.credit !== undefined && cls.credit !== null) && map[code] === undefined) map[code] = parseFloat(cls.credit);
    });

    return map;
  }, [student]);

  const FILTERED_MARKS = useMemo(() => {
    return marks.filter((m) => {
      const title = String(m.course || '').trim();
      const code = String(m.courseCode || '').trim();
      if (isSystemNoise(title) || isSystemNoise(code)) return false;
      if (title.length <= 2) return false;
      return true;
    });
  }, [marks]);

  const marksInsights = useMemo(() => {
    if (!FILTERED_MARKS.length) return null;

    let totalPct = 0;
    let exams = 0;
    let topCourse = '—';
    let topCode = '—';
    let topPct = -1;
    let lowCourse = '—';
    let lowCode = '—';
    let lowPct = 101;

    FILTERED_MARKS.forEach((m) => {
      const pct = m.total?.maxMark > 0 ? (m.total.obtained / m.total.maxMark) * 100 : 0;
      totalPct += pct;
      exams += m.marks?.length || 0;

      if (pct > topPct) {
        topPct = pct;
        topCourse = getDisplayCourseName(m, courseNameByCode);
        topCode = m.courseCode || '—';
      }

      if (pct < lowPct) {
        lowPct = pct;
        lowCourse = getDisplayCourseName(m, courseNameByCode);
        lowCode = m.courseCode || '—';
      }
    });

    return {
      average: (totalPct / FILTERED_MARKS.length).toFixed(1),
      exams,
      courses: FILTERED_MARKS.length,
      topCourse,
      topCode,
      topPct: topPct.toFixed(0),
      lowCourse,
      lowCode,
      lowPct: lowPct.toFixed(0),
    };
  }, [FILTERED_MARKS, courseNameByCode]);

  return (
    <div className="apple-page-container">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Marks</h1>
          <p className="subpage-desc">Track performance and predict your semester SGPA.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="apple-btn"
            onClick={handleRefreshMarks}
            disabled={spLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
              color: '#60a5fa', borderRadius: 8, padding: '8px 14px', cursor: spLoading ? 'not-allowed' : 'pointer'
            }}
            title="Sync latest marks from Student Portal"
          >
            <span style={{ display: 'inline-block', transform: spLoading ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }}>↻</span>
            {spLoading ? 'Syncing…' : 'Sync Marks'}
          </button>
          <button className="apple-btn primary" onClick={() => setIsPredictorOpen(!isPredictorOpen)}>
            <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>{Icons.calculator}</span>
            SGPA Calculator
          </button>
        </div>
      </div>


      {marksInsights && (
        <section className="marks-insights-row animate-fade-in-up" aria-label="Marks highlights">
          <article className="marks-insight-card top">
            <span className="kicker">Highest Score</span>
            <strong className="value">{marksInsights.topPct}%</strong>
            <p className="subject">
              {marksInsights.topCourse} • {marksInsights.topCode?.startsWith('21') ? marksInsights.topCode : `21${marksInsights.topCode}`}
            </p>
          </article>
          <article className="marks-insight-card low">
            <span className="kicker">Lowest Score</span>
            <strong className="value">{marksInsights.lowPct}%</strong>
            <p className="subject">
              {marksInsights.lowCourse} • {marksInsights.lowCode?.startsWith('21') ? marksInsights.lowCode : `21${marksInsights.lowCode}`}
            </p>
          </article>
        </section>
      )}

      {isPredictorOpen ? (
        <SgpaPredictor
          courses={FILTERED_MARKS}
          nameByCode={courseNameByCode}
          creditsByCode={courseCreditsByCode}
          onClose={() => setIsPredictorOpen(false)}
        />
      ) : FILTERED_MARKS.length > 0 ? (
        <div className="marks-grid-apple stagger-children">
          {FILTERED_MARKS.map((m, i) => {
            const displayName = getDisplayCourseName(m, courseNameByCode);
            const obtained = Number(m.total?.obtained) || 0;
            const maxMark = Number(m.total?.maxMark) || 0;
            const pctValue = maxMark > 0 ? (obtained / maxMark) * 100 : 0;
            const pct = Math.max(0, Math.min(100, pctValue));
            const individualMarks = (m.marks || [])
              .filter(exam => !isSystemNoise(exam.exam, true))
              .sort((a, b) => getExamWeight(a.exam) - getExamWeight(b.exam));

            // Chart coordinates: viewBox 0 0 100 48
            const chartTop = 4;
            const chartBottom = 44;
            const chartHeight = chartBottom - chartTop;
            const startX = 3;
            const startY = chartBottom; // 0%
            const endX = 97;
            const endY = Number((chartBottom - (pct / 100) * chartHeight).toFixed(2));

            return (
              <div key={i} className="campus-marks-card">
                <div className="campus-card-header">
                  <div className="campus-title-group">
                    <h3>{displayName}</h3>
                    <span className="campus-meta">
                      {m.courseCode.startsWith('21') ? m.courseCode : `21${m.courseCode}`} - {m.category || 'Theory'}
                    </span>
                  </div>
                  <div className="campus-big-score">
                    <span className="campus-score-val">{obtained.toFixed(2).replace(/\.00$/, '')}</span>
                    <span className="campus-score-max">/{maxMark}</span>
                  </div>
                </div>

                <div className="campus-chart-body">
                  <div className="campus-y-axis">
                    <span>100</span>
                    <span>80</span>
                    <span>60</span>
                    <span>40</span>
                    <span>20</span>
                    <span>0</span>
                  </div>

                  <div className="campus-graph-area">
                    <svg className="campus-trend-svg" viewBox="0 0 100 48" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`marks-grad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="var(--marks-accent, #007AFF)" stopOpacity="0.28" />
                          <stop offset="100%" stopColor="var(--marks-accent, #007AFF)" stopOpacity="0.0" />
                        </linearGradient>
                        <filter id={`marks-glow-${i}`} x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="var(--marks-accent, #007AFF)" floodOpacity="0.65" />
                        </filter>
                      </defs>

                      {/* Horizontal Grid lines matching 100, 80, 60, 40, 20 */}
                      {[100, 80, 60, 40, 20].map((val) => {
                        const y = chartBottom - (val / 100) * chartHeight;
                        return (
                          <line
                            key={val}
                            className="campus-grid-line"
                            x1="0"
                            y1={y}
                            x2="100"
                            y2={y}
                          />
                        );
                      })}

                      {/* Area Fill */}
                      <path
                        d={`M ${startX} ${startY} L ${endX} ${endY} L ${endX} ${chartBottom} L ${startX} ${chartBottom} Z`}
                        fill={`url(#marks-grad-${i})`}
                      />

                      {/* Trend Line */}
                      <line
                        className="campus-trend-line"
                        x1={startX}
                        y1={startY}
                        x2={endX}
                        y2={endY}
                        filter={`url(#marks-glow-${i})`}
                      />

                      {/* Start Node (at 0) */}
                      <circle className="campus-node-outer" cx={startX} cy={startY} r="3.4" />
                      <circle className="campus-node-inner" cx={startX} cy={startY} r="1.9" fill="#ffffff" />

                      {/* End Node (at score %) */}
                      <circle className="campus-node-outer" cx={endX} cy={endY} r="3.8" filter={`url(#marks-glow-${i})`} />
                      <circle className="campus-node-inner" cx={endX} cy={endY} r="2.2" fill="#ffffff" />
                    </svg>

                    <div className="campus-x-axis">
                      <span className="x-label-start">0</span>
                      <span className="x-label-end">Internal Marks</span>
                    </div>
                  </div>
                </div>

                {individualMarks.length > 0 && (
                  <div className="campus-components-list">
                    {individualMarks.map((exam, j) => (
                      <div key={j} className="campus-comp-item">
                        <span className="comp-name">{formatExamLabel(exam.exam)}</span>
                        <span className="comp-score">{exam.obtained} <span>/ {exam.maxMark}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">{Icons.marks}</div>
          <h3>No records found</h3>
          <p style={{ marginBottom: 18, opacity: 0.65 }}>
            Sync your latest internal marks directly from the SRM Student Portal.
          </p>
          <button
            onClick={handleRefreshMarks}
            disabled={spLoading}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              border: 'none', borderRadius: 10, padding: '12px 28px',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: spLoading ? 'not-allowed' : 'pointer',
              opacity: spLoading ? 0.7 : 1, transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
            }}
          >
            {spLoading ? 'Syncing Marks…' : 'Sync Marks from Student Portal'}
          </button>
          {spError && (
            <p style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>
              {spError}. If needed, reconnect your Student Portal session on the Attendance page.
            </p>
          )}
        </div>
      )}

    </div>
  );
}
