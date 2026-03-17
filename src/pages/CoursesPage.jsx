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
    const types = timetableMapping[a.courseCode];
    if (types) {
      if (types.size === 1) return Array.from(types)[0];
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
          s === 'theory' || s === 'practical' || s === 'lab' || s === 'clinical'
        );
      };

      if (isNoise(lowerTheme) || isNoise(code)) return false;
      
      return true;
    });
  }, [attendance]);

  const courses = useMemo(() => {
    return FILTERED_ATTENDANCE.map(a => {
      const type = resolveType(a);
      const norm = normalizeSlot(type);
      return {
        title: a.courseTitle,
        code: a.courseCode.startsWith('21') ? a.courseCode : `21${a.courseCode}`,
        slot: a.slot,
        type: norm.label,
        css: norm.css,
      };
    });
  }, [FILTERED_ATTENDANCE, timetableMapping]);

  const practicalCount = courses.filter(course => (course.css === 'practical')).length;
  const theoryCount = courses.length - practicalCount;

  return (
    <div className="apple-page-container">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Registered Courses</h1>
          <p className="subpage-desc">Overview of your academic enrollments for this semester.</p>
        </div>
      </div>


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
                    <span className="lbl">Type</span>
                    <span className={`val-tag type-badge ${c.css}`}>{c.type}</span>
                  </div>
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
