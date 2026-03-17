import { useMemo, useState, useEffect } from 'react';
import './SubPages.css';

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

const Icons = {
  attendance: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>,
  marks: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>,
  timetable: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  sparkles: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/></svg>,
};

export default function OverviewPage() {
  const student = getStudentData();
  const [quote, setQuote] = useState({ text: "Quality is not an act, it is a habit.", author: "Aristotle" });
  
  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://zenquotes.io/api/random'));
        const data = await res.json();
        const parsed = JSON.parse(data.contents);
        if (parsed && parsed[0]) {
          setQuote({ text: parsed[0].q, author: parsed[0].a });
        }
      } catch (err) {
        // Fallback to local quotes if API fails
        const fallbacks = [
          { text: "Design is not just what it looks like and feels like. Design is how it works.", author: "Steve Jobs" },
          { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
          { text: "Stay hungry, stay foolish.", author: "Whole Earth Catalog" }
        ];
        setQuote(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
      }
    };
    fetchQuote();
  }, []);
  
  const stats = useMemo(() => {
    const att = student.attendance || [];
    const avgAtt = att.length > 0 
      ? (att.reduce((acc, curr) => {
          const c = parseInt(curr.hoursConducted) || 0;
          const a = parseInt(curr.hoursAbsent) || 0;
          return acc + (c > 0 ? ((c - a) / c) * 100 : 100);
        }, 0) / att.length).toFixed(1)
      : '0';

    return {
      coursesCount: att.length,
      averageAttendance: avgAtt,
      classesToday: 0, 
    };
  }, [student]);

  return (
    <div className="apple-page-container">
      <div className="overview-welcome-section animate-fade-in-down">
         <div className="welcome-content-row">
            <div className="welcome-text">
               <h1>Welcome back, {student.name || 'Student'}</h1>
               <p>Here's what's happening with your studies today.</p>
            </div>
            <div className="welcome-decor">
               {Icons.sparkles}
            </div>
         </div>

         <div className="thought-pill animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <span className="quote-mark">“</span>
            <div className="quote-body">
               <p className="quote-text">{quote.text}</p>
               <cite className="quote-author">— {quote.author}</cite>
            </div>
         </div>
      </div>

      <div className="overview-stats-grid stagger-children" style={{ marginTop: '32px' }}>
         <div className="ov-stat-card">
            <div className="ov-icon">{Icons.attendance}</div>
            <div className="ov-info">
               <span className="lbl">Mean Attendance</span>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <strong className="val">{stats.averageAttendance}</strong>
                  <span className="unit">%</span>
               </div>
            </div>
         </div>

         <div className="ov-stat-card">
            <div className="ov-icon">{Icons.marks}</div>
            <div className="ov-info">
               <span className="lbl">Active Courses</span>
               <strong className="val">{stats.coursesCount}</strong>
            </div>
         </div>

         <div className="ov-stat-card">
            <div className="ov-icon">{Icons.timetable}</div>
            <div className="ov-info">
               <span className="lbl">Classes Today</span>
               <strong className="val">0</strong>
            </div>
         </div>
      </div>

      <div className="overview-main-layout" style={{ marginTop: '32px' }}>
         <div className="ov-quick-actions-card">
            <h3>Quick Actions</h3>
            <div className="actions-grid">
               <button className="action-pill" onClick={() => window.location.hash = '/dashboard/skippro'}>
                  Predict Attendance
               </button>
               <button className="action-pill" onClick={() => window.location.hash = '/dashboard/marks'}>
                  Calculate SGPA
               </button>
               <button className="action-pill" onClick={() => window.location.hash = '/dashboard/calendar'}>
                  View Planner
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
