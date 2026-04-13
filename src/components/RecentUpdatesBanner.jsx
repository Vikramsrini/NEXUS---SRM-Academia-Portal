import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../lib/api';

function looksLikeCourseCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return /^(?:\d{2})?[A-Z]{2,}\d+[A-Z0-9]*$/.test(code);
}

export default function RecentUpdatesBanner({ regNumber, type }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = useMemo(() => localStorage.getItem('academia_token') || '', []);

  useEffect(() => {
    if (!regNumber || !type) {
      setUpdates([]);
      setLoading(false);
      setError('');
      return;
    }

    let aborted = false;

    async function fetchUpdates() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ regNumber: String(regNumber), days: '7' });
        const res = await fetch(apiUrl(`/recent-updates?${params.toString()}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error('Failed to fetch updates');

        const data = await res.json();
        if (aborted) return;

        if (type === 'attendance') {
          setUpdates(Array.isArray(data.attendanceUpdates) ? data.attendanceUpdates : []);
        } else if (type === 'marks') {
          setUpdates(Array.isArray(data.marksUpdates) ? data.marksUpdates : []);
        } else {
          setUpdates([]);
        }
      } catch (error) {
        if (!aborted) {
          console.error('Error fetching recent updates:', error);
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
  }, [regNumber, token, type]);

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

  if (loading || error || visibleUpdates.length === 0) return null;

  const titleByType = type === 'marks' ? 'Recent Marks Updates (Last 7 Days)' : 'Recent Attendance Updates (Last 7 Days)';

  return (
    <div
      style={{
        padding: '14px 16px',
        marginBottom: '16px',
        borderRadius: '12px',
        border: '1px solid var(--border-active)',
        background: 'var(--accent-subtle)',
      }}
    >
      <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: 'var(--accent)' }}>
        {titleByType}
      </h3>
      <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)' }}>
        {visibleUpdates.map((update) => (
          <li key={update.id} style={{ marginBottom: '6px', lineHeight: 1.4 }}>
            <strong>{update.course_code}</strong> synced on{' '}
            {new Date(update.synced_at).toLocaleDateString()} at{' '}
            {new Date(update.synced_at).toLocaleTimeString()}
            {type === 'attendance' && (
              <span>
                {' '}
                - {update.hours_conducted} conducted, {update.hours_absent} absent.
              </span>
            )}
            {type === 'marks' && (
              <span>
                {' '}
                - {update.assessment_type}: {update.marks_obtained}/{update.max_marks}.
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
