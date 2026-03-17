import { useMemo } from 'react';
import './SubPages.css';

const Icons = {
  export: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  time: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  room: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
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
  const timetable = useMemo(() => student.timetable || [], [student.timetable]);

  const grouped = useMemo(() => {
    const map = {};
    timetable.forEach(cls => {
      const key = cls.dayOrder || cls.day;
      if (!map[key]) map[key] = { dayOrder: cls.dayOrder, day: cls.day, classes: [] };
      map[key].classes.push(cls);
    });
    return Object.values(map).sort((a, b) => {
      const an = parseInt(a.dayOrder?.replace('DO', '') || '99');
      const bn = parseInt(b.dayOrder?.replace('DO', '') || '99');
      return an - bn;
    });
  }, [timetable]);

  const timetableInsights = useMemo(() => {
    if (!timetable.length) return null;

    const labCount = timetable.filter(cls => normalizeSlot(cls.slotType).label === 'Lab').length;

    return {
      classes: timetable.length,
      dayOrders: grouped.length,
      labCount,
    };
  }, [grouped.length, timetable]);

  return (
    <div className="apple-page-container">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">Timetable</h1>
          <p className="subpage-desc">Your weekly class schedule organized by day order.</p>
        </div>
        {timetable.length > 0 && (
          <button className="apple-btn-secondary" onClick={() => downloadTimetableImage(timetable, student.name)}>
            {Icons.export} Export Image
          </button>
        )}
      </div>


      {grouped.length > 0 ? (
        <div className="timetable-apple-stack stagger-children">
          {grouped.map((group, i) => (
            <section key={i} className="timetable-section">
              <header className="section-header">
                 <div className="day-pill">{group.dayOrder}</div>
                 <span className="day-name">{group.day || 'Academic Day'}</span>
                 <span className="count">{group.classes.length} classes</span>
              </header>

              <div className="classes-list">
                {group.classes.map((cls, j) => {
                   const norm = normalizeSlot(cls.slotType);
                   return (
                     <div key={j} className="class-item-apple">
                        <div className="time-badge">
                           {Icons.time}
                           <span>{cls.time}</span>
                        </div>
                        <div className="class-main">
                           <div className="top">
                              <h3>{cls.subject}</h3>
                              <span className={`type-tag ${norm.css}`}>{norm.label}</span>
                           </div>
                           <div className="bottom">
                              <span className="code">{cls.courseCode.startsWith('21') ? cls.courseCode : `21${cls.courseCode}`}</span>
                              <span className="sep">•</span>
                              <div className="room-info">
                                 {Icons.room}
                                 <span>{cls.room || 'N/A'}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                   );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3>Schedule not synced</h3>
          <p>Sign in to view your personalized timetable.</p>
        </div>
      )}
    </div>
  );
}
