import { useState, useEffect, useMemo, useRef } from 'react';
import { apiUrl } from '../lib/api';
import { getStudentData, getToken, updateStoredStudentData } from '../lib/storage';
import './SubPages.css';
import './CalendarPage.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Icons = {
  prev: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>,
  next: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>,
  loading: <div className="apple-spinner"></div>,
  error: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

function parseMonthYear(monthStr) {
  const cleaned = monthStr.replace(/[–—-]/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  let monthName = parts[0];
  let yearPart = parts.find(p => /^\d{4}$/.test(p) || /^'\d{2}$/.test(p) || /^\d{2}$/.test(p));
  
  let year = new Date().getFullYear();
  if (yearPart) {
    if (yearPart.startsWith("'")) {
      year = 2000 + parseInt(yearPart.slice(1));
    } else if (yearPart.length === 2) {
      year = 2000 + parseInt(yearPart);
    } else {
      year = parseInt(yearPart);
    }
  }

  const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(monthName.toLowerCase().slice(0, 3)));
  return {
    monthIdx: monthIdx >= 0 ? monthIdx : 0,
    year,
    label: monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase(),
    fullLabel: `${monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase()} ${year}`
  };
}

export default function CalendarPage() {
  const cachedStudent = getStudentData();
  const hasCachedCalendar = cachedStudent.calendar?.length > 0;

  const [calendarData, setCalendarData] = useState(() => hasCachedCalendar ? cachedStudent.calendar : []);
  const [loading, setLoading] = useState(!hasCachedCalendar);
  const [error, setError] = useState('');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(() => {
    if (!hasCachedCalendar) return 0;
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const idx = cachedStudent.calendar.findIndex(m => {
      const parsed = parseMonthYear(m.month);
      return parsed.monthIdx === curMonth && parsed.year === curYear;
    });
    return idx >= 0 ? idx : 0;
  });
  const [source, setSource] = useState(hasCachedCalendar ? 'cached' : '');
  const pillsRef = useRef(null);

  const currentMonthIdx = useMemo(() => {
    if (!calendarData.length) return -1;
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    return calendarData.findIndex((m) => {
      const parsed = parseMonthYear(m.month);
      return parsed.monthIdx === curMonth && parsed.year === curYear;
    });
  }, [calendarData]);

  function selectCurrentMonth(data) {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const idx = data.findIndex(m => {
      const parsed = parseMonthYear(m.month);
      return parsed.monthIdx === curMonth && parsed.year === curYear;
    });
    setSelectedMonthIdx(idx >= 0 ? idx : 0);
  }

  useEffect(() => {
    const fetchLive = async () => {
      const token = getToken();
      if (!token) {
        if (!hasCachedCalendar) { setError('Not logged in'); setLoading(false); }
        return;
      }
      try {
        const res = await fetch(apiUrl('/calendar'), { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.calendar?.length) {
          // Sort calendar data by date to ensure correct order
          const sortedCalendar = [...data.calendar].sort((a, b) => {
            const pa = parseMonthYear(a.month);
            const pb = parseMonthYear(b.month);
            return (pa.year * 12 + pa.monthIdx) - (pb.year * 12 + pb.monthIdx);
          });
          setCalendarData(sortedCalendar);
          setSource('live');
          selectCurrentMonth(sortedCalendar);
          updateStoredStudentData({ ...getStudentData(), calendar: sortedCalendar });
        }
      } catch {
        if (!hasCachedCalendar) setError('Failed to fetch calendar');
      }
      setLoading(false);
    };
    fetchLive();
  }, [hasCachedCalendar]);

  useEffect(() => {
    if (pillsRef.current) {
      const activePill = pillsRef.current.querySelector('.cal-pill.active');
      if (activePill) activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedMonthIdx]);

  const selectedMonth = calendarData[selectedMonthIdx];
  const parsedMonth = selectedMonth ? parseMonthYear(selectedMonth.month) : null;

  const calendarGrid = useMemo(() => {
    if (!selectedMonth || !parsedMonth) return [];
    const daysInMonth = new Date(parsedMonth.year, parsedMonth.monthIdx + 1, 0).getDate();
    const firstDayOfWeek = new Date(parsedMonth.year, parsedMonth.monthIdx, 1).getDay();
    const dayMap = {};
    selectedMonth.days?.forEach(d => {
      const dateNum = parseInt(d.date);
      if (dateNum) dayMap[dateNum] = d;
    });
    const cells = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push({ blank: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const data = dayMap[d] || {};
      const isToday = d === new Date().getDate() && parsedMonth.monthIdx === new Date().getMonth() && parsedMonth.year === new Date().getFullYear();
      cells.push({
        date: d,
        day: data.day || '',
        event: data.event || '',
        dayOrder: data.dayOrder || '',
        isToday,
        isWeekend: (firstDayOfWeek + d - 1) % 7 === 0 || (firstDayOfWeek + d - 1) % 7 === 6,
      });
    }
    while (cells.length % 7 !== 0) cells.push({ blank: true });
    return cells;
  }, [selectedMonth, parsedMonth]);

  const monthEvents = useMemo(() => {
    if (!selectedMonth) return [];
    const events = [];
    const pm = parseMonthYear(selectedMonth.month);
    selectedMonth.days?.forEach(d => { if (d.event) events.push({ ...d, monthLabel: pm.label }); });
    return events.sort((a, b) => (parseInt(a.date) || 0) - (parseInt(b.date) || 0));
  }, [selectedMonth]);

  const calendarInsights = useMemo(() => {
    if (!selectedMonth || !parsedMonth) return null;

    const workingDays = (selectedMonth.days || []).filter(day => day.dayOrder).length;
    const todayEntry = calendarGrid.find(cell => cell.isToday && !cell.blank);

    return {
      events: monthEvents.length,
      workingDays,
      todayOrder: todayEntry?.dayOrder || 'No day order',
      monthLabel: parsedMonth.fullLabel,
    };
  }, [calendarGrid, monthEvents.length, parsedMonth, selectedMonth]);

  if (loading && calendarData.length === 0) {
    return (
      <div className="cal-loading-apple">
        {Icons.loading}
        <p>Updating calendar...</p>
      </div>
    );
  }

  if (error && calendarData.length === 0) {
    return (
      <div className="cal-error-apple">
        {Icons.error}
        <h3>Connection required</h3>
        <p>Login to synchronize your academic planner.</p>
      </div>
    );
  }

  // Determine if we should show years in pills (if calendar data spans multiple years)
  const showYearsInPills = useMemo(() => {
    if (calendarData.length < 2) return false;
    const firstYear = parseMonthYear(calendarData[0].month).year;
    const lastYear = parseMonthYear(calendarData[calendarData.length - 1].month).year;
    return firstYear !== lastYear;
  }, [calendarData]);

  return (
    <div className="apple-page-container cal-page-apple">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">{parsedMonth ? parsedMonth.fullLabel : 'Calendar'}</h1>
          <p className="subpage-desc">Academic schedule {source === 'live' ? '• Live' : '• Synced'}</p>
        </div>
        
        <div className="cal-nav-apple">
          <button
            className="cal-today-btn"
            onClick={() => {
              if (currentMonthIdx >= 0) setSelectedMonthIdx(currentMonthIdx);
            }}
            disabled={currentMonthIdx === -1}
          >
            Today
          </button>
          <button className="nav-btn" onClick={() => setSelectedMonthIdx(i => Math.max(0, i - 1))} disabled={selectedMonthIdx === 0}>{Icons.prev}</button>
          <div className="cal-pills-wrap" ref={pillsRef}>
            {calendarData.map((m, i) => {
              const pm = parseMonthYear(m.month);
              const pillLabel = showYearsInPills 
                ? `${pm.label.slice(0, 3)} '${String(pm.year).slice(-2)}`
                : pm.label.slice(0, 3);
              return (
                <button key={i} className={`cal-pill ${i === selectedMonthIdx ? 'active' : ''}`} onClick={() => setSelectedMonthIdx(i)}>
                  {pillLabel}
                </button>
              );
            })}
          </div>
          <button className="nav-btn" onClick={() => setSelectedMonthIdx(i => Math.min(calendarData.length - 1, i + 1))} disabled={selectedMonthIdx === calendarData.length - 1}>{Icons.next}</button>
        </div>
      </div>


      <div className="cal-layout-apple">
        <div className="cal-main-card">
          <div className="cal-weekday-row">
            {WEEKDAYS.map((d, idx) => (
              <div key={d} className={`weekday${idx === 0 || idx === 6 ? ' weekend-header' : ''}`}>{d.slice(0, 3)}</div>
            ))}
          </div>
          <div className="cal-grid">
            {calendarGrid.map((cell, i) => (
              <div key={i} className={`cal-day-cell ${cell.blank ? 'blank' : ''} ${cell.isToday ? 'today' : ''} ${cell.isWeekend ? 'weekend' : ''} ${cell.event ? 'has-event' : ''} ${cell.dayOrder ? 'working-day' : ''}`}>
                {!cell.blank && (
                  <>
                    <span className="date-num">{cell.date}</span>
                    {cell.dayOrder && <span className="do-label">{cell.dayOrder}</span>}
                    {cell.event && <div className="event-text">{cell.event}</div>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="cal-events-sidebar">
          <header>
             <h3>{parsedMonth?.label} Events</h3>
          </header>
          {monthEvents.length > 0 ? (
            <div className="events-list">
              {monthEvents.map((ev, i) => (
                <div key={i} className="event-item-apple">
                  <div className="date-badge">
                    <span className="day">{ev.date}</span>
                    <span className="mo">{ev.monthLabel.slice(0, 3)}</span>
                  </div>
                  <div className="info">
                    <h4>{ev.event}</h4>
                    <span className="time">{ev.day} {ev.dayOrder ? `• ${ev.dayOrder}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-events-state">
               <p>No events scheduled for this month.</p>
            </div>
          )}

          <div className="cal-legend-apple">
            <div className="leg-item"><span className="dot today"></span> Today</div>
            <div className="leg-item"><span className="dot event"></span> Holiday</div>
            <div className="leg-item"><span className="dot working"></span> Academic Day</div>
          </div>
        </aside>
        </div>
    </div>
  );
}
