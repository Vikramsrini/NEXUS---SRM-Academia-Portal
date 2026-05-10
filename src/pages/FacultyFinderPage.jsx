import { useMemo, useState, useEffect } from 'react';
import gradexFaculty from '../data/gradexFaculty.js';
import {
  getMyFacultyEnrollments,
  gradexStaffIsMine,
  findGradexStaffForEnrollment,
} from '../lib/userFaculty.js';
import './SubPages.css';

const Icons = {
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
  ),
};

function RoomStat({ label, value, hint }) {
  const num = value && String(value).trim() ? String(value).trim() : '—';
  return (
    <div className="faculty-room-stat" role="group" aria-label={`${label}: ${num}`}>
      <span className="faculty-room-stat-k">{label}</span>
      <span className="faculty-room-stat-num">{num}</span>
      {hint ? <span className="faculty-room-stat-hint">{hint}</span> : null}
    </div>
  );
}

function staffHaystack(s) {
  return [s.name, s.id, s.room, s.designation, s.department, s.email, s.mobile, s.expertise]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function staffKey(s, idx) {
  return `${s.id}|${idx}`;
}

function mineRowKey(row, idx) {
  return `${row.code}-${row.slot}-${idx}`;
}

function enrollmentSearchHaystack(row, directory) {
  return [
    row.title,
    row.code,
    row.slot,
    row.typeLabel,
    row.facultyRaw,
    row.room,
    directory?.name,
    directory?.id,
    directory?.room,
    directory?.department,
    directory?.designation,
    directory?.email,
    directory?.mobile,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function MyCourseCard({ row, directory }) {
  const name = (directory?.name || '').trim() || row.facultyRaw;
  const officeRoom = (directory?.room || '').trim();
  const metaParts = [];
  if ((directory?.department || '').trim()) metaParts.push(directory.department.trim());

  return (
    <article className="faculty-app-card faculty-mine-card faculty-mine-card--compact">
      <div className="faculty-mine-compact-course">
        <span className="faculty-mine-compact-code">{row.code}</span>
        <p className="faculty-mine-compact-title">{row.title}</p>
        <p className="faculty-mine-compact-slot">
          Slot {row.slot} · {row.typeLabel}
        </p>
      </div>

      <div className="faculty-mine-compact-faculty">
        <div className="faculty-mine-compact-faculty-row">
          <div className="faculty-mine-compact-faculty-main">
            <h2 className="faculty-mine-compact-name">{name}</h2>
            {metaParts.length > 0 ? <p className="faculty-mine-compact-detail">{metaParts.join(' · ')}</p> : null}
            {directory && (directory.email || directory.mobile) ? (
              <p className="faculty-mine-compact-contact">
                {directory.email ? (
                  <a className="faculty-app-link" href={`mailto:${directory.email}`}>
                    {directory.email}
                  </a>
                ) : null}
                {directory.email && directory.mobile ? <span className="faculty-mine-compact-contact-sep"> · </span> : null}
                {directory.mobile ? (
                  <a className="faculty-app-link" href={`tel:${directory.mobile.replace(/\s+/g, '')}`}>
                    {directory.mobile}
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
          {directory ? (
            <div className="faculty-mine-compact-rooms">
              <RoomStat label="Room no." value={officeRoom} />
            </div>
          ) : null}
        </div>
      </div>

      {!directory ? (
        <p className="faculty-mine-compact-footnote">No directory match</p>
      ) : null}
    </article>
  );
}

export default function FacultyFinderPage() {
  const { staff, departments } = gradexFaculty;
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dataTick, setDataTick] = useState(0);

  useEffect(() => {
    const bump = () => setDataTick((n) => n + 1);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, []);

  const enrollments = useMemo(() => {
    void dataTick;
    try {
      return getMyFacultyEnrollments(JSON.parse(localStorage.getItem('academia_student') || '{}'));
    } catch {
      return [];
    }
  }, [dataTick]);

  const deptChips = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...departments.map((d) => ({ id: d, label: d })),
      { id: 'mine', label: 'My faculty' },
    ],
    [departments]
  );

  const myDirectoryIds = useMemo(() => {
    const ids = new Set();
    for (const s of staff) {
      if (gradexStaffIsMine(s, enrollments)) ids.add(s.id);
    }
    return ids;
  }, [staff, enrollments]);

  const mineRows = useMemo(() => {
    if (deptFilter !== 'mine') return [];
    const q = searchQuery.trim().toLowerCase();
    return enrollments
      .map((row) => ({
        ...row,
        directory: findGradexStaffForEnrollment(row.facultyRaw, staff),
      }))
      .filter((row) => {
        if (!q) return true;
        return enrollmentSearchHaystack(row, row.directory).includes(q);
      });
  }, [deptFilter, enrollments, staff, searchQuery]);

  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staff.filter((s) => {
      if (deptFilter !== 'all' && deptFilter !== 'mine' && s.department !== deptFilter) {
        return false;
      }
      if (deptFilter === 'mine') return false;
      if (!q) return true;
      return staffHaystack(s).includes(q);
    });
  }, [staff, deptFilter, searchQuery]);

  const listCount = deptFilter === 'mine' ? mineRows.length : filteredDirectory.length;

  const searchPlaceholder =
    deptFilter === 'mine'
      ? 'Search course or faculty…'
      : 'Search by name, faculty ID, room…';

  return (
    <div className="apple-page-container faculty-finder-page">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Faculty</h1>
          <p className="subpage-desc">
            Search by department, or open <strong>My faculty</strong> for your courses and instructors.
          </p>
        </div>
      </div>

      <div className="faculty-app-toolbar">
        <div className="faculty-app-filters" role="group" aria-label="Filter directory">
          {deptChips.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`faculty-app-chip ${deptFilter === f.id ? 'faculty-app-chip--active' : ''}`}
              onClick={() => setDeptFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="resources-search-bar faculty-app-search-wrap">
          <div className="search-input-wrap faculty-app-search-input">
            {Icons.search}
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {searchQuery.trim() ? (
            <button type="button" className="apple-btn secondary faculty-app-clear" onClick={() => setSearchQuery('')}>
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <p className="faculty-app-results-hint">
        {deptFilter === 'mine' && enrollments.length === 0
          ? 'Sync attendance on the dashboard to use My faculty.'
          : deptFilter === 'mine'
            ? `${mineRows.length} entr${mineRows.length === 1 ? 'y' : 'ies'}`
            : `${filteredDirectory.length} shown`}
      </p>

      <section className="faculty-app-list-panel" aria-label={deptFilter === 'mine' ? 'My faculty' : 'Faculty directory'}>
        <div className="faculty-app-list-head">
          <span className="faculty-app-list-label">{deptFilter === 'mine' ? 'My faculty' : 'Directory'}</span>
          <span className="faculty-app-list-count">{listCount}</span>
        </div>

        <div className="faculty-app-list-body stagger-children">
          {deptFilter === 'mine' ? (
            <>
              {enrollments.length === 0 && (
                <div className="empty-state">
                  <p>No courses with faculty in your last sync. Open the dashboard and refresh your data.</p>
                </div>
              )}
              {enrollments.length > 0 && mineRows.length === 0 && (
                <div className="empty-state">
                  <p>No courses match your search.</p>
                </div>
              )}
              {mineRows.map((row, idx) => (
                <MyCourseCard key={mineRowKey(row, idx)} row={row} directory={row.directory} />
              ))}
            </>
          ) : (
            <>
              {staff.length === 0 && (
                <div className="empty-state">
                  <p>No directory data available in this build.</p>
                </div>
              )}
              {staff.length > 0 && filteredDirectory.length === 0 && (
                <div className="empty-state">
                  <p>No entries match your filters or search.</p>
                </div>
              )}
              {filteredDirectory.map((s, idx) => {
                const isMine = myDirectoryIds.has(s.id);
                const des = (s.designation || '').toUpperCase();
                const hasContact = !!(s.email || s.mobile || s.expertise);
                return (
                  <article key={staffKey(s, idx)} className="faculty-app-card">
                    <div className="faculty-app-card-top">
                      <h2 className="faculty-app-card-name">{s.name}</h2>
                      <RoomStat label="Room no." value={s.room} />
                    </div>
                    <div className="faculty-app-row-tags">
                      {isMine ? <span className="faculty-app-pill faculty-app-pill--mine">My course</span> : null}
                      <span className="faculty-app-pill">{s.department}</span>
                      {s.id ? <span className="faculty-app-pill">{s.id}</span> : null}
                      {des ? <span className="faculty-app-pill">{des}</span> : null}
                    </div>
                    {hasContact ? (
                      <div className="faculty-app-card-contact">
                        {s.email ? (
                          <p className="faculty-app-contact-line">
                            <span className="faculty-app-field-label">Email</span>
                            <a className="faculty-app-link" href={`mailto:${s.email}`}>
                              {s.email}
                            </a>
                          </p>
                        ) : null}
                        {s.mobile ? (
                          <p className="faculty-app-contact-line">
                            <span className="faculty-app-field-label">Mobile</span>
                            <a className="faculty-app-link" href={`tel:${s.mobile.replace(/\s+/g, '')}`}>
                              {s.mobile}
                            </a>
                          </p>
                        ) : null}
                        {s.expertise ? (
                          <p className="faculty-app-expertise">
                            <span className="faculty-app-field-label">Expertise</span>
                            <span className="faculty-app-expertise-text">{s.expertise}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
