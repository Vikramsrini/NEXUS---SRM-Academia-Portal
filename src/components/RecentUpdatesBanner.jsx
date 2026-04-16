import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../lib/api';
import './RecentUpdatesBanner.css';

function looksLikeCourseCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  // Match server-side validation: 2+ letters, 1 digit, then 0+ alphanumeric/hyphens
  // Allow optional 2-digit prefix (e.g., "21CSE202J" -> "CSE202J")
  const withoutPrefix = code.replace(/^\d{2}/, '');
  return /^[A-Z]{2,}\d[A-Z0-9-]*$/.test(withoutPrefix);
}

export default function RecentUpdatesBanner({ regNumber, type, variant = 'subpage', refreshTrigger }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const isDashboard = variant === 'dashboard';

  useEffect(() => {
    if (!regNumber || !type) {
      setUpdates([]);
      setLoading(false);
      setError('');
      return;
    }

    let aborted = false;

    async function fetchUpdates() {
      const currentToken = localStorage.getItem('academia_token') || '';
      if (!currentToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const cleanReg = String(regNumber).trim().toUpperCase();
        // 7-day window for better visibility of weekly updates
        const days = '7';
        const params = new URLSearchParams({ regNumber: cleanReg, days });
        const res = await fetch(apiUrl(`/recent-updates?${params.toString()}`), {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.warn('[RecentUpdatesBanner] Fetch failed:', res.status, errData);
          throw new Error('Failed to fetch updates');
        }

        const data = await res.json();
        if (aborted) return;

        console.log('[RecentUpdatesBanner] Raw data:', { type, attendanceCount: data.attendanceUpdates?.length, marksCount: data.marksUpdates?.length });

        if (type === 'attendance') {
          setUpdates(Array.isArray(data.attendanceUpdates) ? data.attendanceUpdates : []);
        } else if (type === 'marks') {
          setUpdates(Array.isArray(data.marksUpdates) ? data.marksUpdates : []);
        } else {
          setUpdates([]);
        }
      } catch (error) {
        if (!aborted) {
          console.error('[RecentUpdatesBanner] Error:', error);
          setUpdates([]);
          setError('Could not load recent updates right now.');
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    fetchUpdates();
    return () => {
      aborted = true;
    };
  }, [regNumber, type, isDashboard, refreshTrigger]);

  const visibleUpdates = useMemo(() => {
    if (!Array.isArray(updates)) return [];

    if (type === 'attendance') {
      return updates.filter((u) => {
        const conducted = Number(u?.hours_conducted);
        const absent = Number(u?.hours_absent);
        return looksLikeCourseCode(u?.course_code)
          && Number.isFinite(conducted)
          && Number.isFinite(absent)
          && conducted > 0;
      });
    }

    if (type === 'marks') {
      return updates.filter((u) => {
        const obtained = Number(u?.marks_obtained);
        const max = Number(u?.max_marks);
        return looksLikeCourseCode(u?.course_code)
          && String(u?.assessment_type || '').trim().length > 0
          && Number.isFinite(obtained)
          && Number.isFinite(max)
          && max > 0;
      });
    }

    return [];
  }, [updates, type]);

  const lastSeenKey = useMemo(() => {
    if (!regNumber || !type) return '';
    return `academia_recent_updates_seen_${String(regNumber).toUpperCase()}_${type}`;
  }, [regNumber, type]);

  const latestUpdateMs = useMemo(() => {
    const latest = visibleUpdates.reduce((max, item) => {
      const t = new Date(item?.synced_at || 0).getTime();
      return Number.isFinite(t) ? Math.max(max, t) : max;
    }, 0);
    return Number.isFinite(latest) ? latest : 0;
  }, [visibleUpdates]);

  const hasNewUpdates = useMemo(() => {
    if (isDashboard) return true; // On dashboard, we show the recent summary regardless of "seen" state
    if (!lastSeenKey || latestUpdateMs <= 0) return false;
    const seenMs = Number(localStorage.getItem(lastSeenKey) || 0);
    return latestUpdateMs > seenMs;
  }, [lastSeenKey, latestUpdateMs, isDashboard]);

  const previewUpdates = useMemo(() => visibleUpdates.slice(0, 3), [visibleUpdates]);

  // Debug logging
  useEffect(() => {
    console.log('[RecentUpdatesBanner] State:', { type, updatesCount: updates.length, visibleCount: visibleUpdates.length, hasNewUpdates, loading, error: error || null });
  }, [updates, visibleUpdates, hasNewUpdates, loading, error, type]);

  const handleDismiss = () => {
    if (lastSeenKey && latestUpdateMs > 0) {
      localStorage.setItem(lastSeenKey, String(latestUpdateMs));
    }
    setDismissed(true);
  };

  if (loading || error || visibleUpdates.length === 0 || !hasNewUpdates || dismissed) return null;

  const isMarks = type === 'marks';
  const titleByType = isMarks ? 'Marks Updated' : 'Attendance Updated';

  return (
    <div className={`recent-updates-banner ${isMarks ? 'marks' : 'attendance'}`} role="status" aria-live="polite">
      <div className="recent-updates-head">
        <div>
          <span className="recent-updates-kicker">Recent updates</span>
          <h3>{titleByType}</h3>
        </div>
        <button
          type="button"
          className="recent-updates-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss recent updates"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="recent-updates-meta">
        {visibleUpdates.length} new {isMarks ? 'marks' : 'attendance'} update{visibleUpdates.length !== 1 ? 's' : ''} in the last 2 days.
      </p>

      <ul className="recent-updates-list">
        {previewUpdates.map((update) => (
          <li key={update.id} className="recent-updates-item">
            <span className="recent-updates-course">{update.course_code}</span>
            {isMarks ? (
              <span className="recent-updates-detail">
                {update.assessment_type}: {update.marks_obtained}/{update.max_marks}
              </span>
            ) : (
              <span className="recent-updates-detail">
                {update.hours_conducted} conducted, {update.hours_absent} absent
              </span>
            )}
          </li>
        ))}
      </ul>

      {visibleUpdates.length > 3 && (
        <p className="recent-updates-more">+{visibleUpdates.length - 3} more updates</p>
      )}
    </div>
  );
}
