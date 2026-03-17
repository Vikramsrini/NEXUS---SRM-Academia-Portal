import { useState, useMemo } from 'react';
import resourcesData from '../data/resources.json';
import './SubPages.css';

const Icons = {
  semester: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>,
  subject: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  external: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

export default function ResourcesPage() {
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const semesters = resourcesData;

  const filteredSubjects = useMemo(() => {
    if (!selectedSemester) return [];
    const sem = semesters.find(s => s.semester === selectedSemester);
    if (!sem) return [];
    if (!searchQuery) return sem.subjects;
    return sem.subjects.filter(sub => 
      sub.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [selectedSemester, searchQuery, semesters]);

  if (selectedSemester) {
    return (
      <div className="apple-page-container resources-page-apple">
        <div className="subpage-header">
           <div className="subpage-title-group">
            <button className="apple-back-btn" onClick={() => setSelectedSemester(null)}>
              {Icons.back} <span>Back to Semesters</span>
            </button>
            <h1 className="subpage-title">Semester {selectedSemester}</h1>
            <p className="subpage-desc">Select a subject to view available resources from The Helper.</p>
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
          {filteredSubjects.map((sub, i) => (
            <a 
              key={i} 
              href={sub.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="resource-subject-card"
            >
              <div className="subject-icon-wrap">
                {Icons.subject}
              </div>
              <div className="subject-info">
                <h3>{sub.name}</h3>
                <span className="external-hint">View on The Helper {Icons.external}</span>
              </div>
            </a>
          ))}
          {filteredSubjects.length === 0 && (
            <div className="empty-state">
              <p>No subjects found matching "{searchQuery}"</p>
            </div>
          )}
        </div>

        <div className="resources-footer-note">
          <p>Resources are sourced from <a href="https://thehelpers.vercel.app" target="_blank" rel="noopener noreferrer"><strong>thehelpers.vercel.app</strong></a>, a community-driven initiative for SRMITEs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="apple-page-container resources-page-apple">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Resources</h1>
          <p className="subpage-desc">Academic companion for SRMIST powered by The Helper.</p>
        </div>
      </div>

      <div className="semesters-grid-apple stagger-children">
        {semesters.map((sem) => (
          <div 
            key={sem.semester} 
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
          </div>
        ))}
      </div>

      <div className="resources-footer-note">
        <p>Resources are sourced from <a href="https://thehelpers.vercel.app" target="_blank" rel="noopener noreferrer"><strong>thehelpers.vercel.app</strong></a>, a community-driven initiative for SRMITEs.</p>
      </div>
    </div>
  );
}
