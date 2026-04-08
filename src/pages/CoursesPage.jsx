import { useMemo } from 'react';
import './SubPages.css';

const Icons = {
  course: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>,
};

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

function normalizeSlot(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('lab') || t.includes('prac') || t.includes('work') || t.includes('practical')) {
    return { label: 'Lab', css: 'practical' };
  }
  return { label: 'Theory', css: 'theory' };
}

export default function CoursesPage() {
  const student = getStudentData();
  const attendance = student.attendance || [];
  const timetable = student.timetable || [];
  const coursesMetadata = student.courses || [];

  const timetableMapping = useMemo(() => {
    const map = {};
    const normalize = (c) => (c || '').trim().toUpperCase().replace(/^21/, '');
    
    // First, map metadata from the full courses list (even those without active slots)
    coursesMetadata.forEach(course => {
      const code = normalize(course.code);
      if (!map[code]) {
        map[code] = {
          types: new Set(),
          credit: course.credit,
          faculty: course.faculty
        };
      }
      map[code].types.add(course.slotType);
    });

    // Then, supplement/override with active timetable sessions
    timetable.forEach(cls => {
      const code = normalize(cls.courseCode);
      if (!map[code]) {
        map[code] = {
          types: new Set(),
          credit: cls.credit,
          faculty: cls.faculty
        };
      }
      map[code].types.add(cls.slotType);
    });
    return map;
  }, [timetable, coursesMetadata]);

  const resolveType = (a) => {
    const code = (a.courseCode || '').trim().toUpperCase().replace(/^21/, '');
    const data = timetableMapping[code];
    if (data) {
      if (data.types.size === 1) return Array.from(data.types)[0];
      const s = (a.slot || '').toUpperCase();
      if (s.includes('P') || s.includes('L')) return 'Practical';
      return 'Theory';
    }
    return a.slotType || 'Theory';
  };

  const FILTERED_ATTENDANCE = useMemo(() => {
    return attendance.filter(a => {
      const title = (a.courseTitle || '').trim();
      const code = (a.courseCode || '').trim().toLowerCase();
      if (!title || title.length <= 2) return false;
      const lowerTheme = title.toLowerCase();
      
      // Strict filtering of internal SRM system rows and noise
      const isNoise = (str) => {
        const s = str.toLowerCase();
        return (
          s.includes('llj') || 
          s.includes('ft-') || 
          s.startsWith('ft') || 
          s.includes('fj-') || 
          s.includes('total') || 
          s.includes('faculty') ||
          s.startsWith('ct-') || 
          s.startsWith('cat-') ||
          s.includes('pbl') ||
          s === 'r i' || s === 'r ii' || s.startsWith('21r i/') ||
          s === 'theory' || s === 'practical' || s === 'lab' || s === 'clinical'
        );
      };

      if (isNoise(lowerTheme) || isNoise(code)) return false;
      
      return true;
    });
  }, [attendance]);

  const courses = useMemo(() => {
    const normalize = (c) => (c || '').trim().toUpperCase().replace(/^21/, '');
    
    return FILTERED_ATTENDANCE.map(a => {
      const type = resolveType(a);
      const norm = normalizeSlot(type);
      const code = normalize(a.courseCode);
      const data = timetableMapping[code];

      return {
        title: a.courseTitle,
        code: a.courseCode.startsWith('21') ? a.courseCode : `21${a.courseCode}`,
        slot: a.slot,
        type: norm.label,
        css: norm.css,
        credit: data?.credit || '0',
        faculty: data?.faculty || 'N/A',
      };
    });
  }, [FILTERED_ATTENDANCE, timetableMapping]);

  const needsResync = useMemo(() => {
    if (courses.length === 0 || !student?.timetable?.length) return false;
    // If all courses have 0 credits, we likely need a fresh sync
    return courses.every(c => c.credit === '0' || c.credit === 0 || !c.credit);
  }, [courses, student]);

  const totalCredits = useMemo(() => {
    const seen = new Set();
    return courses.reduce((acc, curr) => {
      const code = curr.code.toUpperCase();
      if (seen.has(code)) return acc;
      seen.add(code);
      return acc + (parseFloat(curr.credit) || 0);
    }, 0);
  }, [courses]);

  const practicalCount = courses.filter(course => (course.css === 'practical')).length;
  const theoryCount = courses.length - practicalCount;

  return (
    <div className="apple-page-container">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Registered Courses</h1>
          <p className="subpage-desc">Overview of your academic enrollments for this semester.</p>
        </div>
        
        <div className="total-credits-card">
          <span className="lbl">Total Sem Credits</span>
          <span className="val">{totalCredits}</span>
        </div>
      </div>

      <style>{`
        .total-credits-card {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        .total-credits-card .lbl {
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .total-credits-card .val {
          font-size: 1.65rem;
          font-weight: 900;
          color: var(--accent);
          line-height: 1;
          letter-spacing: -0.03em;
        }
        @media (max-width: 768px) {
          .subpage-header {
            gap: 12px !important;
          }
          .total-credits-card {
            flex-direction: row !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100%;
            background: var(--accent-subtle);
            padding: 12px 16px;
            border-radius: 14px;
            border: 1px solid var(--border-active);
          }
          .total-credits-card .lbl {
            color: var(--accent);
            font-size: 0.7rem;
            letter-spacing: 0.02em;
          }
          .total-credits-card .val {
            font-size: 1.4rem;
            margin: 0;
          }
        }
        @media (max-width: 430px) {
          .subpage-title { font-size: 1.35rem; }
          .subpage-desc { font-size: 0.78rem; opacity: 0.8; }
        }
      `}</style>

      {needsResync && (
        <div className="prediction-overlay-hint" style={{ borderRadius: '12px', border: '1px solid var(--border-active)', marginBottom: '12px' }}>
          Missing Credit/Faculty data? Try <strong>Logging In again</strong> to sync.
        </div>
      )}


      {courses.length > 0 ? (
        <div className="courses-grid-apple stagger-children">
          {courses.map((c, i) => (
            <div key={i} className="course-card-apple">
              <div className="card-accent" />
              <div className="card-content">
                <span className="course-code-tag">{c.code}</span>
                <h3>{c.title}</h3>

                <div className="course-meta-row">
                  <div className="meta-item">
                    <span className="lbl">Slot</span>
                    <span className="val">{c.slot || 'N/A'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="lbl">Credit</span>
                    <span className="val">{c.credit}</span>
                  </div>
                  <div className="meta-item">
                    <span className="lbl">Type</span>
                    <span className={`val-tag type-badge ${c.css}`}>{c.type}</span>
                  </div>
                </div>
                <div className="meta-item" style={{ marginTop: '12px', borderTop: '1px solid var(--border-secondary)', paddingTop: '10px' }}>
                  <span className="lbl">Faculty</span>
                  <span className="val" style={{ 
                    fontSize: '0.78rem', 
                    color: c.faculty === 'N/A' ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                    fontWeight: c.faculty === 'N/A' ? '500' : '650'
                  }}>
                    {c.faculty || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">{Icons.course}</div>
          <h3>No courses mapped</h3>
          <p>Login to sync your registration data.</p>
        </div>
      )}
    </div>
  );
}
