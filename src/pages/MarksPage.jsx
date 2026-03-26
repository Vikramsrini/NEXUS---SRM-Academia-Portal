import { useMemo, useState, useEffect } from 'react';
import './SubPages.css';

const Icons = {
  marks: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
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

function buildTrendChart(exams) {
  const validExams = (Array.isArray(exams) ? exams : [])
    .map((exam) => {
      const name = String(exam?.exam || '').trim();
      const obtained = parseFloat(exam?.obtained);
      const max = parseFloat(exam?.maxMark);
      const pct = max > 0 && Number.isFinite(obtained) ? (obtained / max) * 100 : 0;
      return {
        label: name || 'Test',
        pct: Math.max(0, Math.min(100, pct)),
      };
    })
    .filter((r) => r.label);

  if (!validExams.length) return null;

  // If there's only one test, we shouldn't show a "trend", but we should show the point
  // To handle the chart logic, we use a 'Start' point at 0%
  const labels = ['Start', ...validExams.map((r) => r.label)];
  const values = [0, ...validExams.map((r) => r.pct)];

  const top = 10;
  const bottom = 50;
  const height = bottom - top;
  const chartLeft = 8;
  const chartRight = 96;
  const chartWidth = chartRight - chartLeft;
  const step = values.length > 1 ? chartWidth / (values.length - 1) : chartWidth;

  const points = values.map((v, idx) => {
    const x = Number((chartLeft + idx * step).toFixed(2));
    const y = Number((bottom - (v / 100) * height).toFixed(2));
    return { x, y, v, label: labels[idx] };
  });

  const getStraightPath = (pts) => {
    if (pts.length < 1) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  };

  const dataPoints = points; 
  const mainPath = getStraightPath(dataPoints);

  let fillPath = '';
  if (dataPoints.length >= 2) {
    fillPath = `${mainPath} L ${dataPoints[dataPoints.length - 1].x} ${bottom} L ${dataPoints[0].x} ${bottom} Z`;
  }

  const dashedPath = '';

  return { points, labels, dashedPath, mainPath, fillPath, bottom };
}

const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'F': 0 };
const PREDICT_GRADES = ['C', 'B', 'B+', 'A', 'A+', 'O'];
const GRADE_THRESHOLDS = { 'O': 91, 'A+': 81, 'A': 71, 'B+': 61, 'B': 56, 'C': 50, 'F': 0 };

