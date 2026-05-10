import { useState, useMemo } from 'react';
import resourcesData from '../data/resources.json';
import './SubPages.css';

const Icons = {
  subject: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  external: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  notes: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>,
  pyq: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  syllabus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>,
  videos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  link: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1 1"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1-1"/></svg>,
};

const SECTION_ICONS = {
  ppts: Icons.notes,
  pyqs: Icons.pyq,
  syllabus: Icons.syllabus,
  videos: Icons.videos,
};

export default function ResourcesPage() {
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const semesters = resourcesData;

  const currentSemester = useMemo(
    () => semesters.find((s) => s.semester === selectedSemester) || null,
    [semesters, selectedSemester]
  );

  const filteredSubjects = useMemo(() => {
    if (!currentSemester) return [];
    if (!searchQuery) return currentSemester.subjects;
    const q = searchQuery.toLowerCase();
    return currentSemester.subjects.filter((sub) => sub.name.toLowerCase().includes(q));
  }, [currentSemester, searchQuery]);

  const currentSubject = useMemo(() => {
    if (!currentSemester || !selectedSubject) return null;
    return currentSemester.subjects.find((sub) => sub.name === selectedSubject) || null;
  }, [currentSemester, selectedSubject]);

  const goToSemesters = () => {
    setSelectedSemester(null);
    setSelectedSubject(null);
    setSearchQuery('');
  };

  const goToSubjectList = () => {
    setSelectedSubject(null);
  };

  if (currentSubject) {
    const totalLinks = currentSubject.sections.reduce(
      (acc, sec) => acc + sec.items.length,
      0
    );
    return (
      <div className="apple-page-container resources-page-apple">
        <div className="subpage-header">
          <div className="subpage-title-group">
            <button className="apple-back-btn" onClick={goToSubjectList}>
              {Icons.back} <span>Back to Subjects</span>
            </button>
            <h1 className="subpage-title">{currentSubject.name}</h1>
            <p className="subpage-desc">
              Semester {selectedSemester} · {totalLinks}{' '}
              {totalLinks === 1 ? 'resource' : 'resources'} available
            </p>
          </div>
        </div>

        <div className="resource-sections-list stagger-children">
          {currentSubject.sections.length === 0 && (
            <div className="empty-state">
              <p>No resources available for this subject yet.</p>
            </div>
          )}
          {currentSubject.sections.map((section) => (
            <section key={section.key} className="resource-section">
              <div className="resource-section-header">
                <div className="resource-section-icon">
                  {SECTION_ICONS[section.key] || Icons.notes}
                </div>
                <div className="resource-section-title-group">
                  <h2>{section.label}</h2>
                  <span>
                    {section.items.length}{' '}
                    {section.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
              <div className="resource-link-grid">
                {section.items.map((item, idx) => (
                  <a
                    key={`${item.url}-${idx}`}
                    className="resource-link-card"
                    href={item.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!item.url) e.preventDefault();
                    }}
                  >
                    <span className="resource-link-icon">{Icons.link}</span>
                    <span className="resource-link-title">{item.title}</span>
                    <span className="resource-link-action">{Icons.external}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (currentSemester) {
    return (
      <div className="apple-page-container resources-page-apple">
        <div className="subpage-header">
          <div className="subpage-title-group">
            <button className="apple-back-btn" onClick={goToSemesters}>
              {Icons.back} <span>Back to Semesters</span>
            </button>
            <h1 className="subpage-title">Semester {selectedSemester}</h1>
            <p className="subpage-desc">
              {currentSemester.subjects.length} subjects · select one to view its resources.
            </p>
          </div>
        </div>

        <div className="resources-search-bar">
          <div className="search-input-wrap">
            {Icons.search}
            <input
              type="text"
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="resources-subjects-grid stagger-children">
          {filteredSubjects.map((sub) => {
            const linkCount = sub.sections.reduce((acc, s) => acc + s.items.length, 0);
            return (
              <button
                key={sub.name}
                type="button"
                className="resource-subject-card"
                onClick={() => setSelectedSubject(sub.name)}
              >
                <div className="subject-icon-wrap">{Icons.subject}</div>
                <div className="subject-info">
                  <h3>{sub.name}</h3>
                  <span className="external-hint">
                    {linkCount} {linkCount === 1 ? 'resource' : 'resources'}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredSubjects.length === 0 && (
            <div className="empty-state">
              <p>No subjects found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="apple-page-container resources-page-apple">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Resources</h1>
          <p className="subpage-desc">Notes, PYQs, syllabus and lecture videos for every semester.</p>
        </div>
      </div>

      <div className="semesters-grid-apple stagger-children">
        {semesters.map((sem) => (
          <button
            key={sem.semester}
            type="button"
            className="semester-card-apple"
            onClick={() => setSelectedSemester(sem.semester)}
          >
            <div className="sem-badge">SEM {sem.semester}</div>
            <div className="sem-content">
              <h3>Semester {sem.semester}</h3>
              <p>{sem.subjects.length} Subjects Available</p>
            </div>
            <div className="sem-arrow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
