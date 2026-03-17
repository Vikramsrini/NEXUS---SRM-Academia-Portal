import { useMemo } from 'react';
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

const isSystemNoise = (str) => {
  if (!str) return false;
  const s = String(str).toLowerCase();
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
  const rows = (Array.isArray(exams) ? exams : [])
    .map((exam) => {
      const name = String(exam?.exam || '').trim();
      const obtained = parseFloat(exam?.obtained);
      const max = parseFloat(exam?.maxMark);
      const pct = max > 0 && Number.isFinite(obtained) ? (obtained / max) * 100 : 0;
      return {
        label: name || `C${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
        pct: Math.max(0, Math.min(100, pct)),
      };
    })
    .filter((r) => r.label);

  if (!rows.length) return null;

  const labels = ['Start', ...rows.map((r) => r.label)];
  const values = [0, ...rows.map((r) => r.pct)];

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

  const toPath = (pts) => {
    if (pts.length === 0) return '';
    return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

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

  const dataPoints = points.slice(1); // Exclude the "Start" dummy point for the main line
  const mainPath = getSmoothPath(dataPoints);

  let fillPath = '';
  if (dataPoints.length >= 2) {
    fillPath = `${mainPath} L ${dataPoints[dataPoints.length - 1].x} ${bottom} L ${dataPoints[0].x} ${bottom} Z`;
  } else if (dataPoints.length === 1) {
    // For single point, we don't really have a "trend" line or fill, just the point
  }

  // Dashed connector from "Start" to first real point
  const dashedPath = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  return { points, labels, dashedPath, mainPath, fillPath, bottom };
}

export default function MarksPage() {
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

      {FILTERED_MARKS.length > 0 ? (
        <div className="marks-grid-apple stagger-children">
          {FILTERED_MARKS.map((m, i) => {
            const displayName = getDisplayCourseName(m, courseNameByCode);
            const pctValue = m.total?.maxMark > 0 ? (m.total.obtained / m.total.maxMark) * 100 : 0;
            const pct = Math.max(0, Math.min(100, pctValue));
            const individualMarks = (m.marks || []).filter(exam => !isSystemNoise(exam.exam));
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