function SgpaPredictor({ courses, nameByCode, onClose }) {
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
      const remaining = Math.max(0, 60 - currentMax);
      
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
      const credit = c.course?.toLowerCase().includes('lab') ? 1.5 : 4;
      
      totalPoints += points * credit;
      totalCredits += credit;
    });
    
    return {
      sgpa: totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00'
    };
  }, [courses, targetGrades, enabledCourses]);


  const calculateFinalsNeeded = (id, targetGrade) => {
    const current = parseFloat(internalMarks[id]) || 0;
    const expected = parseFloat(expectedRemaining[id]) || 0;
    const projectedInternals = current + expected;
    const threshold = GRADE_THRESHOLDS[targetGrade];
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
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
          const current = internalMarks[id];
          const remainingMax = Math.max(0, 60 - (c.total?.maxMark || 0));
          const expected = expectedRemaining[id];
          const target = targetGrades[id];
          const needed = calculateFinalsNeeded(id, target);
          const isHard = needed > 55;
          const isImpossible = needed > 75;
          const projectedInternals = (parseFloat(current) || 0) + (parseFloat(expected) || 0);

          return (
            <div key={id} className={`sgpa-item-card ${!isEnabled ? 'disabled' : ''}`}>
              <header>
                <div className="header-main">
                  <label className="apple-switch">
                    <input 
                      type="checkbox" 
                      checked={isEnabled} 
                      onChange={() => setEnabledCourses(p => ({ ...p, [id]: !p[id] }))} 
                    />
                    <span className="slider"></span>
                  </label>
                  <div className="course-info">
                    <h3>{getDisplayCourseName(c, nameByCode)}</h3>
                    <span className="code">{id}</span>
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
                    <span className="denom">/ {c.total?.maxMark || 0}</span>
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
                  <span className="lbl">Finals needed</span>
                  <span className={`val ${isImpossible ? 'impossible' : ''}`}>
                    {isImpossible ? 'Impossible' : `${needed}/75`}
                  </span>
                </div>
                <div className="footer-right">
                   {isEnabled && !isImpossible && (
                     <span className={`diff-tag ${isHard ? 'red' : 'green'}`}>
                       {isHard ? 'Hard' : 'Easy'}
                     </span>
                   )}
                   <span className="pct-info">{projectedInternals.toFixed(1)} / 60 Internals</span>
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
  const student = getStudentData();
  const marks = student.marks || [];
  const attendance = student.attendance || [];

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
          <h1 className="subpage-title">Marks & Grades</h1>
          <p className="subpage-desc">Track performance and predict your semester SGPA.</p>
        </div>
        <button className="apple-btn primary" onClick={() => setIsPredictorOpen(!isPredictorOpen)}>
          <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>{Icons.calculator}</span>
          SGPA Calculator
        </button>
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
          onClose={() => setIsPredictorOpen(false)} 
        />
      ) : FILTERED_MARKS.length > 0 ? (
        <div className="marks-grid-apple stagger-children">
          {FILTERED_MARKS.map((m, i) => {
            const displayName = getDisplayCourseName(m, courseNameByCode);
            const pctValue = m.total?.maxMark > 0 ? (m.total.obtained / m.total.maxMark) * 100 : 0;
            const pct = Math.max(0, Math.min(100, pctValue));
            const individualMarks = (m.marks || []).filter(exam => !isSystemNoise(exam.exam, true));
            const trendChart = buildTrendChart(individualMarks);
            return (
              <div key={i} className="marks-card-apple">
                <div className="card-header">
                   <div className="title-group">
                      <h3>{displayName}</h3>
                      <span className="meta">{m.courseCode.startsWith('21') ? m.courseCode : `21${m.courseCode}`} • {m.category}</span>
                   </div>
                   <div className="big-score">
                      <div className="fraction">{m.total?.obtained}<span>/{m.total?.maxMark}</span></div>
                      <div className="percentage">{pct.toFixed(0)}%</div>
                   </div>
                </div>

                <div className="marks-graph-apple" aria-hidden="true">
                  {trendChart ? (
                    <>
                      <div className="marks-graph-legend">
                        <span className="dot" /> Performance Trend
                      </div>
                      <svg className="marks-trend-svg" viewBox="0 0 100 56" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id={`gradient-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                          </linearGradient>
                          <filter id={`glow-${i}`}>
                            <feGaussianBlur stdDeviation="0.4" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                        </defs>
                        
                        {/* Shorter Grid lines */}
                        {[0, 25, 50, 75, 100].map((v) => {
                          const y = 50 - (v / 100) * 40;
                          return (
                            <g key={`h-${v}`}>
                              <line className="marks-grid-line" x1="0" y1={y} x2="100" y2={y} strokeDasharray="2,2" />
                              <text className="marks-axis-label" x="0.5" y={y - 1.2}>{v}%</text>
                            </g>
                          );
                        })}

                        {trendChart.fillPath && (
                          <path className="marks-trend-fill" d={trendChart.fillPath} fill={`url(#gradient-${i})`} />
                        )}

                        {trendChart.dashedPath && <path className="marks-trend-line-dashed" d={trendChart.dashedPath} />}
                        {trendChart.mainPath && (
                          <path 
                            className="marks-trend-line" 
                            d={trendChart.mainPath} 
                            filter={`url(#glow-${i})`}
                          />
                        )}

                        {trendChart.points.map((p, idx) => (
                          idx > 0 && (
                            <g key={`pt-${idx}`}>
                              <circle className="marks-trend-point" cx={p.x} cy={p.y} r="1.2" fill="var(--accent)" />
                            </g>
                          )
                        ))}
                      </svg>
                      <div className="marks-graph-labels">
                        {trendChart.labels.map((label, idx) => (
                          <span key={`lbl-${idx}`}>{label}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="marks-trend-empty">No assessments yet</div>
                  )}
                </div>
                
                <div className="exams-list">
                  {individualMarks.map((exam, j) => (
                    <div key={j} className="exam-row">
                      <span className="exam-name">{exam.exam}</span>
                      <span className="exam-val">{exam.obtained} / {exam.maxMark}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">{Icons.marks}</div>
          <h3>No records found</h3>
          <p>Login to sync your academic performance.</p>
        </div>
      )}

    </div>
  );
}
