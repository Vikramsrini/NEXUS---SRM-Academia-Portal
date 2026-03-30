import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../ThemeContext';
import { fetchThoughtOfDay, fetchOdState, saveOdState } from '../lib/api';
import { normalizeCourseCode } from '../lib/slotTypes';
import './Dashboard.css';

/* ── Inline SVG Icons ──────────────────────────────────────────────────── */
const Icons = {
  home: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9" /><path d="M9 22V12h6v10" /><path d="M2 10.6L12 2l10 8.6" /></svg>,
  attendance: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>,
  marks: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></svg>,
  timetable: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>,
  courses: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>,
  calendar: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>,
  skippro: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 19 22 12 13 5 13 19" /><polygon points="2 19 11 12 2 5 2 19" /></svg>,
  logout: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  sync: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" /></svg>,
  mortarboard: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" /></svg>,
  sun: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>,
  moon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>,
  more: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  resources: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /><path d="M12 7h4" /><path d="M12 11h4" /><path d="M12 15h4" /></svg>,
  cgpa: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" /><path d="M8 12h1M12 12h1M16 12h.01" /><path d="M8 16h1M12 16h1M16 16h.01" /></svg>,
  warning: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  instagram: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37a4 4 0 1 1-7.75 1.25 4 4 0 0 1 7.75-1.25z" /><line x1="17.5" y1="6.5" x2="17.5" y2="6.5" /></svg>,
  linkedin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></svg>,
  github: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.67.5.1.66-.22.66-.49 0-.24-.01-1.05-.01-1.91-2.78.62-3.37-1.21-3.37-1.21-.45-1.2-1.11-1.52-1.11-1.52-.91-.64.07-.62.07-.62 1 .08 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.05 0-1.12.39-2.03 1.03-2.74-.1-.26-.45-1.31.1-2.72 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84a9.3 9.3 0 0 1 2.5.35c1.9-1.32 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.71 1.03 1.62 1.03 2.74 0 3.92-2.34 4.79-4.57 5.04.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.17.6.67.49A10.25 10.25 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" /></svg>,
};

const SLOT_TIMES = [
  '08:00 - 08:50', '08:50 - 09:40', '09:45 - 10:35', '10:40 - 11:30', '11:35 - 12:25',
  '12:30 - 01:20', '01:25 - 02:15', '02:20 - 03:10', '03:10 - 04:00', '04:00 - 04:50',
];

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Icons.home, path: '/dashboard' },
  { id: 'timetable', label: 'Timetable', icon: Icons.timetable, path: '/dashboard/timetable' },
  { id: 'attendance', label: 'Attendance', icon: Icons.attendance, path: '/dashboard/attendance' },
  { id: 'marks', label: 'Marks', icon: Icons.marks, path: '/dashboard/marks' },
  { id: 'courses', label: 'Courses', icon: Icons.courses, path: '/dashboard/courses' },
  { id: 'calendar', label: 'Calendar', icon: Icons.calendar, path: '/dashboard/calendar' },
  { id: 'skippro', label: 'Skip Now', icon: Icons.skippro, path: '/dashboard/skippro' },
  { id: 'cgpa', label: 'CGPA', icon: Icons.cgpa, path: '/dashboard/cgpa' },
  { id: 'resources', label: 'Resources', icon: Icons.resources, path: '/dashboard/resources' },
];

const MOBILE_PRIMARY_NAV_IDS = ['home', 'timetable', 'attendance', 'marks'];

function getStudentData() {
  try { return JSON.parse(localStorage.getItem('academia_student') || '{}'); } catch { return {}; }
}

