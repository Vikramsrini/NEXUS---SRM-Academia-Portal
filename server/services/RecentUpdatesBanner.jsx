import React, { useEffect, useState } from 'react';

export default function RecentUpdatesBanner({ regNumber, type }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!regNumber) return;

    async function fetchUpdates() {
      try {
        const res = await fetch(`/api/recent-updates?regNumber=${regNumber}&days=7`);
        if (!res.ok) throw new Error('Failed to fetch updates');
        
        const data = await res.json();
        
        // Filter based on the tab using this component
        if (type === 'attendance') {
          setUpdates(data.attendanceUpdates);
        } else if (type === 'marks') {
          setUpdates(data.marksUpdates);
        }
      } catch (error) {
        console.error('Error fetching recent updates:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchUpdates();
  }, [regNumber, type]);

  if (loading || updates.length === 0) return null;

  return (
    <div style={{ padding: '16px', marginBottom: '16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#166534' }}>
        ⏱ Recently Updated (Last 7 Days)
      </h3>
      <ul style={{ margin: 0, paddingLeft: '20px', color: '#15803d' }}>
        {updates.map((update) => (
          <li key={update.id} style={{ marginBottom: '6px' }}>
            <strong>{update.course_code}</strong> was synced on {new Date(update.synced_at).toLocaleDateString()} at {new Date(update.synced_at).toLocaleTimeString()}
            
            {type === 'attendance' && (
              <span> - Now at {update.hours_conducted} conducted, {update.hours_absent} absent.</span>
            )}
            
            {type === 'marks' && (
              <span> - {update.assessment_type}: {update.marks_obtained}/{update.max_marks}.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}