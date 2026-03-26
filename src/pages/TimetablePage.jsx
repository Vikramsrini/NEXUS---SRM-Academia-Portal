import { useMemo, useState, useEffect } from 'react';
import { fetchTimetableState, saveTimetableState } from '../lib/api';
import './SubPages.css';

const Icons = {
  export: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  time: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  room: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  person: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

function normalizeSlot(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('lab') || t.includes('prac') || t.includes('workshop')) return { label: 'Lab', css: 'practical' };
  return { label: 'Theory', css: 'theory' };
}

function downloadTimetableImage(timetable, studentName) {
  const grouped = {};
  timetable.forEach(cls => {
    const key = cls.dayOrder || cls.day;
    if (!grouped[key]) grouped[key] = { dayOrder: cls.dayOrder, day: cls.day, classes: [] };
    grouped[key].classes.push(cls);
  });
  const groups = Object.values(grouped).sort((a, b) => {
    return parseInt(a.dayOrder?.replace('DO', '') || '99') - parseInt(b.dayOrder?.replace('DO', '') || '99');
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const rowH = 40;
  const headerH = 60;
  const dayHeaderH = 38;
  const padding = 32;
  const colWidths = [110, 280, 140, 140, 90];
  const totalW = colWidths.reduce((s, w) => s + w, 0) + padding * 2;

  let totalRows = 0;
  groups.forEach(g => { totalRows += 1 + g.classes.length; });
  const totalH = padding * 2 + headerH + totalRows * rowH + groups.length * 12 + 40;

  canvas.width = totalW * 2;
  canvas.height = totalH * 2;
  ctx.scale(2, 2);

  ctx.fillStyle = '#0a0b10';
  ctx.fillRect(0, 0, totalW, totalH);

  const grad = ctx.createLinearGradient(0, 0, totalW, 0);
  grad.addColorStop(0, 'rgba(10, 132, 255, 0.05)');
  grad.addColorStop(1, 'rgba(10, 132, 255, 0.02)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, totalW, padding + headerH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(`Academia`, padding, padding + 24);

  ctx.fillStyle = '#0a84ff';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText(`${studentName || 'Student Timetable'}`, padding + 115, padding + 22);

  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#86868b';
  ctx.fillText(`Weekly Schedule • Generated ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`, padding, padding + 48);

  let y = padding + headerH + 16;

  groups.forEach(group => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(padding, y, totalW - padding * 2, dayHeaderH, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`${group.dayOrder}`, padding + 16, y + 24);
    
    ctx.fillStyle = '#86868b';
    ctx.font = '500 11px Inter, sans-serif';
    const classCountText = `${group.classes.length} Classes`;
    ctx.fillText(classCountText, totalW - padding - ctx.measureText(classCountText).width - 16, y + 24);
    
    y += dayHeaderH + 8;

    group.classes.forEach((cls, ci) => {
      let x = padding;
      const norm = normalizeSlot(cls.slotType);
      const vals = [cls.time, cls.subject, cls.courseCode, cls.room, norm.label];
      vals.forEach((v, i) => {
        const maxW = colWidths[i] - 24;
        let text = v || '';
        ctx.font = i === 1 ? '600 12px Inter, sans-serif' : '500 12px Inter, sans-serif';
        ctx.fillStyle = i === 1 ? '#ffffff' : '#888888';
        while (ctx.measureText(text).width > maxW && text.length > 3) {
          text = text.slice(0, -2) + '…';
        }
        ctx.fillText(text, x + 12, y + 24);
        x += colWidths[i];
      });
      y += rowH;
    });
    y += 16;
  });

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(studentName || 'timetable').replace(/\s+/g, '_')}_timetable.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export default function TimetablePage() {
  const student = getStudentData();
  const rawTimetable = useMemo(() => student.timetable || [], [student.timetable]);
  
  const [activeDay, setActiveDay] = useState(() => {
    const calendar = student.calendar || [];
    const today = new Date();
    const todayDate = String(today.getDate());
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const todayMonth = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;

    let currentDO = null;
    for (const monthEntry of calendar) {
      if (monthEntry.month === todayMonth) {
        const found = (monthEntry.days || []).find(d => d.date === todayDate);
        if (found?.dayOrder) currentDO = found.dayOrder;
        break;
      }
    }

    if (!currentDO) currentDO = student.currentDayOrder;
    if (currentDO) {
      const normalized = String(currentDO).replace(/\s+/g, '').replace('DO', '').toUpperCase();
      // Ensure the day order actually exists in the timetable
      const exists = rawTimetable.some(cls => (cls.dayOrder || '').replace('DO', '') === normalized);
      if (exists) return normalized;
    }
    return 'all';
  });

  const [isEditing, setIsEditing] = useState(false);
  const [hiddenClasses, setHiddenClasses] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('academia_hidden_classes') || '[]');
    } catch {
      return [];
    }
  });

  const generateClassId = (cls) => {
    return `${cls.courseCode}_${cls.time}_${cls.dayOrder || cls.day}`;
  };

  useEffect(() => {
    const token = localStorage.getItem('academia_token');
    const reg = student.regNumber;
    if (token && reg) {
      fetchTimetableState(reg, token).then(data => {
        if (data && Array.isArray(data.hiddenClasses)) {
           setHiddenClasses(data.hiddenClasses);
           localStorage.setItem('academia_hidden_classes', JSON.stringify(data.hiddenClasses));
        }
      }).catch(err => console.error('Failed to sync timetable state:', err));
    }
  }, [student.regNumber]);

  const toggleClassVisibility = async (cls) => {
    const id = generateClassId(cls);
    const newHidden = hiddenClasses.includes(id)
      ? hiddenClasses.filter(h => h !== id)
      : [...hiddenClasses, id];
    
    setHiddenClasses(newHidden);
    localStorage.setItem('academia_hidden_classes', JSON.stringify(newHidden));

    const token = localStorage.getItem('academia_token');
    const reg = student.regNumber;
    if (token && reg) {
      try {
        await saveTimetableState({ regNumber: reg, token, hiddenClasses: newHidden });
      } catch (err) {
        console.error('Failed to save timetable state to DB:', err);
      }
    }
  };

  const visibleTimetable = useMemo(() => {
    return rawTimetable;
  }, [rawTimetable]);

  const grouped = useMemo(() => {
    const map = {};
    visibleTimetable.forEach(cls => {
      const key = cls.dayOrder || cls.day;
      if (!map[key]) map[key] = { dayOrder: cls.dayOrder, day: cls.day, classes: [] };
      map[key].classes.push(cls);
    });
    const sorted = Object.values(map).sort((a, b) => {
      const an = parseInt(a.dayOrder?.replace('DO', '') || '99');
      const bn = parseInt(b.dayOrder?.replace('DO', '') || '99');
      return an - bn;
    });

    if (activeDay === 'all') return sorted;
    return sorted.filter(g => {
      const num = g.dayOrder?.replace('DO', '');
      return num === activeDay;
    });
  }, [visibleTimetable, activeDay]);

  const dayTabs = useMemo(() => {
    const orders = Array.from(new Set(rawTimetable.map(cls => cls.dayOrder?.replace('DO', '')).filter(Boolean)))
      .sort((a, b) => parseInt(a) - parseInt(b));
    return ['all', ...orders];
  }, [rawTimetable]);

  return (
    <div className="apple-page-container timetable-v2">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <div className="title-with-icon">
             <div className="page-icon-small">{Icons.time}</div>
             <h1 className="subpage-title">Class Schedule</h1>
          </div>
          <p className="subpage-desc">Your weekly course routine organized by day order.</p>
        </div>
        <div className="subpage-actions">
          {rawTimetable.length > 0 && (
            <>
              <button 
                className={`apple-btn-secondary ${isEditing ? 'active' : ''}`} 
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? Icons.check : Icons.settings} {isEditing ? 'Done Editing' : 'Edit Optional Hours'}
              </button>
              {!isEditing && (
                <button className="apple-btn-secondary" onClick={() => downloadTimetableImage(visibleTimetable, student.name)}>
                  {Icons.export} Export Image
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="day-selector-scroller">
        {dayTabs.map(day => (
          <button 
            key={day}
            className={`day-tab ${activeDay === day ? 'active' : ''}`}
            onClick={() => setActiveDay(day)}
          >
            {day === 'all' ? 'All Days' : day}
          </button>
        ))}
      </div>


      {grouped.length > 0 ? (
        <div className="timetable-apple-stack stagger-children">
          {grouped.map((group, i) => (
            <div key={i} className="timetable-day-group">
               <h2 className="day-group-title">
                  {group.dayOrder?.replace('DO', 'Day Order ')}
               </h2>
               
               <div className="classes-grid-v2">
                 {group.classes.map((cls, j) => {
                    const norm = normalizeSlot(cls.slotType);
                    const classId = generateClassId(cls);
                    const isHidden = hiddenClasses.includes(classId);
                    
                    return (
                      <div 
                        key={j} 
                        className={`class-card-v2 ${isEditing ? 'editing' : ''} ${isHidden ? 'optional-class' : ''}`}
                        onClick={() => isEditing && toggleClassVisibility(cls)}
                        style={isEditing ? { position: 'relative' } : {}}
                      >
                        {isEditing && (
                          <div className="edit-toggle-badge">
                          </div>
                        )}
                        <div className="card-main-info">
                           <div className="left-content">
                              <h3 className="course-name">{cls.subject}</h3>
                              <div className="course-meta">
                                 <span className="code">{cls.courseCode.startsWith('21') ? cls.courseCode : `21${cls.courseCode}`}</span>
                                 {cls.faculty && (
                                   <>
                                     <span className="dot">•</span>
                                     <span className="faculty">{cls.faculty}</span>
                                   </>
                                 )}
                              </div>
                              <div className="room-pill">
                                 {Icons.room}
                                 <span>{cls.room || 'N/A'}</span>
                              </div>
                           </div>
                           
                           <div className="right-content">
                              <div className="time-range">{cls.time}</div>
                              <div className="type-meta-row">
                                 <span className={`type-tag-v2 ${norm.css}`}>{norm.label}</span>
                                 {isHidden && <span className="optional-badge">Optional</span>}
                              </div>
                           </div>
                        </div>
                      </div>
                    );
                 })}
               </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3>No records found</h3>
          <p>{hiddenClasses.length > 0 ? 'You have hidden all classes for this day. Click Edit Optional Hours to restore them.' : 'Sync your data to view your personalized schedule.'}</p>
        </div>
      )}
    </div>
  );
}
