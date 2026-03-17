import { useMemo, useState, useEffect } from 'react';
import './SubPages.css';

const Icons = {
  marks: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
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

  const width = 100;
  const top = 10;
  const bottom = 50;
  const height = bottom - top;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((v, idx) => {
    const x = Number((idx * step).toFixed(2));
    const y = Number((bottom - (v / 100) * height).toFixed(2));
    return { x, y, v, label: labels[idx] };
  });

  const getSmoothPath = (pts) => {
    if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const curr = pts[i];
        const next = pts[i + 1];
        const mx = (curr.x + next.x) / 2;
        d += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
    }
    return d;
  };

  const dataPoints = points.slice(1); 
  const mainPath = getSmoothPath(dataPoints);

  let fillPath = '';
  if (dataPoints.length >= 2) {
    fillPath = `${mainPath} L ${dataPoints[dataPoints.length - 1].x} ${bottom} L ${dataPoints[0].x} ${bottom} Z`;
  }

  const dashedPath = dataPoints.length > 0 ? `M ${points[0].x} ${points[0].y} L ${dataPoints[0].x} ${dataPoints[0].y}` : '';

  return { points, labels, dashedPath, mainPath, fillPath, bottom };
}

const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'F': 0 };
const GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'F'];
const GRADE_THRESHOLDS = { 'O': 91, 'A+': 81, 'A': 71, 'B+': 61, 'B': 56, 'C': 50, 'F': 0 };

function SgpaPredictor({ courses, onClose }) {
  const [internalMarks, setInternalMarks] = useState({});
  const [targetGrades, setTargetGrades] = useState({});
  const [enabledCourses, setEnabledCourses] = useState({});

  useEffect(() => {
    const initialInternals = {};
    const initialTargets = {};
    const initialEnabled = {};
    
    courses.forEach(c => {
      const id = c.courseCode;
      // Extract internals if they exist in the marks data
      // For Predictor, let's prefill obtained total if it's < 60
      initialInternals[id] = internalMarks[id] || Math.min(60, c.total?.obtained || 0);
      initialTargets[id] = targetGrades[id] || 'O';
      initialEnabled[id] = enabledCourses[id] ?? true;
    });
    
    setInternalMarks(prev => ({ ...initialInternals, ...prev }));
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

  const resetToO = () => {
    const fresh = {};
    courses.forEach(c => fresh[c.courseCode] = 'O');
    setTargetGrades(fresh);
  };

  const calculateFinalsNeeded = (id, targetGrade) => {
    const internal = parseFloat(internalMarks[id]) || 0;
    const threshold = GRADE_THRESHOLDS[targetGrade];
    if (threshold === 0) return 0;
    
    // threshold = internal + (needed / 75) * 40
    const needed = (threshold - internal) * 75 / 40;
    return Math.max(0, Math.ceil(needed));
  };

  if (!courses.length) return null;

  return (
    <div className="sgpa-modal-overlay">
      <div className="sgpa-modal-container animate-scale-up">
        <header className="sgpa-modal-header">
          <div className="header-left">
            <h2>GPA Calculator</h2>
            <button className="status-pill green" onClick={resetToO}>Target All O</button>
          </div>
          <div className="header-right">
             <div className={`sgpa-badge-large ${parseFloat(stats.sgpa) >= 9 ? 'excellent' : ''}`}>
               <span className="lbl">SGPA</span>
               <span className="val">{stats.sgpa}</span>
             </div>
             <button className="close-predictor-btn" onClick={onClose}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
             </button>
          </div>
        </header>

        <div className="sgpa-modal-body custom-scrollbar">
          <div className="sgpa-card-grid">
            {courses.map((c) => {
              const id = c.courseCode;
              const isEnabled = enabledCourses[id];
              const internal = internalMarks[id];
              const target = targetGrades[id];
              const needed = calculateFinalsNeeded(id, target);
              const isHard = needed > 55;
              const isImpossible = needed > 75;

              return (
                <div key={id} className={`sgpa-course-card ${!isEnabled ? 'disabled' : ''}`}>
                  <div className="card-top-row">
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={isEnabled} 
                        onChange={() => setEnabledCourses(p => ({ ...p, [id]: !p[id] }))} 
                      />
                      <span className="slider"></span>
                    </label>
                    <h3>{c.course || id}</h3>
                  </div>

                  <div className="marks-inputs">
                    <div className="input-group">
                      <span className="label">Current (Internals)</span>
                      <div className="input-with-limit">
                        <input 
                          type="number" 
                          max="60" 
                          value={internal} 
                          onChange={(e) => setInternalMarks(p => ({ ...p, [id]: e.target.value }))}
                        />
                        <span className="limit">/ 60</span>
                      </div>
                    </div>
                  </div>

                  <div className="target-slider-section">
                    <div className="slider-label-row">
                      <span>Target Grade</span>
                      <strong>{target}</strong>
                    </div>
                    <input 
                      type="range" 
                      className="grade-slider-range" 
                      min="0" 
                      max={GRADES.length - 2} // Exclude F
                      value={GRADES.indexOf(target)}
                      onChange={(e) => setTargetGrades(p => ({ ...p, [id]: GRADES[parseInt(e.target.value)] }))}
                      style={{ direction: 'rtl' }}
                    />
                    <div className="grade-ticks">
                      {GRADES.slice(0, -1).map(g => (
                        <span key={g} className={target === g ? 'active' : ''}>{g}</span>
                      ))}
                    </div>
                  </div>

                  <div className="finals-needed-row">
                    <span className="label">Finals needed</span>
                    <div className="value-group">
                      <span className={`needed-val ${isImpossible ? 'impossible' : ''}`}>
                        {isImpossible ? 'Impossible' : `${needed}/75`}
                      </span>
                      {!isImpossible && (
                        <span className={`difficulty-tag ${isHard ? 'hard' : 'easy'}`}>
                          {isHard ? 'Hard' : 'Easy'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-footer-info">
                    <span className="points">{GRADE_POINTS[target]} pts • {c.course?.toLowerCase().includes('lab') ? 1.5 : 4} Credits</span>
                    <span className="total-pct">{GRADE_THRESHOLDS[target]}% Target</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
        <button className="apple-btn primary" onClick={() => setIsPredictorOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><path d="M12 2v20M2 12h20"/></svg>
          Calculate SGPA
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

      {isPredictorOpen && (
        <SgpaPredictor 
          courses={FILTERED_MARKS} 
          onClose={() => setIsPredictorOpen(false)} 
        />
      )}

      {FILTERED_MARKS.length > 0 ? (
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