function getInitials(name) {
  return (name || 'S').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getShortDisplayName(name, maxLength = 18) {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Student';
  if (cleaned.length <= maxLength) return cleaned;

  const [first = '', ...rest] = cleaned.split(' ');
  const last = rest[rest.length - 1] || '';
  if (first && last && first.length <= maxLength - 4) {
    return `${first} ${last.charAt(0).toUpperCase()}.`;
  }

  return `${cleaned.slice(0, Math.max(8, maxLength - 1)).trimEnd()}…`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function parseTime(timeStr) {
  const [time] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (hours < 8) hours += 12;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}



function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSlot(type) {
  const t = normalizeText(type);
  if (t.includes('lab') || t.includes('prac') || t.includes('work') || t.includes('practical')) {
    return { label: 'Lab', css: 'practical' };
  }
  return { label: 'Theory', css: 'theory' };
}

function buildCourseTypeKey(courseCode, slotType) {
  const normalizedCode = normalizeCourseCode(courseCode);
  const normalizedType = normalizeSlot(slotType).label.toLowerCase();
  return `${normalizedCode}_${normalizedType}`;
}

function parseMonthYear(monthStr) {
  const cleaned = String(monthStr || '').replace(/[–—-]/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  const monthName = parts[0] || '';
  const year = parts.find(p => /^\d{4}$/.test(p));
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthIdx = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  return {
    monthIdx: monthIdx >= 0 ? monthIdx : 0,
    year: year ? parseInt(year, 10) : new Date().getFullYear(),
  };
}

function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function Dashboard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileNavPulseId, setMobileNavPulseId] = useState('');
  const mobileNavAnimationRef = useRef(null);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [thoughtOfDay, setThoughtOfDay] = useState(null);
  const [thoughtLoading, setThoughtLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const [student, setStudent] = useState(getStudentData);
  const displayName = student.name || 'User';

  useEffect(() => {
    if (!student.name && !syncing) {
      setSyncError(true);
    }
  }, [student.name, student.regNumber, syncing]);
  const compactDisplayName = getShortDisplayName(displayName, 18);
  const compactWelcomeName = getShortDisplayName(displayName, 24);
  const activePath = location.pathname === '/dashboard/' ? '/dashboard' : location.pathname;
  const isOverview = activePath === '/dashboard';
  const currentTab = NAV_ITEMS.find(item => item.path === activePath) || { label: 'Dashboard' };

  const timetableMapping = useMemo(() => {
    const map = {};
    (student.timetable || []).forEach((cls) => {
      const code = normalizeCourseCode(cls.courseCode);
      if (!map[code]) map[code] = new Set();
      map[code].add(cls.slotType);
    });
    return map;
  }, [student.timetable]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [profileOpen]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dailyRefreshTimeout;
    let dailyRefreshInterval;

    const loadThought = async () => {
      setThoughtLoading(true);
      try {
        const result = await fetchThoughtOfDay();
        if (cancelled) return;
        setThoughtOfDay({
          thought: result.thought || '',
        });
      } catch {
        if (cancelled) return;
        setThoughtOfDay(null);
      } finally {
        if (!cancelled) setThoughtLoading(false);
      }
    };

    const scheduleDailyRefreshAtMidnight = () => {
      const now = new Date();
      const nextRefresh = new Date(now);
      nextRefresh.setHours(0, 0, 0, 0);
      if (nextRefresh <= now) {
        nextRefresh.setDate(nextRefresh.getDate() + 1);
      }
      const delay = Math.max(1000, nextRefresh.getTime() - now.getTime());

      dailyRefreshTimeout = setTimeout(() => {
        loadThought();
        dailyRefreshInterval = setInterval(loadThought, 24 * 60 * 60 * 1000);
      }, delay);
    };

    window.__loadThought = loadThought;

    loadThought();
    scheduleDailyRefreshAtMidnight();

    return () => {
      cancelled = true;
      if (dailyRefreshTimeout) clearTimeout(dailyRefreshTimeout);
      if (dailyRefreshInterval) clearInterval(dailyRefreshInterval);
    };
  }, []);

  const handleSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    const token = localStorage.getItem('academia_token');
    const netid = localStorage.getItem('academia_netid');
    const pwd = localStorage.getItem('academia_password') ? atob(localStorage.getItem('academia_password')) : null;

    if (!token) {
      setSyncError(true);
      setSyncing(false);
      syncingRef.current = false;
      return;
    }

    try {
      const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

      // Try Fast Sync first
      const res = await fetch(`${API_BASE}/auth/sync-fast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok && netid && pwd) {
        // Fallback to full re-auth sync if fast sync fails
        const fullRes = await fetch(`${API_BASE}/auth/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: netid, password: pwd }),
        });
        if (!fullRes.ok) throw new Error('Refresh failed');
        const fullData = await fullRes.json();
        localStorage.setItem('academia_token', fullData.token);
        localStorage.setItem('academia_student', JSON.stringify(fullData.student_data));
      } else if (res.ok) {
        const data = await res.json();
        localStorage.setItem('academia_student', JSON.stringify(data.student_data));
      } else {
        throw new Error('Session expired');
      }

      localStorage.setItem('academia_login_time', new Date().toISOString());

      // Update local state to trigger reactive updates in all components 
      const updatedStudent = getStudentData();
      setStudent(updatedStudent);

      // Refresh thought of the day too
      if (typeof window.__loadThought === 'function') {
        window.__loadThought().catch(() => { });
      }
    } catch (err) {
      console.error('Refresh error:', err);
      setSyncError(true);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, []); // Stable callback

  // ── Automatic Sync (On Load & Periodic) ───────────────────────────
  useEffect(() => {
    // 1. Sync immediately on mount (covers initial load and browser refresh)
    console.log('[Auto Sync] Dashboard mounted. Triggering data sync...');
    handleSync();

    // 2. Periodic heartbeat sync (every 40 minutes as requested)
    const autoSyncInterval = setInterval(() => {
      console.log('[Auto Sync] 40-minute heartbeat triggered.');
      handleSync();
    }, 40 * 60 * 1000);

    return () => clearInterval(autoSyncInterval);
  }, [handleSync]);

  useEffect(() => {
    setProfileOpen(false);
    setMobileMoreOpen(false);
  }, [activePath, isMobile]);

  // ── Body Scroll Lock & Immersion Manager ─────────────────────────
  useEffect(() => {
    const shouldLock = isMobile && (profileOpen || mobileMoreOpen);
    document.body.classList.toggle('mobile-sheet-open', shouldLock);

    // When unlocking (closing panels), re-trigger immersion immediately
    if (isMobile && !shouldLock) {
      window.scrollTo(0, 1);
      const t = setTimeout(() => window.scrollTo(0, 1), 100);
      return () => clearTimeout(t);
    }

    return () => document.body.classList.remove('mobile-sheet-open');
  }, [isMobile, profileOpen, mobileMoreOpen]);

  // ── Tab Navigation Reset ──────────────────────────────────────────
  useLayoutEffect(() => {
    // We use useLayoutEffect to ensure the scroll reset happens BEFORE the browser paints,
    // avoiding the unpleasant visual of the page jumping or scrolling to the top.
    const el = mainContentRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }

    if (isMobile) {
      // Hide browser bars for immersive feel
      setTimeout(() => window.scrollTo(0, 1), 50);
    } else {
      window.scrollTo(0, 0);
    }
  }, [activePath, isMobile]);

  const handleLogout = () => {
    const theme = localStorage.getItem('academia_theme');
    const updateDismissed = localStorage.getItem('academia_update_v1_dismissed');
    localStorage.clear();
    if (theme) localStorage.setItem('academia_theme', theme);
    if (updateDismissed) localStorage.setItem('academia_update_v1_dismissed', updateDismissed);
    navigate('/');
  };


  const closeMobilePanels = () => {
    setMobileMoreOpen(false);
    setProfileOpen(false);
  };

  const triggerMobileNavPulse = (id) => {
    if (!id) return;
    window.clearTimeout(mobileNavAnimationRef.current);
    setMobileNavPulseId(id);
    mobileNavAnimationRef.current = window.setTimeout(() => {
      setMobileNavPulseId('');
    }, 460);
  };

  useEffect(() => {
    return () => {
      window.clearTimeout(mobileNavAnimationRef.current);
    };
  }, []);

  const handleNavClick = (path, navId = '') => {
    if (isMobile && navId) triggerMobileNavPulse(navId);
    navigate(path);
    if (isMobile) closeMobilePanels();
  };

  const getCurrentDayOrder = () => {
    const normalize = (raw) => {
      if (!raw) return null;
      const s = raw.replace(/\s+/g, '');
      return /^\d+$/.test(s) ? `DO${s}` : s.toUpperCase();
    };

    const calendar = student.calendar || [];
    const today = new Date();
    const todayDate = String(today.getDate());
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const todayMonth = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;

    for (const monthEntry of calendar) {
      if (monthEntry.month === todayMonth) {
        for (const day of (monthEntry.days || [])) {
          if (day.date === todayDate && day.dayOrder) {
            return normalize(day.dayOrder);
          }
        }
        break;
      }
    }

    return normalize(student.currentDayOrder);
  };

  const currentDayOrder = getCurrentDayOrder();
  const timetable = student.timetable || [];
  const marks = student.marks || [];

  const getTodaySchedule = () => {
    if (!timetable.length || !currentDayOrder) return [];

    let hidden = [];
    try { hidden = JSON.parse(localStorage.getItem('academia_hidden_classes') || '[]'); } catch { hidden = []; }

    const expanded = [];
    timetable
      .filter(item => item.dayOrder.replace(/\s+/g, '').toUpperCase() === currentDayOrder.toUpperCase())
      .forEach(item => {
        const id = `${item.courseCode}_${item.time}_${item.dayOrder || item.day}`;
        const isOptional = hidden.includes(id);
        expanded.push({ ...item, isOptional, hourIndex: 0, isSplit: false });
      });

    return expanded;
  };

  const todaySchedule = getTodaySchedule();


  const sortedSchedule = [...todaySchedule].sort((a, b) =>
    parseTime(a.time.split(' - ')[0]) - parseTime(b.time.split(' - ')[0])
  );
  const activeClasses = todaySchedule.filter(i => !i.isOptional);

  const resolveAttendanceType = (a) => {
    const code = normalizeCourseCode(a.courseCode);
    const types = timetableMapping[code];
    if (types) {
      if (types.size === 1) return Array.from(types)[0];
      const s = String(a.slot || '').toUpperCase();
      if (s.includes('P') || s.includes('L')) return 'Practical';
      return 'Theory';
    }
    return a.slotType || 'Theory';
  };

  const todayLowAttendanceSubjects = (() => {
    const LOW_ATTENDANCE_THRESHOLD = 75;
    const odDates = getStoredJson('academia_od_dates', []);
    const manualAdjs = getStoredJson('academia_attendance_adjs', {});

    const odDayOrders = (() => {
      const calendar = student.calendar || [];
      const tallies = {};
      const parsedOdDates = odDates.map((d) => {
        const [y, m, day] = String(d).split('-').map(Number);
        return { year: y, monthIdx: m - 1, date: day };
      });

      calendar.forEach((calMonth) => {
        const pm = parseMonthYear(calMonth.month);
        (calMonth.days || []).forEach((d) => {
          if (!d.dayOrder) return;
          const dateNum = parseInt(d.date, 10);
          if (!dateNum) return;
          const isOdDate = parsedOdDates.some((od) =>
            od.year === pm.year && od.monthIdx === pm.monthIdx && od.date === dateNum
          );
          if (!isOdDate) return;

          let order = d.dayOrder;
          if (!order.startsWith('DO') && /^\d+$/.test(order)) {
            order = `DO${order}`;
          }
          tallies[order] = (tallies[order] || 0) + 1;
        });
      });

      return tallies;
    })();

    const getOdBonus = (courseCode, slotType) => {
      const normalizedCode = normalizeCourseCode(courseCode);
      const normalizedType = normalizeSlot(slotType).label;
      let sum = 0;

      timetable.forEach((cls) => {
        if (normalizeCourseCode(cls.courseCode) !== normalizedCode) return;
        if (normalizeSlot(cls.slotType).label !== normalizedType) return;

        let order = cls.dayOrder;
        if (!order) return;
        if (!order.startsWith('DO') && /^\d+$/.test(order)) {
          order = `DO${order}`;
        }
        sum += (odDayOrders[order] || 0) * (cls.hours || 1);
      });

      return sum;
    };

    const attendanceRows = (student.attendance || []).filter(a => {
      const title = normalizeText(a.courseTitle);
      if (!title || title.length <= 2) return false;

      const conducted = parseInt(a.hoursConducted);
      if (isNaN(conducted) || conducted <= 0) return false;

      if (['theory', 'practical', 'lab', 'clinical'].includes(title)) return false;
      if (title.startsWith('ft-') || title.includes('total')) return false;
      if (title.includes('llj-') || title.startsWith('ct-') || title.startsWith('cat-')) return false;

      return true;
    });

    const lowRows = attendanceRows
      .map(a => {
        const type = resolveAttendanceType(a);
        const courseKey = buildCourseTypeKey(a.courseCode, type);
        const safeOdAdj = parseInt((manualAdjs[courseKey] || {}).odAdj, 10) || 0;
        const conducted = parseInt(a.hoursConducted) || 0;
        const originalAbsent = parseInt(a.hoursAbsent) || 0;
        const odBonus = getOdBonus(a.courseCode, type);
        const finalAppliedOd = Math.min(
          Math.max(0, Math.min(odBonus, originalAbsent) + safeOdAdj),
          originalAbsent
        );
        const absent = Math.max(0, originalAbsent - finalAppliedOd);
        const percentage = conducted > 0 ? ((conducted - absent) / conducted) * 100 : 100;
        return {
          title: a.courseTitle || a.subject || a.courseCode,
          code: a.courseCode || '',
          type,
          percentage,
        };
      })
      .filter(a => a.percentage < LOW_ATTENDANCE_THRESHOLD);

    const matches = lowRows.filter((a) => {
      const lowCode = normalizeCourseCode(a.code);
      const lowTitle = normalizeText(a.title);
      const lowType = normalizeSlot(a.type).label;
      return todaySchedule.some((cls) => {
        const clsCode = normalizeCourseCode(cls.courseCode);
        const clsSubject = normalizeText(cls.subject);
        const clsType = normalizeSlot(cls.slotType).label;
        const codeMatch = !!lowCode && !!clsCode && lowCode === clsCode;
        const titleMatch = !!lowTitle && !!clsSubject && (lowTitle.includes(clsSubject) || clsSubject.includes(lowTitle));
        const typeMatch = lowType === clsType;

        // Skip if this specific class instance has already ended
        const endTime = parseTime(cls.time.split(' - ')[1]);
        if (currentTime > endTime) return false;

        return typeMatch && (codeMatch || titleMatch);
      });
    });

    return Array.from(
      new Map(matches.map(item => [`${normalizeCourseCode(item.code)}_${normalizeText(item.title)}_${normalizeSlot(item.type).label}`, item])).values()
    );
  })();

  const overallMarks = (() => {
    if (!marks.length) return '—';
    let totalObtained = 0;
    let totalMax = 0;
    marks.forEach(m => {
      const obtained = parseFloat(m.total?.obtained) || 0;
      const max = parseFloat(m.total?.maxMark) || 0;
      if (max > 0) {
        totalObtained += obtained;
        totalMax += max;
      }
    });
    return totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '—';
  })();

  const todaySkipSummary = (() => {
    if (!todaySchedule.length) return { canSkipCount: 0, total: 0 };
    const odDates = getStoredJson('academia_od_dates', []);
    const manualAdjs = getStoredJson('academia_attendance_adjs', {});

    // Minimal simplified Skip logic for Home page
    const results = activeClasses.map(cls => {
      const clsCode = normalizeCourseCode(cls.courseCode);
      const clsType = normalizeSlot(cls.slotType).label;

      const attRow = (student.attendance || []).find(a => {
        if (normalizeCourseCode(a.courseCode) !== clsCode) return false;
        // Verify type matches (Theory vs Lab) to avoid mapping to wrong attendance row
        return normalizeSlot(resolveAttendanceType(a)).label === clsType;
      });

      if (!attRow) return false;

      const conducted = parseInt(attRow.hoursConducted) || 0;
      const originalAbsent = parseInt(attRow.hoursAbsent) || 0;

      // Calculate effective percentage for better skip prediction
      const pct = conducted > 0 ? ((conducted - originalAbsent) / conducted) * 100 : 100;
      return pct > 75.5;
    });

    return {
      canSkipCount: results.filter(Boolean).length,
      total: sortedSchedule.length,
      classesLeft: sortedSchedule.filter(cls => parseTime(cls.time.split(' - ')[0]) > currentTime).length
    };
  })();

  const averageAttendance = (() => {
    const rawAtt = student.attendance || [];
    const att = rawAtt.filter(a => {
      const title = (a.courseTitle || '').trim().toLowerCase();
      if (!title || title.length <= 2) return false;
      const conducted = parseInt(a.hoursConducted);
      if (isNaN(conducted) || conducted <= 0) return false;
      if (['theory', 'practical', 'lab', 'clinical'].includes(title)) return false;
      if (title.startsWith('ft-') || title.includes('total')) return false;
      if (title.includes('llj-') || title.startsWith('ct-') || title.startsWith('cat-')) return false;
      return true;
    });

    if (!att.length) return '—';
    return (att.reduce((acc, curr) => {
      const conducted = parseInt(curr.hoursConducted) || 0;
      const absent = parseInt(curr.hoursAbsent) || 0;
      return acc + (conducted > 0 ? ((conducted - absent) / conducted) * 100 : 100);
    }, 0) / att.length).toFixed(1);
  })();

  const getCurrentClassInfo = () => {
    if (!todaySchedule.length) return null;

    for (const item of todaySchedule) {
      if (item.isOptional) continue;

      const [startStr, endStr] = item.time.split(' - ');
      const start = parseTime(startStr);
      const end = parseTime(endStr);

      if (currentTime >= start && currentTime <= end) {
        const total = end.getTime() - start.getTime();
        const elapsed = currentTime.getTime() - start.getTime();
        const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
        const minsRemaining = Math.max(1, Math.round((end.getTime() - currentTime.getTime()) / 60000));
        return { ...item, progress, minsRemaining };
      }
    }

    return null;
  };

  const currentClass = getCurrentClassInfo();

  const nextClass = (() => {
    for (const item of sortedSchedule) {
      if (item.isOptional) continue;
      const start = parseTime(item.time.split(' - ')[0]);
      if (start > currentTime) return item;
    }
    return null;
  })();

  const mobilePrimaryNav = NAV_ITEMS.filter(item => MOBILE_PRIMARY_NAV_IDS.includes(item.id));
  const mobileSecondaryNav = NAV_ITEMS.filter(item => !MOBILE_PRIMARY_NAV_IDS.includes(item.id));
  const mobileMoreActive = mobileSecondaryNav.some(item => item.path === activePath);
  const mobileSheetOpen = isMobile && (profileOpen || mobileMoreOpen);

  const mobileHeaderMeta = isOverview
    ? (currentDayOrder ? `${currentDayOrder} • ${activeClasses.length} class${activeClasses.length !== 1 ? 'es' : ''} today` : 'No classes scheduled today')
    : (student.regNumber || 'Student workspace');

  const renderProfileCard = () => (
    <div
      className={`profile-dropdown-card ${isMobile && profileOpen ? 'show' : ''}`}
      onClick={(e) => e.stopPropagation()}
      style={(!isMobile && !profileOpen) ? { display: 'none' } : {}}
    >
      <div className="dropdown-user-info">
        <div className="user-avatar-large">{getInitials(student.name)}</div>
        <h3>{student.name}</h3>
        <p className="dropdown-reg">{student.regNumber}</p>
      </div>
      <div className="dropdown-divider" />
      <div className="dropdown-details">
        {student.department && (
          <div className="dropdown-detail-row">
            <span className="dropdown-detail-label">Department</span>
            <span className="dropdown-detail-value">{student.department}</span>
          </div>
        )}
        {student.program && (
          <div className="dropdown-detail-row">
            <span className="dropdown-detail-label">Program</span>
            <span className="dropdown-detail-value">{student.program}</span>
          </div>
        )}
        {student.batch && (
          <div className="dropdown-detail-row">
            <span className="dropdown-detail-label">Batch</span>
            <span className="dropdown-detail-value">{student.batch}</span>
          </div>
        )}
        {student.section && (
          <div className="dropdown-detail-row">
            <span className="dropdown-detail-label">Section</span>
            <span className="dropdown-detail-value">{student.section}</span>
          </div>
        )}
        {student.semester && (
          <div className="dropdown-detail-row">
            <span className="dropdown-detail-label">Semester</span>
            <span className="dropdown-detail-value">{student.semester}</span>
          </div>
        )}
      </div>
      <div className="dropdown-divider" />
      <button className="logout-button" onClick={handleLogout}>
        {Icons.logout} Sign Out
      </button>
    </div>
  );

  const renderTopBarActions = () => (
    <div className="top-bar-actions">
      <button className="action-btn theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'dark' ? Icons.sun : Icons.moon}
      </button>
      <button className={`action-btn ${syncing ? 'spinning' : ''}`} onClick={handleSync} aria-label="Sync data">
        {Icons.sync}
      </button>
      <div
        className="user-profile-pill"
        onClick={(e) => {
          e.stopPropagation();
          if (isMobile) setMobileMoreOpen(false);
          setProfileOpen(!profileOpen);
        }}
      >
        <span className="user-name">{displayName}</span>
        <div className="user-avatar">{getInitials(student.name)}</div>
      </div>
      {!isMobile && renderProfileCard()}
    </div>
  );
  const renderSessionModal = () => (
    <div className="apple-modal-overlay show">
      <div className="apple-modal-card compact">
        <header className="apple-modal-header">
          <div className="warning-icon-wrap" style={{ background: 'var(--badge-red-bg)', color: 'var(--badge-red-text)', marginBottom: '16px' }}>
            {Icons.warning}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '8px' }}>NEXUS Security</h2>
        </header>
        <div className="apple-modal-body" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <p className="primary-text" style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Your authentication session has timed out.</p>
          <p className="secondary-text" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>To protect your academic data, please sign in again to re-sync with SRM Academia.</p>
        </div>
        <footer className="apple-modal-footer">
          <button className="apple-btn primary full-width" onClick={handleLogout} style={{ padding: '14px' }}>Sign In Again</button>
        </footer>
      </div>
    </div>
  );



  const renderDeveloperInfo = (variant = '') => (
    <div className={`dev-footer ${variant}`}>
      <span className="dev-text">Developed by Vikram</span>
      <div className="dev-links">
        <a href="https://www.instagram.com/_vikram_srini_" target="_blank" rel="noreferrer" className="dev-link">{Icons.instagram}</a>
        <a href="https://www.linkedin.com/in/vikram-srinivas-60a75b204" target="_blank" rel="noreferrer" className="dev-link">{Icons.linkedin}</a>
        <a href="https://github.com/Vikramsrini" target="_blank" rel="noreferrer" className="dev-link">{Icons.github}</a>
      </div>
    </div>
  );

  return (
    <div className={`dashboard-layout ${!isMobile && !sidebarOpen ? 'sidebar-collapsed' : ''} ${isMobile ? 'mobile-layout' : ''}`}>
      {syncError && createPortal(renderSessionModal(), document.body)}
      <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
      {isMobile && <div className={`mobile-sheet-overlay ${mobileSheetOpen ? 'show' : ''}`} onClick={closeMobilePanels} />}

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">{Icons.mortarboard}</div>
          <div className="sidebar-brand"><h2>NEXUS</h2></div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <div
              key={item.id}
              className={`sidebar-item ${activePath === item.path ? 'active' : ''} ${mobileNavPulseId === item.id ? 'tap-burst' : ''}`}
              onClick={() => handleNavClick(item.path, item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
            </div>
          ))}
        </nav>

        {renderDeveloperInfo('sidebar-mode')}
      </aside>

      <main className="main-content" ref={mainContentRef}>
        <header className={`top-bar-container ${!isOverview && !isMobile ? 'compact' : ''} ${isMobile ? 'mobile-top-bar' : ''}`}>
          {isMobile ? (
            <div className="mobile-top-shell">
              <div className="mobile-brand-block">
                <div className="mobile-brand-logo">
                  {Icons.mortarboard}
                </div>
                <div className="mobile-brand-copy">
                  <span className="mobile-brand-title" title={displayName}>NEXUS</span>
                </div>
              </div>
              {renderTopBarActions()}
            </div>
          ) : (
            <>
              {isOverview && (
                <div className="greeting-section">
                  <span className="greeting-text">{getGreeting()}</span>
                  <h1 className="date-text">{formatDate()}</h1>
                </div>
              )}
              {renderTopBarActions()}
            </>
          )}
        </header>

        <div className="content-viewport animate-fade-in">
          {isOverview ? (
            <div className="overview-hero animate-fade-in-up">
              <div className="ov-welcome">
                <h2 title={displayName}>Welcome, {compactWelcomeName}!</h2>
                <p className="ov-welcome-date">{formatDate()}</p>
              </div>

              <section className="tod-section" aria-live="polite">
                <div className="tod-header-row">
                  <h3>Quote of the Day</h3>
                </div>
                {thoughtLoading ? (
                  <p className="tod-loading">Loading today&apos;s thought...</p>
                ) : thoughtOfDay?.thought ? (
                  <>
                    <p className="tod-quote">{thoughtOfDay.thought}</p>
                  </>
                ) : (
                  <p className="tod-fallback">Could not load today&apos;s thought right now.</p>
                )}
              </section>

              <div className="home-alerts-row">
                <div className="home-alert-pill skip-pill" onClick={() => navigate('/dashboard/skippro')}>
                  <div className="alert-pill-icon">{Icons.skippro}</div>
                  <div className="alert-pill-content">
                    <span className="alert-pill-label">Safe to Skip</span>
                    <span className="alert-pill-value">{todaySkipSummary.canSkipCount > 0 ? `${todaySkipSummary.canSkipCount} Classes` : 'None today'}</span>
                  </div>
                </div>

                <div className="home-alert-pill marks-pill" onClick={() => navigate('/dashboard/marks')}>
                  <div className="alert-pill-icon">{Icons.marks}</div>
                  <div className="alert-pill-content">
                    <span className="alert-pill-label">Performance</span>
                    <span className="alert-pill-value">Review Internals</span>
                  </div>
                </div>
              </div>

              <div className="today-schedule-section">
                <div className="section-header">
                  <div>
                    <h3>Today's Schedule</h3>
                    {currentDayOrder && (
                      <p className="section-subhead">{currentDayOrder} • {activeClasses.length} class{activeClasses.length !== 1 ? 'es' : ''} scheduled</p>
                    )}
                  </div>
                  {currentDayOrder && <span className="day-order-badge">{currentDayOrder}</span>}
                </div>

                {todayLowAttendanceSubjects.length > 0 && (
                  <section className="home-attendance-alert" aria-live="polite">
                    <div className="home-attendance-alert-header">
                      <span className="home-attendance-alert-icon">{Icons.warning}</span>
                      <div>
                        <h4>Low Attendance Alert</h4>
                        <p>
                          {todayLowAttendanceSubjects.length === 1
                            ? 'You have a low-attendance subject today. You should attend this class.'
                            : 'You have low-attendance subjects today. You should attend these classes.'}
                        </p>
                      </div>
                    </div>
                    <div className="home-attendance-alert-list">
                      {todayLowAttendanceSubjects.map((item, idx) => (
                        <span key={`${item.code}_${idx}`} className="home-attendance-alert-chip">
                          {item.title} • {item.percentage.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {todaySchedule.length > 0 ? (
                  <>
                    {(currentClass || nextClass) && (
                      <div className="now-row">
                        {currentClass && (
                          <div className="now-card now-current">
                            <div className="now-card-top">
                              <span className="now-pill now-pill-current">Now</span>
                              <span className="now-mins-left">{currentClass.minsRemaining} min remaining</span>
                            </div>
                            <div className="now-subject">
                              {currentClass.subject}
                            </div>
                            <div className="now-meta">{currentClass.courseCode} • {currentClass.room}</div>
                            <div className="now-time-str">{currentClass.time}</div>
                            <div className="now-progress-track">
                              <div className="now-progress-fill" style={{ width: `${currentClass.progress}%` }} />
                            </div>
                          </div>
                        )}
                        {nextClass && (
                          <div className="now-card now-next">
                            <div className="now-card-top">
                              <span className="now-pill now-pill-next">Next</span>
                            </div>
                            <div className="now-subject">
                              {nextClass.subject}
                            </div>
                            <div className="now-meta">{nextClass.courseCode} • {nextClass.room}</div>
                            <div className="now-time-str">{nextClass.time}</div>
                          </div>
                        )}

                      </div>
                    )}

                    <div className="full-day-sched">
                      <h4>Full Day Schedule</h4>
                      {sortedSchedule.map((item, idx) => {
                        const isActive = currentClass && currentClass.courseCode === item.courseCode && currentClass.time === item.time;
                        const endTime = parseTime(item.time.split(' - ')[1]);
                        const isOver = currentTime > endTime;

                        return (
                          <div key={idx} className={`sched-row ${isActive ? 'sched-row-active' : ''}`} style={item.isOptional ? { opacity: 0.5 } : {}}>
                            <div className="sched-time" style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '70px' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.time.split(' - ')[0]}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{item.time.split(' - ')[1]}</span>
                            </div>
                            <div className="sched-info">
                              <span className="sched-name" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {item.subject}
                                {item.isOptional && <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--surface-tertiary)', borderRadius: '6px', color: 'var(--text-secondary)' }}>Optional</span>}
                              </span>
                              <span className="sched-code">{item.courseCode.startsWith('21') ? item.courseCode : `21${item.courseCode}`} • {item.room}</span>
                            </div>
                            <span className="sched-type">{item.slotType}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="schedule-empty-state">
                    <p>{currentDayOrder ? `No classes scheduled for ${currentDayOrder}.` : 'No classes today — enjoy your day off!'}</p>
                  </div>
                )}
              </div>
              {isMobile && renderDeveloperInfo('mobile-home-mode')}
            </div>
          ) : (
            <div key={student.timestamp || 'root'} className="subpage-viewport">
              {children}
            </div>
          )}
        </div>
      </main>

      {isMobile && (
        <>
          <div className={`mobile-more-sheet ${mobileMoreOpen ? 'show' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-head">
              <div>
                <span className="mobile-sheet-kicker">Explore</span>
                <h2>More tools</h2>
              </div>
              <button className="action-btn mobile-sheet-close" onClick={() => setMobileMoreOpen(false)} aria-label="Close more menu">
                {Icons.close}
              </button>
            </div>

            <div className="mobile-more-grid">
              {mobileSecondaryNav.map(item => (
                <button
                  key={item.id}
                  className={`mobile-more-card ${activePath === item.path ? 'active' : ''} ${mobileNavPulseId === item.id ? 'tap-burst' : ''}`}
                  onClick={() => handleNavClick(item.path, item.id)}
                >
                  <span className="mobile-more-card-icon">{item.icon}</span>
                  <div className="mobile-more-card-content">
                    <span className="mobile-more-card-title">{item.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {renderProfileCard()}
          <nav className="mobile-tabbar" aria-label="Mobile navigation">
            {mobilePrimaryNav.map(item => (
              <button
                key={item.id}
                className={`mobile-tabbar-item ${activePath === item.path && !mobileMoreOpen ? 'active' : ''} ${mobileNavPulseId === item.id ? 'tap-burst' : ''}`}
                onClick={() => handleNavClick(item.path, item.id)}
              >
                <span className="mobile-tabbar-icon">{item.icon}</span>
                <span className="mobile-tabbar-label">{item.label}</span>
              </button>
            ))}
            <button
              className={`mobile-tabbar-item ${mobileMoreActive || mobileMoreOpen ? 'active' : ''} ${mobileNavPulseId === 'more' ? 'tap-burst' : ''}`}
              onClick={() => {
                triggerMobileNavPulse('more');
                setProfileOpen(false);
                setMobileMoreOpen(!mobileMoreOpen);
              }}
            >
              <span className="mobile-tabbar-icon">{Icons.more}</span>
              <span className="mobile-tabbar-label">More</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
